import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import { TourMode } from '@/components/TourMode';
import {
  MapPin, Play, Phone, Navigation, Sparkles,
  ChevronLeft, ChevronRight, Calendar, Target,
  Sun, RotateCcw, Loader2, Clock, Star,
  Plus, UserPlus, Users,
} from 'lucide-react';
import RouteOptimizerSheet from '@/components/RouteOptimizerSheet';
import { useTourSession } from '@/contexts/TourSessionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCommercialZones, formatZoneName } from '@/hooks/useCommercialZones';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CustomerForRouting } from '@/lib/routeCycleEngine';
import { AddUnplannedVisitSheet } from '@/components/AddUnplannedVisitSheet';

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
  const { data: zones = [], isLoading: zonesLoading } = useCommercialZones();
  const queryClient = useQueryClient();

  // 4-week state: week 0-3, day 1-5
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState(() => {
    const dow = new Date().getDay();
    return dow >= 1 && dow <= 5 ? dow : 1;
  });

  const [reportOpen, setReportOpen] = useState(false);
  const [activeClient, setActiveClient] = useState('');
  const [tourMode, setTourMode] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Manual additions per day key (week-day)
  const [manualStops, setManualStops] = useState<Record<string, ManualStop[]>>({});

  const { session, startSession } = useTourSession();

  const dayKey = `${selectedWeek}-${selectedDay}`;

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

  // Zone for selected day (same planning repeats each week)
  const todayZoneId = useMemo(() => {
    const p = planning.find(p => p.day_of_week === selectedDay);
    return p?.zone_id || null;
  }, [planning, selectedDay]);

  const todayZone = zones.find(z => z.id === todayZoneId);

  // Load customers for the selected zone (include prospects)
  const { data: zoneCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['zone-customers', todayZoneId],
    queryFn: async () => {
      if (!todayZoneId) return [];
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
      return (data || []) as any[];
    },
    enabled: !!todayZoneId && zones.length > 0,
  });

  // Auto-selected stops (8-12), prioritized
  const autoStops = useMemo(() => {
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
          if (daysSince > 30) priority += 25;
          else if (daysSince > 14) priority += 10;
        } else {
          priority += 20;
        }
        // Prospect qualifié boost
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
        };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_VISITS);
  }, [zoneCustomers]);

  // Combine auto + manual stops
  const currentManual = manualStops[dayKey] || [];
  const allStops = useMemo(() => {
    const autoIds = new Set(autoStops.map(s => s.customer.id));
    const filteredManual = currentManual.filter(m => !autoIds.has(m.customer.id));
    return [
      ...autoStops.map(s => ({ ...s, source: 'auto' as const })),
      ...filteredManual.map(s => ({ ...s, source: 'manual' as const })),
    ];
  }, [autoStops, currentManual]);

  const totalPlanned = allStops.length;
  const isUnderTarget = totalPlanned < MIN_VISITS;
  const isAtTarget = totalPlanned >= MIN_VISITS && totalPlanned <= MAX_VISITS;
  const isOverTarget = totalPlanned > MAX_VISITS;

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

  // Manual add handlers
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

  const handleRemoveStop = (customerId: string) => {
    setManualStops(prev => ({
      ...prev,
      [dayKey]: (prev[dayKey] || []).filter(s => s.customer.id !== customerId),
    }));
  };

  const sessionCompletedCount = session ? Object.values(session.statuses).filter(s => s === 'completed').length : 0;

  const getOverdueBadge = (stop: any) => {
    const lastVisitDate = stop.lastVisitDate;
    if (!lastVisitDate) return <Badge className="bg-primary/15 text-primary text-[9px] h-4 shrink-0">Nouveau</Badge>;
    const days = Math.floor((Date.now() - new Date(lastVisitDate).getTime()) / 86400000);
    if (days > 30) return <Badge className="bg-destructive/15 text-destructive text-[9px] h-4 shrink-0">En retard</Badge>;
    return null;
  };

  // Available customers for manual add (not already in stops)
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
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">Tournée</h1>
        <p className="text-xs text-muted-foreground">Planning 4 semaines par zone géographique</p>
      </div>

      {/* Week selector */}
      <div className="flex gap-1.5">
        {WEEK_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => setSelectedWeek(i)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold text-center transition-all ${
              i === selectedWeek
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

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
                      {formatZoneName(z)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Zone info + target bar */}
      {todayZone && (
        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: `${todayZone.color}40` }}>
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: todayZone.color }} />
            <span className="text-sm font-bold" style={{ color: todayZone.color }}>{formatZoneName(todayZone)}</span>
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
          {/* Actions */}
          <div className="flex gap-2">
            {!session?.active ? (
              <Button className="flex-1 h-12 font-semibold" onClick={handleStartTour} disabled={allStops.length === 0}>
                <Sun className="h-4 w-4 mr-2" />Démarrer la journée
              </Button>
            ) : (
              <Button className="flex-1 h-12 font-semibold gap-1.5" onClick={handleResumeTour}>
                <RotateCcw className="h-4 w-4" />Reprendre la tournée
              </Button>
            )}
            <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => setOptimizerOpen(true)}>
              <Sparkles className="h-5 w-5" />
            </Button>
          </div>

          {/* Stop list */}
          <div className="space-y-1.5">
            {allStops.map((stop, i) => (
              <div key={stop.customer.id}
                className="rounded-xl border p-3 transition-all hover:border-primary/20"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold truncate">{stop.customer.company_name}</p>
                      {stop.source === 'manual' && (
                        <Badge className="bg-accent/15 text-accent text-[9px] h-4 shrink-0">Manuel</Badge>
                      )}
                      {stop.priority >= 60 && (
                        <Badge className="bg-primary/15 text-primary text-[9px] h-4 shrink-0">★ Prioritaire</Badge>
                      )}
                      {'lastVisitDate' in stop && getOverdueBadge(stop)}
                      {'customerType' in stop && (stop as any).customerType === 'prospect_qualifie' && (
                        <Badge className="bg-chart-4/15 text-chart-4 text-[9px] h-4 shrink-0">Prospect</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {stop.customer.city}{stop.customer.address ? ` · ${stop.customer.address}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {stop.customer.phone && (
                      <a href={`tel:${stop.customer.phone}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Phone className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.customer.address || '')}`}
                      target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Navigation className="h-3.5 w-3.5" /></Button>
                    </a>
                  </div>
                </div>
                {stop.customer.annual_revenue_potential > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1 ml-9">
                    {stop.customer.number_of_vehicles} véh. · {(stop.customer.annual_revenue_potential / 1000).toFixed(0)}k€/an
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Add buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-11 text-sm font-semibold gap-2 border-dashed border-primary/30 text-primary"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-4 w-4" />Ajouter un client
            </Button>
          </div>

          {/* Empty state */}
          {allStops.length === 0 && (
            <div className="py-10 text-center">
              <Calendar className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">Aucun client dans cette zone</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" />Ajouter un client
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={activeClient} />
      <RouteOptimizerSheet
        open={optimizerOpen}
        onOpenChange={setOptimizerOpen}
        zone={todayZone ? { id: todayZone.id, system_name: todayZone.system_name, custom_label: todayZone.custom_label, color: todayZone.color } : null}
        zoneCustomers={zoneCustomers}
        dayLabel={`${WEEK_LABELS[selectedWeek]} · ${DAY_NAMES[selectedDay - 1]}`}
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
    </div>
  );
}
