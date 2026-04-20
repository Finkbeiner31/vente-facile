import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OptimizedRoute, RouteEndpoint } from '@/components/RouteOptimizerSheet';

export type TourHistoryStatus = 'optimized' | 'manual' | 'completed' | 'prepared';
export type TourHistorySource = 'auto' | 'manual';

/**
 * Snapshot of a single stop archived in tour_history.stops.
 * Stored as JSON — keep it minimal but complete enough to recreate the
 * tournée later AND verify each stop against current data.
 */
export interface TourHistoryStop {
  customer_id: string;
  company_name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  customer_type: string | null;
  visit_duration_minutes: number | null;
  annual_revenue_potential: number | null;
  order: number;
}

export interface TourHistoryEntry {
  id: string;
  user_id: string;
  tour_date: string;
  zone_id: string | null;
  zone_name: string | null;
  zone_color: string | null;
  week_number: number | null;
  day_of_week: number | null;
  departure: RouteEndpoint | null;
  arrival: RouteEndpoint | null;
  stops: TourHistoryStop[];
  stops_count: number;
  total_distance_km: number | null;
  total_travel_min: number | null;
  total_visit_min: number | null;
  estimated_duration_min: number | null;
  status: TourHistoryStatus;
  source: TourHistorySource;
  used_real_routing: boolean;
  notes: string | null;
  created_at: string;
}

interface ArchiveInput {
  userId: string;
  tourDate: string; // yyyy-mm-dd
  zoneId: string | null;
  zoneName: string | null;
  zoneColor: string | null;
  weekNumber: number | null;
  dayOfWeek: number | null;
  status: TourHistoryStatus;
  source: TourHistorySource;
  route: OptimizedRoute;
}

export function useTourHistory(userId: string | undefined) {
  return useQuery({
    queryKey: ['tour-history', userId],
    queryFn: async (): Promise<TourHistoryEntry[]> => {
      if (!userId) return [];
      const { data, error } = await (supabase as any)
        .from('tour_history')
        .select('*')
        .eq('user_id', userId)
        .order('tour_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as TourHistoryEntry[];
    },
    enabled: !!userId,
  });
}

export function useArchiveTour() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ArchiveInput) => {
      const stopsSnapshot: TourHistoryStop[] = input.route.customers.map((c, i) => ({
        customer_id: c.id,
        company_name: c.company_name,
        address: c.address ?? null,
        city: c.city ?? null,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        customer_type: (c as any).customer_type ?? null,
        visit_duration_minutes: (c as any).visitDuration ?? null,
        annual_revenue_potential: c.annual_revenue_potential ?? null,
        order: i + 1,
      }));

      const { data, error } = await (supabase as any)
        .from('tour_history')
        .insert({
          user_id: input.userId,
          tour_date: input.tourDate,
          zone_id: input.zoneId,
          zone_name: input.zoneName,
          zone_color: input.zoneColor,
          week_number: input.weekNumber,
          day_of_week: input.dayOfWeek,
          departure: input.route.departure ?? null,
          arrival: input.route.arrival ?? null,
          stops: stopsSnapshot,
          stops_count: stopsSnapshot.length,
          total_distance_km: input.route.totalDistanceKm ?? null,
          total_travel_min: input.route.totalTravelMin ?? null,
          total_visit_min: input.route.totalVisitMin ?? null,
          estimated_duration_min: input.route.estimatedDurationMin ?? null,
          status: input.status,
          source: input.source,
          used_real_routing: !!input.route.usedRealRouting,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as TourHistoryEntry;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tour-history', vars.userId] });
    },
  });
}

export function useDeleteTourHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; userId: string }) => {
      const { error } = await (supabase as any).from('tour_history').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tour-history', vars.userId] });
    },
  });
}
