import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import { TourMode } from '@/components/TourMode';
import {
  MapPin, Map as MapIcon, Zap,
  ChevronLeft, ChevronRight, Calendar, Target,
  RotateCcw, Loader2, Archive,
  Plus, Users, Route as RouteIcon,
  Navigation, Clock, Briefcase, Hourglass,
} from 'lucide-react';
import RouteOptimizerSheet from '@/components/RouteOptimizerSheet';
import type { OptimizedRoute } from '@/components/RouteOptimizerSheet';
import { formatDuration, haversineKm, estimateDriveMin } from '@/lib/tourneeOptimizer';
import { loadPrefs } from '@/lib/tourneePrefs';
import { useVisitDurationDefaults, getVisitDurationWithDefaults } from '@/hooks/useVisitDurationDefaults';
import ZoneMapPreviewDialog from '@/components/ZoneMapPreviewDialog';
import DayRouteMapDialog from '@/components/DayRouteMapDialog';
import { useTourSession } from '@/contexts/TourSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useCommercialZones, formatZoneName } from '@/hooks/useCommercialZones';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CustomerForRouting } from '@/lib/routeCycleEngine';
import { AddUnplannedVisitSheet } from '@/components/AddUnplannedVisitSheet';
import { TourneeDualList } from '@/components/TourneeDualList';
import { getCurrentWeekNumber, formatWeekRange } from '@/lib/weekCycleUtils';
import { useCycleStartDate } from '@/hooks/useCycleStartDate';
import { TourHistoryPanel } from '@/components/TourHistoryPanel';
import { ReuseTourDialog, type ReuseTarget } from '@/components/ReuseTourDialog';
import { useArchiveTour, type TourHistoryEntry } from '@/hooks/useTourHistory';
import { format, addDays, startOfWeek } from 'date-fns';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const WEEK_LABELS = ['S1', 'S2', 'S3', 'S4'];
const MIN_VISITS = 8;
const MAX_VISITS = 12;

interface ZonePlanning {
  id: string;
  user_id: string;
  day_of_week: number;
  zone_id: string | null;
}

interface ManualStop {
  customer: CustomerForRouting;
  priority: number;
  source: 'manual';
}

