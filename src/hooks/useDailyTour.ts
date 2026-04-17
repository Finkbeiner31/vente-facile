import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useCallback } from 'react';
import { getCurrentWeekNumber, getTodayDow } from '@/lib/weekCycleUtils';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

interface DailyTourStop {
  id: string;
  customer_id: string;
  stop_order: number;
  status: string;
  visit_duration_minutes: number | null;
  customer?: {
    id: string;
    company_name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    visit_frequency: string | null;
    number_of_vehicles: number | null;
    annual_revenue_potential: number | null;
    latitude: number | null;
    longitude: number | null;
    sales_potential: string | null;
    customer_type: string;
    last_visit_date: string | null;
  };
}

interface DailyTour {
  id: string;
  user_id: string;
  tour_date: string;
  zone_id: string | null;
  status: string;
  stops: DailyTourStop[];
}

export function useDailyTour(userId: string | undefined) {
  const queryClient = useQueryClient();
  const today = todayStr();

  // Fetch today's daily tour
  const { data: dailyTour, isLoading, refetch } = useQuery({
    queryKey: ['daily-tour', userId, today],
    queryFn: async (): Promise<DailyTour | null> => {
      const { data: tours } = await supabase
        .from('daily_tours')
        .select('*')
        .eq('user_id', userId!)
        .eq('tour_date', today)
        .limit(1);

      if (!tours?.length) return null;

      const tour = tours[0];
      const { data: stops } = await supabase
        .from('daily_tour_stops')
        .select('*, customer:customers(id, company_name, address, city, phone, visit_frequency, number_of_vehicles, annual_revenue_potential, latitude, longitude, sales_potential, customer_type, last_visit_date)')
        .eq('daily_tour_id', tour.id)
        .order('stop_order', { ascending: true });

      return {
        ...tour,
        stops: (stops || []) as DailyTourStop[],
      };
    },
    enabled: !!userId,
  });

  // Auto-generate tour from weekly planning
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('No user');

      const dow = getTodayDow();
      if (dow > 5) return null; // Weekend

      // Read configured cycle reference date for accurate week index.
      const { data: setting } = await (supabase as any)
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'cycle_start_date')
        .maybeSingle();
      const weekNumber = getCurrentWeekNumber(setting?.setting_value);

      // Get zone for today
      const { data: plannings } = await supabase
        .from('weekly_zone_planning')
        .select('zone_id')
        .eq('user_id', userId)
        .eq('week_number', weekNumber)
        .eq('day_of_week', dow)
        .limit(1);

      const zoneId = plannings?.[0]?.zone_id || null;

      // Create the daily tour
      const { data: newTour, error: tourError } = await supabase
        .from('daily_tours')
        .insert({ user_id: userId, tour_date: today, zone_id: zoneId, status: 'planned' })
        .select()
        .single();

      if (tourError) throw tourError;

      // If we have a zone, generate stops from zone customers
      if (zoneId) {
        const { data: zone } = await supabase
          .from('commercial_zones')
          .select('system_name, cities, postal_codes')
          .eq('id', zoneId)
          .single();

        if (zone) {
          const filters: string[] = [];
          filters.push(`zone.eq.${zone.system_name}`);
          if (zone.cities?.length > 0) {
            filters.push(`city.in.(${zone.cities.join(',')})`);
          }
          if (zone.postal_codes?.length > 0) {
            filters.push(`postal_code.in.(${zone.postal_codes.join(',')})`);
          }

          const { data: customers } = await supabase
            .from('customers')
            .select('id, company_name, annual_revenue_potential, sales_potential, last_visit_date, customer_type, visit_duration_minutes, assigned_rep_id, management_mode, exceptional_commercial_id')
            .in('customer_type', ['client_actif', 'prospect_qualifie', 'prospect'])
            .in('account_status', ['active'])
            .or(filters.join(','))
            .order('annual_revenue_potential', { ascending: false, nullsFirst: false });

          if (customers?.length) {
            // Filter by operational owner
            const myCustomers = customers.filter(c => {
              if (c.management_mode === 'exceptional') {
                return c.exceptional_commercial_id === userId;
              }
              return c.assigned_rep_id === userId;
            });

            // Score and pick top 8-12
            const now = new Date();
            const scored = myCustomers.map(c => {
              let priority = 0;
              const rev = Number(c.annual_revenue_potential || 0);
              priority += Math.min(rev / 1000, 100);
              if (c.sales_potential === 'A') priority += 30;
              else if (c.sales_potential === 'B') priority += 15;
              if (c.last_visit_date) {
                const daysSince = Math.floor((now.getTime() - new Date(c.last_visit_date).getTime()) / 86400000);
                if (daysSince > 30) priority += 25;
                else if (daysSince > 14) priority += 10;
              } else {
                priority += 20;
              }
              if (c.customer_type === 'prospect_qualifie') priority += 10;
              return { ...c, priority };
            });

            scored.sort((a, b) => b.priority - a.priority);
            const topStops = scored.slice(0, 12);

            if (topStops.length > 0) {
              const stopInserts = topStops.map((c, i) => ({
                daily_tour_id: newTour.id,
                customer_id: c.id,
                stop_order: i + 1,
                status: 'planned',
                visit_duration_minutes: c.visit_duration_minutes,
              }));

              await supabase.from('daily_tour_stops').insert(stopInserts);
            }
          }
        }
      }

      return newTour;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-tour', userId, today] });
    },
  });

  // Regenerate (delete existing + create new)
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('No user');
      // Delete existing daily tour for today (cascade deletes stops)
      await supabase
        .from('daily_tours')
        .delete()
        .eq('user_id', userId)
        .eq('tour_date', today);

      return generateMutation.mutateAsync();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-tour', userId, today] });
    },
  });

  const autoGenerate = useCallback(async () => {
    if (!userId || dailyTour !== null || isLoading) return;
    const dow = getTodayDow();
    if (dow > 5) return;
    await generateMutation.mutateAsync();
  }, [userId, dailyTour, isLoading]);

  return {
    dailyTour,
    isLoading,
    autoGenerate,
    regenerate: regenerateMutation.mutateAsync,
    isRegenerating: regenerateMutation.isPending,
    isGenerating: generateMutation.isPending,
    refetch,
  };
}
