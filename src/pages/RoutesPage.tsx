import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import { TourMode } from '@/components/TourMode';
import {
  MapPin, Play, Square, Phone, Navigation, Sparkles,
  ChevronLeft, ChevronRight, Calendar, Target,
  Sun, RotateCcw, Loader2, AlertTriangle, Clock, Star,
} from 'lucide-react';
import RouteOptimizerSheet from '@/components/RouteOptimizerSheet';
import { useTourSession } from '@/contexts/TourSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCommercialZones } from '@/hooks/useCommercialZones';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CustomerForRouting } from '@/lib/routeCycleEngine';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const DAY_SHORT = ['L', 'M', 'Me', 'J', 'V'];

type StopStatus = 'planned' | 'in_progress' | 'completed';

interface ZonePlanning {
  id: string;
  user_id: string;
  day_of_week: number;
  zone_id: string | null;
}

export default function RoutesPage() {
  const { user } = useAuth();
  const { data: zones = [], isLoading: zonesLoading } = useCommercialZones();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState(() => {
    const dow = new Date().getDay();
    return dow >= 1 && dow <= 5 ? dow : 1;
  });
  const [statuses, setStatuses] = useState<Record<string, StopStatus>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [activeClient, setActiveClient] = useState('');
  const [tourMode, setTourMode] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const { session, startSession } = useTourSession();

  // Load weekly zone planning for current user
  const { data: planning = [] } = useQuery({
    queryKey: ['weekly-zone-planning', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('weekly_zone_planning')
        .select('*')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data || []) as ZonePlanning[];
    },
    enabled: !!user,
  });

  // Get today's zone
  const todayZoneId = useMemo(() => {
    const p = planning.find(p => p.day_of_week === selectedDay);
    return p?.zone_id || null;
  }, [planning, selectedDay]);

  const todayZone = zones.find(z => z.id === todayZoneId);

  // Load customers for the selected zone
  const { data: zoneCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['zone-customers', todayZoneId],
    queryFn: async () => {
      if (!todayZoneId) return [];
      const zone = zones.find(z => z.id === todayZoneId);
      if (!zone) return [];

      // Fetch customers matching zone name, cities, or postal codes
      let query = supabase
        .from('customers')
        .select('*')
        .in('customer_type', ['client_actif', 'prospect_qualifie'])
        .order('annual_revenue_potential', { ascending: false, nullsFirst: false });

      // Build OR filter: zone name match OR city in zone.cities OR postal_code in zone.postal_codes
      const filters: string[] = [];
      filters.push(`zone.eq.${zone.system_name}`);
      if (zone.cities.length > 0) {
        filters.push(`city.in.(${zone.cities.join(',')})`);
      }
      if (zone.postal_codes.length > 0) {
        filters.push(`postal_code.in.(${zone.postal_codes.join(',')})`);
      }

      const { data, error } = await query.or(filters.join(','));
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!todayZoneId && zones.length > 0,
  });

  // Prioritize and limit to 10
  const todayStops = useMemo(() => {
    const now = new Date();
    return zoneCustomers
      .map(c => {
        let priority = 0;
        const rev = Number(c.annual_revenue_potential || 0);
        priority += Math.min(rev / 1000, 100);
        if (c.sales_potential === 'A') priority += 30;
        else if (c.sales_potential === 'B') priority += 15;
        // Overdue boost
        if (c.last_visit_date) {
          const daysSince = Math.floor((now.getTime() - new Date(c.last_visit_date).getTime()) / 86400000);
          if (daysSince > 30) priority += 20;
          else if (daysSince > 14) priority += 10;
        } else {
          priority += 25; // never visited
        }
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
            last_visit_date: c.last_visit_date,
            customer_type: c.customer_type,
          },
          priority,
        };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10);
  }, [zoneCustomers]);

  // Save zone assignment per day
  const assignZoneMutation = useMutation({
    mutationFn: async ({ dayOfWeek, zoneId }: { dayOfWeek: number; zoneId: string | null }) => {
      if (!user) throw new Error('Non connecté');
      const { error } = await (supabase as any)
        .from('weekly_zone_planning')
        .upsert({ user_id: user.id, day_of_week: dayOfWeek, zone_id: zoneId }, { onConflict: 'user_id,day_of_week' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-zone-planning'] });
      toast.success('Planning mis à jour');
    },
    onError: () => toast.error('Erreur de mise à jour'),
  });

  const getZoneForDay = (day: number) => {
    const p = planning.find(p => p.day_of_week === day);
    return p?.zone_id || undefined;
  };

  const getZoneColor = (zoneId: string | undefined) => {
    if (!zoneId) return undefined;
    return zones.find(z => z.id === zoneId)?.color;
  };

  // Tour mode
  const handleStartTour = () => {
    const stops = todayStops.map(s => ({ customer: s.customer as CustomerForRouting, priority: s.priority }));
    startSession(selectedDay, stops);
    setTourMode(true);
  };

  const handleResumeTour = () => setTourMode(true);

  if (tourMode && session?.active) {
    return (
      <TourMode
        onExit={() => setTourMode(false)}
        allCustomers={todayStops.map(s => s.customer) as CustomerForRouting[]}
      />
    );
  }

  const completedCount = todayStops.filter(s => statuses[`${selectedDay}-${s.customer.id}`] === 'completed').length;
  const inProgressStop = todayStops.find(s => statuses[`${selectedDay}-${s.customer.id}`] === 'in_progress');
  const sessionCompletedCount = session ? Object.values(session.statuses).filter(s => s === 'completed').length : 0;

  const getStatus = (customerId: string): StopStatus => statuses[`${selectedDay}-${customerId}`] || 'planned';

  const handleStart = (customerId: string) => {
    setStatuses(prev => ({ ...prev, [`${selectedDay}-${customerId}`]: 'in_progress' }));
  };

  const handleEnd = (customerId: string, clientName: string) => {
    setStatuses(prev => ({ ...prev, [`${selectedDay}-${customerId}`]: 'completed' }));
    setActiveClient(clientName);
    setReportOpen(true);
  };

  const getOverdueBadge = (lastVisitDate: string | null) => {
    if (!lastVisitDate) return <Badge className="bg-primary/15 text-primary text-[9px] h-4 shrink-0">Nouveau</Badge>;
    const days = Math.floor((Date.now() - new Date(lastVisitDate).getTime()) / 86400000);
    if (days > 30) return <Badge className="bg-destructive/15 text-destructive text-[9px] h-4 shrink-0">En retard</Badge>;
    return null;
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 60) return <Badge className="bg-accent/15 text-accent text-[9px] h-4 shrink-0">★ Prioritaire</Badge>;
    return null;
  };

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
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">Tournée</h1>
        <p className="text-xs text-muted-foreground">Planning hebdomadaire par zone géographique</p>
      </div>

      {/* Day selector with zone colors */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => setSelectedDay(d => Math.max(1, d - 1))} disabled={selectedDay === 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex gap-1.5 justify-center">
          {[1, 2, 3, 4, 5].map(d => {
            const zoneId = getZoneForDay(d);
            const zoneColor = getZoneColor(zoneId);
            const isSelected = d === selectedDay;
            return (
              <button key={d} onClick={() => setSelectedDay(d)}
                className={`flex-1 max-w-[80px] rounded-xl px-2 py-2 text-center transition-all ${
                  isSelected ? 'ring-2 ring-primary shadow-sm' : 'border border-border hover:border-primary/30'
                }`}
                style={zoneColor ? { borderColor: zoneColor, borderWidth: '2px' } : undefined}>
                <span className="block text-xs font-semibold">{DAY_SHORT[d - 1]}</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">
                  {zones.find(z => z.id === zoneId)?.name || '—'}
                </span>
                {zoneColor && <div className="h-1 w-full rounded-full mt-1" style={{ backgroundColor: zoneColor }} />}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => setSelectedDay(d => Math.min(5, d + 1))} disabled={selectedDay === 5}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Zone assignment for selected day */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{DAY_NAMES[selectedDay - 1]}</p>
            </div>
            <Select
              value={todayZoneId || 'none'}
              onValueChange={v => assignZoneMutation.mutate({ dayOfWeek: selectedDay, zoneId: v === 'none' ? null : v })}
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
                      {z.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Zone info bar */}
      {todayZone && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: `${todayZone.color}15` }}>
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: todayZone.color }} />
          <span className="text-sm font-semibold" style={{ color: todayZone.color }}>{formatZoneName(todayZone)}</span>
          <span className="text-xs text-muted-foreground ml-auto">{zoneCustomers.length} clients dans cette zone</span>
        </div>
      )}

      {/* No zone selected */}
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

      {/* Stops */}
      {todayZoneId && !customersLoading && (
        <>
          {/* Progress & Actions */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{completedCount}/{todayStops.length} visites</span>
                </div>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setOptimizerOpen(true)}>
                  <Sparkles className="h-3.5 w-3.5" />Optimiser
                </Button>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-3">
                <div className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${todayStops.length > 0 ? (completedCount / todayStops.length) * 100 : 0}%` }} />
              </div>
              {!session?.active ? (
                <Button className="w-full h-12 font-semibold" onClick={handleStartTour} disabled={todayStops.length === 0}>
                  <Sun className="h-4 w-4 mr-2" />Démarrer la journée
                </Button>
              ) : (
                <Button className="w-full h-12 font-semibold gap-1.5" onClick={handleResumeTour}>
                  <RotateCcw className="h-4 w-4" />Reprendre la tournée
                </Button>
              )}
            </CardContent>
          </Card>

          {/* In-progress banner */}
          {inProgressStop && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{inProgressStop.customer.company_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{inProgressStop.customer.address}</p>
                  </div>
                  <Button size="sm" variant="destructive" className="h-10 px-4 font-semibold shrink-0"
                    onClick={() => handleEnd(inProgressStop.customer.id, inProgressStop.customer.company_name)}>
                    <Square className="h-4 w-4 mr-1" />Terminer
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stop list */}
          <div className="space-y-2">
            {todayStops.map((stop, i) => {
              const status = getStatus(stop.customer.id);
              const isActive = status === 'in_progress';
              return (
                <div key={stop.customer.id}
                  className={`rounded-xl border p-3 transition-all ${
                    isActive ? 'border-primary/40 bg-primary/5 shadow-sm' :
                    status === 'completed' ? 'opacity-60' : ''
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      status === 'completed' ? 'bg-accent/10 text-accent' :
                      isActive ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {status === 'completed' ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold truncate">{stop.customer.company_name}</p>
                        {getPriorityBadge(stop.priority)}
                        {getOverdueBadge((stop.customer as any).last_visit_date)}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {stop.customer.city}{stop.customer.address ? ` · ${stop.customer.address}` : ''}
                      </p>
                      {stop.customer.annual_revenue_potential > 0 && (
                        <p className="text-[10px] text-accent font-medium">
                          {stop.customer.number_of_vehicles} véh. · {(stop.customer.annual_revenue_potential / 1000).toFixed(0)}k€/an
                        </p>
                      )}
                    </div>
                  </div>
                  {status !== 'completed' && (
                    <div className="flex items-center gap-2 mt-2.5">
                      {status === 'planned' && (
                        <Button size="sm" className="h-10 flex-1 font-semibold text-xs" onClick={() => handleStart(stop.customer.id)}>
                          <Play className="h-3.5 w-3.5 mr-1" />Démarrer
                        </Button>
                      )}
                      {isActive && (
                        <Button size="sm" variant="destructive" className="h-10 flex-1 font-semibold text-xs"
                          onClick={() => handleEnd(stop.customer.id, stop.customer.company_name)}>
                          <Square className="h-3.5 w-3.5 mr-1" />Terminer
                        </Button>
                      )}
                      <a href={`tel:${stop.customer.phone}`} className="shrink-0">
                        <Button variant="outline" size="icon" className="h-10 w-10"><Phone className="h-4 w-4" /></Button>
                      </a>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.customer.address || '')}`}
                        target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <Button variant="outline" size="icon" className="h-10 w-10"><Navigation className="h-4 w-4" /></Button>
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {todayStops.length === 0 && (
            <div className="py-12 text-center">
              <Calendar className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">Aucun client dans cette zone</p>
              <p className="text-xs text-muted-foreground mt-1">Assignez des clients à la zone « {todayZone?.name} »</p>
            </div>
          )}
        </>
      )}

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={activeClient} />
      <RouteOptimizerSheet open={optimizerOpen} onOpenChange={setOptimizerOpen} />
    </div>
  );
}