export default function RoutesPage() {
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;
  const { data: zones = [], isLoading: zonesLoading } = useCommercialZones();
  const { data: cycleStart } = useCycleStartDate();
  const queryClient = useQueryClient();

  const [selectedWeek, setSelectedWeek] = useState(() => getCurrentWeekNumber(cycleStart));
  const [autoSelected, setAutoSelected] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => {
    const dow = new Date().getDay();
    return dow >= 1 && dow <= 5 ? dow : 1;
  });

  // Once cycle start is loaded, snap to the active week the first time.
  useEffect(() => {
    if (cycleStart && !autoSelected) {
      setSelectedWeek(getCurrentWeekNumber(cycleStart));
      setAutoSelected(true);
    }
  }, [cycleStart, autoSelected]);

  const [reportOpen, setReportOpen] = useState(false);
  const [activeClient, setActiveClient] = useState('');
  const [tourMode, setTourMode] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const [zoneMapOpen, setZoneMapOpen] = useState(false);
  const [routeMapOpen, setRouteMapOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'planning' | 'history'>('planning');
  const [reuseEntry, setReuseEntry] = useState<TourHistoryEntry | null>(null);

  const [manualStops, setManualStops] = useState<Record<string, ManualStop[]>>({});
  // Tracks user-customized planned stops per day key
  const [customPlanned, setCustomPlanned] = useState<Record<string, { customer: CustomerForRouting; priority: number; customerType?: string; lastVisitDate?: string | null; visitDurationMinutes?: number | null }[]>>({});
  // Final optimized route per day key — single source of truth for the
  // "Trajet du jour" map AND the tournée list (A → clients → B).
  const [optimizedRoutes, setOptimizedRoutes] = useState<Record<string, OptimizedRoute>>({});

  const archiveMutation = useArchiveTour();

  const { session, startSession } = useTourSession();

  const dayKey = `${selectedWeek}-${selectedDay}`;

  const { data: planning = [] } = useQuery({
    queryKey: ['weekly-zone-planning', activeUserId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('weekly_zone_planning')
        .select('*')
        .eq('user_id', activeUserId!);
      if (error) throw error;
      return (data || []) as ZonePlanning[];
    },
    enabled: !!activeUserId,
  });

  const todayZoneId = useMemo(() => {
    const p = planning.find(p => p.day_of_week === selectedDay && (p as any).week_number === selectedWeek);
    return p?.zone_id || null;
  }, [planning, selectedDay, selectedWeek]);

  const todayZone = zones.find(z => z.id === todayZoneId);

  const { data: zoneCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['zone-customers', todayZoneId, activeUserId],
    queryFn: async () => {
      if (!todayZoneId || !activeUserId) return [];
      const zone = zones.find(z => z.id === todayZoneId);
      if (!zone) return [];

      const filters: string[] = [];
      filters.push(`zone.eq.${zone.system_name}`);
      if (zone.cities.length > 0) {
        filters.push(`city.in.(${zone.cities.join(',')})`);
      }
      if (zone.postal_codes.length > 0) {
        filters.push(`postal_code.in.(${zone.postal_codes.join(',')})`);
      }

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .in('customer_type', ['client_actif', 'prospect_qualifie', 'prospect'])
        .or(filters.join(','))
        .order('annual_revenue_potential', { ascending: false, nullsFirst: false });
      if (error) throw error;

      // Filter by operational owner: include only clients where this user is the operational commercial
      return ((data || []) as any[]).filter(c => {
        const isExceptional = c.management_mode === 'exceptional';
        if (isExceptional) {
          // Exceptional: only the exceptional commercial sees this client
          return c.exceptional_commercial_id === activeUserId;
        }
        // Standard: only the principal commercial sees this client
        return c.assigned_rep_id === activeUserId;
      });
    },
    enabled: !!todayZoneId && zones.length > 0 && !!activeUserId,
  });

  const autoStops = useMemo(() => {
    const now = new Date();
    return zoneCustomers
      .map(c => {
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
        return {
          customer: {
            id: c.id,
            company_name: c.company_name,
            address: c.address,
            city: c.city,
            phone: c.phone,
            visit_frequency: c.visit_frequency,
            number_of_vehicles: c.number_of_vehicles || 0,
            annual_revenue_potential: rev,
            latitude: c.latitude,
            longitude: c.longitude,
            sales_potential: c.sales_potential,
          } as CustomerForRouting,
          priority,
          source: 'auto' as const,
          customerType: c.customer_type,
          lastVisitDate: c.last_visit_date,
          visitDurationMinutes: c.visit_duration_minutes ?? null,
        };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_VISITS);
  }, [zoneCustomers]);

  const currentManual = manualStops[dayKey] || [];
  const allStops = useMemo(() => {
    // If user has customized the planned list (via dual list drag-and-drop), use that
    if (customPlanned[dayKey]) {
      const customIds = new Set(customPlanned[dayKey].map(s => s.customer.id));
      const filteredManual = currentManual.filter(m => !customIds.has(m.customer.id));
      return [
        ...customPlanned[dayKey].map(s => ({ ...s, source: 'custom' as const })),
        ...filteredManual.map(s => ({ ...s, source: 'manual' as const })),
      ];
    }
    // Otherwise use auto-generated stops
    const autoIds = new Set(autoStops.map(s => s.customer.id));
    const filteredManual = currentManual.filter(m => !autoIds.has(m.customer.id));
    return [
      ...autoStops.map(s => ({ ...s, source: 'auto' as const })),
      ...filteredManual.map(s => ({ ...s, source: 'manual' as const })),
    ];
  }, [autoStops, currentManual, customPlanned, dayKey]);

  const totalPlanned = allStops.length;
  const isUnderTarget = totalPlanned < MIN_VISITS;
  const isAtTarget = totalPlanned >= MIN_VISITS && totalPlanned <= MAX_VISITS;
  const isOverTarget = totalPlanned > MAX_VISITS;

  const { data: durationDefaults } = useVisitDurationDefaults();

  // ── Derived route summary from the CURRENT "Tournée du jour" ──
  // The visible list is the single source of truth: any add / remove /
  // reorder — and even an initial load with no prior optimization —
  // immediately yields distance, drive time, visit time and total
  // estimated time. Departure (A) / arrival (B) come from the last
  // optimization run if present, otherwise the route is computed from
  // the stops alone.
  const derivedRoute = useMemo<OptimizedRoute | null>(() => {
    if (!todayZoneId || !durationDefaults) return null;
    if (allStops.length === 0) return null;

    const existing = optimizedRoutes[dayKey];
    const dep = existing?.departure ?? null;
    const arr = existing?.arrival ?? null;

    let totalKm = 0;
    let prevLat: number | null = dep?.lat ?? null;
    let prevLng: number | null = dep?.lng ?? null;
    for (const s of allStops) {
      const lat = s.customer.latitude;
      const lng = s.customer.longitude;
      if (prevLat != null && prevLng != null && lat != null && lng != null) {
        totalKm += haversineKm(prevLat, prevLng, lat, lng);
      }
      if (lat != null && lng != null) { prevLat = lat; prevLng = lng; }
    }
    if (arr && prevLat != null && prevLng != null) {
      totalKm += haversineKm(prevLat, prevLng, arr.lat, arr.lng);
    }

    const totalTravelMin = estimateDriveMin(totalKm);
    const totalVisitMin = allStops.reduce((sum, s) => {
      const type = ('customerType' in s ? (s as any).customerType : undefined) || 'client_actif';
      const profileDur = ('visitDurationMinutes' in s ? (s as any).visitDurationMinutes : null) ?? null;
      return sum + getVisitDurationWithDefaults(type, profileDur, durationDefaults);
    }, 0);

    return {
      ...(existing ?? {} as OptimizedRoute),
      departure: dep,
      arrival: arr,
      customers: allStops.map((s, i) => {
        const prior = existing?.customers.find(c => c.id === s.customer.id);
        const base = prior || ({
          id: s.customer.id,
          company_name: s.customer.company_name,
          address: s.customer.address,
          city: s.customer.city,
          phone: s.customer.phone,
          visit_frequency: s.customer.visit_frequency,
          number_of_vehicles: s.customer.number_of_vehicles,
          annual_revenue_potential: s.customer.annual_revenue_potential,
          latitude: s.customer.latitude,
          longitude: s.customer.longitude,
          sales_potential: s.customer.sales_potential,
        } as any);
        return { ...base, order: i + 1 } as any;
      }),
      totalDistanceKm: Math.round(totalKm * 10) / 10,
      totalTravelMin,
      totalVisitMin,
      estimatedDurationMin: totalTravelMin + totalVisitMin,
      // Manual edits invalidate any cached Google road polyline — fall back
      // to a straight A→stops→B preview from the current order.
      usedRealRouting: existing?.usedRealRouting && existing.customers.length === allStops.length
        && existing.customers.every((c, i) => c.id === allStops[i]?.customer.id)
        ? existing.usedRealRouting : false,
      path: existing?.usedRealRouting && existing.customers.length === allStops.length
        && existing.customers.every((c, i) => c.id === allStops[i]?.customer.id)
        ? existing.path : [],
    } as OptimizedRoute;
  }, [allStops, dayKey, todayZoneId, durationDefaults, optimizedRoutes]);


  const assignZoneMutation = useMutation({
    mutationFn: async ({ dayOfWeek, zoneId, weekNumber }: { dayOfWeek: number; zoneId: string | null; weekNumber: number }) => {
      if (!activeUserId) throw new Error('Non connecté');
      const { error } = await (supabase as any)
        .from('weekly_zone_planning')
        .upsert(
          { user_id: activeUserId, week_number: weekNumber, day_of_week: dayOfWeek, zone_id: zoneId },
          { onConflict: 'user_id,week_number,day_of_week' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-zone-planning', activeUserId] });
      toast.success('Planning mis à jour');
    },
    onError: () => toast.error('Impossible d\'enregistrer la zone pour ce jour'),
  });

  const getZoneForDay = (day: number) => {
    const p = planning.find(p => p.day_of_week === day && (p as any).week_number === selectedWeek);
    return p?.zone_id || undefined;
  };

  const getZoneColor = (zoneId: string | undefined) => {
    if (!zoneId) return undefined;
    return zones.find(z => z.id === zoneId)?.color;
  };

  const handleStartTour = () => {
    const stops = allStops.map(s => ({ customer: s.customer, priority: s.priority }));
    startSession(selectedDay, stops);
    setTourMode(true);
  };

  const handleResumeTour = () => setTourMode(true);

  if (tourMode && session?.active) {
    return (
      <TourMode
        onExit={() => setTourMode(false)}
        allCustomers={allStops.map(s => s.customer)}
      />
    );
  }

  const handleAddExistingCustomer = (customer: CustomerForRouting, position: 'next' | 'end' | 'manual') => {
    const priority = customer.annual_revenue_potential >= 50000 ? 60 : customer.annual_revenue_potential >= 20000 ? 30 : 10;
    setManualStops(prev => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] || []), { customer, priority, source: 'manual' }],
    }));
    toast.success(`${customer.company_name} ajouté à la journée`);
  };

  const handleAddProspect = (data: any, position: 'next' | 'end' | 'manual') => {
    const prospectCustomer: CustomerForRouting = {
      id: `prospect-${Date.now()}`,
      company_name: data.company_name,
      address: data.address || null,
      city: data.city,
      phone: data.contact_name ? data.phone : null,
      visit_frequency: null,
      number_of_vehicles: data.number_of_vehicles || 0,
      annual_revenue_potential: (data.number_of_vehicles || 0) * 3500,
      latitude: null,
      longitude: null,
      sales_potential: null,
    };
    setManualStops(prev => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] || []), { customer: prospectCustomer, priority: 30, source: 'manual' }],
    }));
    toast.success(`${data.company_name} ajouté`);
  };

  const handleRouteGenerated = (route: OptimizedRoute) => {
    setCustomPlanned(prev => ({
      ...prev,
      [dayKey]: route.customers.map((customer, index) => ({
        customer: {
          id: customer.id,
          company_name: customer.company_name,
          address: customer.address,
          city: customer.city,
          phone: customer.phone,
          visit_frequency: customer.visit_frequency,
          number_of_vehicles: customer.number_of_vehicles,
          annual_revenue_potential: customer.annual_revenue_potential,
          latitude: customer.latitude,
          longitude: customer.longitude,
          sales_potential: customer.sales_potential,
        },
        priority: Math.max(route.customers.length - index, 1),
        customerType: customer.customer_type,
        lastVisitDate: customer.last_visit_date,
        visitDurationMinutes: customer.visitDuration,
      })),
    }));
    // Persist the FULL optimized route (with A/B + path) as the single source
    // of truth for both the map and the tournée list.
    setOptimizedRoutes(prev => ({ ...prev, [dayKey]: route }));
  };

  // Compute the actual calendar date of a (week, day) pair from the cycle start.
  const dayKeyToDate = (week: number, day: number): string => {
    const base = cycleStart ? new Date(cycleStart) : new Date();
    const monday = startOfWeek(base, { weekStartsOn: 1 });
    const target = addDays(monday, week * 7 + (day - 1));
    return format(target, 'yyyy-MM-dd');
  };

  const handleArchiveCurrent = async () => {
    if (!activeUserId || !derivedRoute || allStops.length === 0) return;
    const status = optimizedRoutes[dayKey] ? 'optimized' : 'manual';
    try {
      await archiveMutation.mutateAsync({
        userId: activeUserId,
        tourDate: dayKeyToDate(selectedWeek, selectedDay),
        zoneId: todayZoneId,
        zoneName: todayZone ? formatZoneName(todayZone) : null,
        zoneColor: todayZone?.color ?? null,
        weekNumber: selectedWeek,
        dayOfWeek: selectedDay,
        status,
        source: optimizedRoutes[dayKey] ? 'auto' : 'manual',
        route: derivedRoute,
      });
      toast.success('Tournée archivée dans l\'historique');
    } catch {
      toast.error('Échec de l\'archivage');
    }
  };

  const isDayFilled = (week: number, day: number) => {
    const k = `${week}-${day}`;
    return (customPlanned[k]?.length ?? 0) + (manualStops[k]?.length ?? 0) > 0;
  };

  const handleConfirmReuse = (target: ReuseTarget) => {
    if (!reuseEntry) return;
    const targetKey = `${target.weekNumber}-${target.dayOfWeek}`;
    // Build the customPlanned snapshot from validated stops — becomes the
    // single source of truth for the target day. The route summary will
    // recompute automatically from `allStops`.
    const newStops = target.validStops.map(s => ({
      customer: {
        id: s.customer_id,
        company_name: s.company_name,
        address: s.address,
        city: s.city,
        phone: null,
        visit_frequency: null,
        number_of_vehicles: 0,
        annual_revenue_potential: Number(s.annual_revenue_potential || 0),
        latitude: s.latitude,
        longitude: s.longitude,
        sales_potential: null,
      } as CustomerForRouting,
      priority: Math.max(target.validStops.length - s.order, 1),
      customerType: s.customer_type ?? undefined,
      lastVisitDate: null as string | null,
      visitDurationMinutes: s.visit_duration_minutes,
    }));
    setCustomPlanned(prev => ({ ...prev, [targetKey]: newStops }));
    setManualStops(prev => ({ ...prev, [targetKey]: [] }));
    // Reset any cached optimized route so derivedRoute recomputes fresh
    // metrics (distance, drive time, total) from the reused order.
    setOptimizedRoutes(prev => {
      const next = { ...prev };
      delete next[targetKey];
      // Keep just the endpoints from the source if the target zone matches
      if (reuseEntry.departure || reuseEntry.arrival) {
        next[targetKey] = {
          customers: [],
          totalDistanceKm: 0,
          totalTravelMin: 0,
          totalVisitMin: 0,
          estimatedDurationMin: 0,
          departure: reuseEntry.departure,
          arrival: reuseEntry.arrival,
          usedRealRouting: false,
          path: [],
        };
      }
      return next;
    });
    setSelectedWeek(target.weekNumber);
    setSelectedDay(target.dayOfWeek);
    setActiveTab('planning');
    setReuseEntry(null);
    const skipped = target.warnings.filter(w => w.type === 'missing').length;
    toast.success(
      `Tournée réutilisée — ${newStops.length} étape(s)` +
      (skipped > 0 ? ` (${skipped} ignorée(s))` : ''),
    );
  };

  const sessionCompletedCount = session ? Object.values(session.statuses).filter(s => s === 'completed').length : 0;

  const stopIds = new Set(allStops.map(s => s.customer.id));
  const availableForAdd = zoneCustomers
    .filter(c => !stopIds.has(c.id))
    .map(c => ({
      id: c.id,
      company_name: c.company_name,
      address: c.address,
      city: c.city,
      phone: c.phone,
      visit_frequency: c.visit_frequency,
      number_of_vehicles: c.number_of_vehicles || 0,
      annual_revenue_potential: Number(c.annual_revenue_potential || 0),
      latitude: c.latitude,
      longitude: c.longitude,
      sales_potential: c.sales_potential,
    } as CustomerForRouting));

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* Active tour resume banner */}
      {session?.active && !tourMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Tournée en cours</p>
                <p className="text-xs text-muted-foreground">{sessionCompletedCount} / {session.stops.length} visites</p>
              </div>
              <Button size="sm" className="h-10 px-4 font-semibold shrink-0 gap-1.5" onClick={handleResumeTour}>
                <RotateCcw className="h-4 w-4" />Reprendre
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl md:text-2xl font-bold">Tournée</h1>
          <p className="text-xs text-muted-foreground">Planning 4 semaines par zone géographique</p>
        </div>
        {activeTab === 'planning' && allStops.length > 0 && todayZoneId && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs gap-1.5 shrink-0"
            onClick={handleArchiveCurrent}
            disabled={archiveMutation.isPending}
          >
            <Archive className="h-3.5 w-3.5" />
            Archiver cette tournée
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'planning' | 'history')}>
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid">
          <TabsTrigger value="planning" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />Planning
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planning" className="space-y-4 mt-4">
      {/* Week selector with date ranges */}
      <div className="flex gap-1.5">
        {WEEK_LABELS.map((label, i) => {
          const isActive = i === selectedWeek;
          const isCurrent = i === getCurrentWeekNumber(cycleStart);
          return (
            <button
              key={i}
              onClick={() => setSelectedWeek(i)}
              className={`flex-1 rounded-lg py-1.5 px-1 text-center transition-all leading-tight ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-xs font-semibold">{label}</span>
                {isCurrent && (
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-primary-foreground' : 'bg-primary'}`} />
                )}
              </div>
              <div className={`text-[10px] mt-0.5 ${isActive ? 'opacity-90' : 'opacity-70'}`}>
                {formatWeekRange(i, cycleStart)}
              </div>
            </button>
          );
        })}
      </div>
      {getCurrentWeekNumber(cycleStart) !== selectedWeek && (
        <button
          onClick={() => setSelectedWeek(getCurrentWeekNumber(cycleStart))}
          className="text-[11px] text-primary hover:underline self-start"
        >
          ← Revenir à la semaine en cours ({WEEK_LABELS[getCurrentWeekNumber(cycleStart)]})
        </button>
      )}

      {/* Day selector with zone colors */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => {
            if (selectedDay === 1) {
              if (selectedWeek > 0) { setSelectedWeek(w => w - 1); setSelectedDay(5); }
            } else {
              setSelectedDay(d => d - 1);
            }
          }}
          disabled={selectedWeek === 0 && selectedDay === 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex gap-1 justify-center">
          {[1, 2, 3, 4, 5].map(d => {
            const zoneId = getZoneForDay(d);
            const zoneColor = getZoneColor(zoneId);
            const isSelected = d === selectedDay;
            return (
              <button key={d} onClick={() => setSelectedDay(d)}
                className={`flex-1 max-w-[72px] rounded-xl px-1.5 py-2 text-center transition-all ${
                  isSelected ? 'ring-2 ring-primary shadow-sm' : 'border border-border hover:border-primary/30'
                }`}
                style={zoneColor ? { borderColor: zoneColor, borderWidth: '2px' } : undefined}>
                <span className="block text-xs font-semibold">{DAY_NAMES[d - 1].slice(0, 3)}</span>
                {zoneColor && <div className="h-1 w-full rounded-full mt-1" style={{ backgroundColor: zoneColor }} />}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => {
            if (selectedDay === 5) {
              if (selectedWeek < 3) { setSelectedWeek(w => w + 1); setSelectedDay(1); }
            } else {
              setSelectedDay(d => d + 1);
            }
          }}
          disabled={selectedWeek === 3 && selectedDay === 5}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Zone assignment for selected day */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {WEEK_LABELS[selectedWeek]} · {DAY_NAMES[selectedDay - 1]}
              </p>
            </div>
            <Select
              value={todayZoneId || 'none'}
              onValueChange={v => assignZoneMutation.mutate({ dayOfWeek: selectedDay, zoneId: v === 'none' ? null : v, weekNumber: selectedWeek })}
            >
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Choisir une zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune zone</SelectItem>
                {zones.map(z => (
                  <SelectItem key={z.id} value={z.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                      {formatZoneName(z)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Zone info + target bar + Optimize button */}
      {todayZone && (
        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: `${todayZone.color}40` }}>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: todayZone.color }} />
            <span className="text-sm font-bold" style={{ color: todayZone.color }}>{formatZoneName(todayZone)}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs gap-1.5"
              onClick={() => setZoneMapOpen(true)}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Voir la zone
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs gap-1.5"
              onClick={() => setRouteMapOpen(true)}
              disabled={allStops.length === 0}
            >
              <RouteIcon className="h-3.5 w-3.5" />
              Voir le trajet du jour
            </Button>
            {/* Optimize button - prominent placement */}
            <Button
              size="sm"
              className="ml-auto h-9 px-4 font-bold text-xs gap-1.5 shadow-sm"
              onClick={() => setOptimizerOpen(true)}
            >
              <Zap className="h-4 w-4" />
              Optimiser ma tournée
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{zoneCustomers.length} clients dans la zone</span>
            <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />Objectif : {MIN_VISITS}–{MAX_VISITS}</span>
          </div>
          {/* Target progress */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isAtTarget ? 'bg-primary' : isUnderTarget ? 'bg-warning' : 'bg-accent'
                }`}
                style={{ width: `${Math.min((totalPlanned / MAX_VISITS) * 100, 100)}%` }}
              />
            </div>
            <span className={`text-xs font-bold ${
              isAtTarget ? 'text-primary' : isUnderTarget ? 'text-warning' : 'text-accent'
            }`}>
              {totalPlanned}/{MAX_VISITS}
            </span>
          </div>
          {isUnderTarget && (
            <p className="text-[11px] text-warning font-medium">
              ⚠ {MIN_VISITS - totalPlanned} visite(s) manquante(s) pour atteindre le minimum
            </p>
          )}
          {isAtTarget && (
            <p className="text-[11px] text-primary font-medium">✓ Objectif atteint</p>
          )}
        </div>
      )}

      {/* Day route summary metrics — auto-derived from current "Tournée du jour" */}
      {todayZoneId && (() => {
        const route = derivedRoute;
        if (!route || route.customers.length === 0) {
          return (
            <Card className="border-dashed">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Navigation className="h-3.5 w-3.5" />
                  <span>Trajet non encore défini — ajoutez des visites à la tournée du jour pour voir le résumé.</span>
                </div>
              </CardContent>
            </Card>
          );
        }
        const targetMin = (loadPrefs(activeUserId).workdayTargetHours || 8) * 60;
        const total = route.estimatedDurationMin;
        const gap = total - targetMin;
        const gapAbs = Math.abs(gap);
        const gapTone =
          gapAbs <= 30 ? 'text-primary' :
          gap > 0 ? 'text-accent' : 'text-warning';
        const gapLabel =
          gapAbs <= 30 ? 'Alignée' :
          gap > 0 ? `+${formatDuration(gapAbs)} vs objectif` : `−${formatDuration(gapAbs)} vs objectif`;
        return (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Résumé du trajet</p>
                <span className={`text-[11px] font-semibold ${gapTone}`}>
                  Objectif {Math.round(targetMin / 60)}h — {gapLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Navigation className="h-3 w-3" />Distance
                  </div>
                  <p className="text-base font-bold mt-0.5">{route.totalDistanceKm} km</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />Conduite
                  </div>
                  <p className="text-base font-bold mt-0.5">{formatDuration(route.totalTravelMin)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Briefcase className="h-3 w-3" />Visites
                  </div>
                  <p className="text-base font-bold mt-0.5">{formatDuration(route.totalVisitMin)}</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-primary">
                    <Hourglass className="h-3 w-3" />Total estimé
                  </div>
                  <p className="text-base font-bold mt-0.5 text-primary">{formatDuration(route.estimatedDurationMin)}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Résumé mis à jour automatiquement</p>
            </CardContent>
          </Card>
        );
      })()}

      {!todayZoneId && !zonesLoading && (
        <div className="py-12 text-center">
          <MapPin className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            {zones.length === 0
              ? 'Créez vos zones dans Administration → Zones'
              : 'Assignez une zone à ce jour pour générer la tournée'}
          </p>
        </div>
      )}

      {/* Loading */}
      {todayZoneId && customersLoading && (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {/* Dual list: Planned + Available */}
      {todayZoneId && !customersLoading && (
        <>
          <TourneeDualList
            plannedStops={allStops.map(s => ({
              customer: s.customer,
              priority: s.priority,
              customerType: 'customerType' in s ? (s as any).customerType : undefined,
              lastVisitDate: 'lastVisitDate' in s ? (s as any).lastVisitDate : null,
              visitDurationMinutes: 'visitDurationMinutes' in s ? (s as any).visitDurationMinutes : null,
            }))}
            availableCustomers={zoneCustomers}
            departure={optimizedRoutes[dayKey]?.departure ?? null}
            arrival={optimizedRoutes[dayKey]?.arrival ?? null}
            onUpdatePlanned={(newStops) => {
              setCustomPlanned(prev => ({ ...prev, [dayKey]: newStops }));
              // The route summary auto-recomputes from the new manual order
              // via the useEffect above (single source of truth = list).
              // We keep the existing departure (A) / arrival (B) endpoints.
            }}
          />

          {/* Add client outside zone */}
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              className="flex-1 h-11 text-sm font-semibold gap-2 border-dashed border-primary/30 text-primary"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-4 w-4" />Ajouter un client hors zone
            </Button>
          </div>
        </>
      )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <TourHistoryPanel onReuse={(e) => setReuseEntry(e)} />
        </TabsContent>
      </Tabs>

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={activeClient} />
      <RouteOptimizerSheet
        open={optimizerOpen}
        onOpenChange={setOptimizerOpen}
        onRouteGenerated={handleRouteGenerated}
        zone={todayZone ? { id: todayZone.id, system_name: todayZone.system_name, custom_label: todayZone.custom_label, color: todayZone.color } : null}
        zoneCustomers={zoneCustomers}
        dayLabel={`${WEEK_LABELS[selectedWeek]} · ${DAY_NAMES[selectedDay - 1]}`}
      />
      <ZoneMapPreviewDialog
        open={zoneMapOpen}
        onOpenChange={setZoneMapOpen}
        zone={todayZone || null}
        customers={zoneCustomers as any}
      />
      <DayRouteMapDialog
        open={routeMapOpen}
        onOpenChange={setRouteMapOpen}
        zoneColor={todayZone?.color || null}
        zoneName={todayZone ? formatZoneName(todayZone) : null}
        dayLabel={`${WEEK_LABELS[selectedWeek]} · ${DAY_NAMES[selectedDay - 1]}`}
        optimizedRoute={derivedRoute || optimizedRoutes[dayKey] || null}
        stops={allStops.map(s => {
          const full = zoneCustomers.find((c: any) => c.id === s.customer.id) as any;
          return {
            id: s.customer.id,
            company_name: s.customer.company_name,
            city: s.customer.city,
            latitude: s.customer.latitude,
            longitude: s.customer.longitude,
            customer_type: full?.customer_type ?? ('customerType' in s ? (s as any).customerType : null),
            relationship_type: full?.relationship_type ?? null,
            visit_duration_minutes: full?.visit_duration_minutes ?? ('visitDurationMinutes' in s ? (s as any).visitDurationMinutes : null),
            annual_revenue_potential: s.customer.annual_revenue_potential,
            last_visit_date: full?.last_visit_date ?? ('lastVisitDate' in s ? (s as any).lastVisitDate : null),
          };
        })}
      />
      <AddUnplannedVisitSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        existingCustomers={availableForAdd}
        currentIndex={0}
        totalStops={allStops.length}
        onAddProspect={handleAddProspect}
        onAddExistingCustomer={handleAddExistingCustomer}
      />
      <ReuseTourDialog
        entry={reuseEntry}
        open={!!reuseEntry}
        onOpenChange={(o) => !o && setReuseEntry(null)}
        defaultWeek={selectedWeek}
        defaultDay={selectedDay}
        isDayFilled={isDayFilled}
        onConfirm={handleConfirmReuse}
      />
    </div>
  );
}
