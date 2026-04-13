import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Loader2, Navigation, MapPin, Play, Route, Sparkles, Zap,
  LocateFixed, AlertTriangle, Users, Target, ArrowDown, ArrowUp,
  Building2, MapPinned, Flag, CircleDot, Clock, Home, MoreHorizontal,
  Info,
} from 'lucide-react';
import { formatMonthly } from '@/lib/revenueUtils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  type OptCustomer, type ScoredCustomer, type OptimizedRoute,
  type RouteStrategy, type ZoneLogic, type TypeFilter,
  type OptimizationConfig,
  filterCandidates, buildOptimizedRoute,
  haversineKm, estimateDriveMin, formatDuration, getReasonBadgeStyle,
} from '@/lib/tourneeOptimizer';

// ── Types ──

type DepartureType = 'company' | 'home' | 'custom';
type ArrivalType = 'same' | 'company' | 'home' | 'custom';

// ── Component ──

interface ZoneInfo {
  id: string;
  system_name: string;
  custom_label?: string | null;
  color?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRouteGenerated?: (route: OptimizedRoute) => void;
  zone?: ZoneInfo | null;
  zoneCustomers?: any[];
  /** All customers for tolerance/route mode */
  allCustomers?: any[];
  dayLabel?: string;
}

export default function RouteOptimizerSheet({
  open, onOpenChange, onRouteGenerated,
  zone, zoneCustomers = [], allCustomers, dayLabel,
}: Props) {
  const { user } = useAuth();

  // Config
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tous');
  const [visitTarget, setVisitTarget] = useState(10);
  const [excludeRecent, setExcludeRecent] = useState(true);
  const [strategy, setStrategy] = useState<RouteStrategy>('nearest');
  const [departureType, setDepartureType] = useState<DepartureType>('company');
  const [customDepartureAddress, setCustomDepartureAddress] = useState('');
  const [arrivalType, setArrivalType] = useState<ArrivalType>('same');
  const [customArrivalAddress, setCustomArrivalAddress] = useState('');
  const [arrivalPos, setArrivalPos] = useState<{ lat: number; lng: number } | null>(null);
  const [zoneLogic, setZoneLogic] = useState<ZoneLogic>('strict');

  // Process state
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [step, setStep] = useState<'config' | 'preview' | 'result'>('config');
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const effectiveArrival = useMemo(() => {
    if (arrivalType === 'custom' && arrivalPos) return arrivalPos;
    return userPos;
  }, [arrivalType, arrivalPos, userPos]);

  useEffect(() => {
    if (open) {
      setStep('config');
      setOptimizedRoute(null);
      setSelectedIds(new Set());
    }
  }, [open]);

  // Build scored candidates using new engine
  const candidates = useMemo(() => {
    if (!userPos) return [];

    const arrival = effectiveArrival || userPos;
    const zoneCustomerIds = new Set(zoneCustomers.map((c: any) => c.id));
    
    // Source pool: for strict mode use zone customers, otherwise use all available
    const sourcePool: OptCustomer[] = (
      zoneLogic === 'strict' ? zoneCustomers : (allCustomers || zoneCustomers)
    ).map((c: any) => ({
      id: c.id,
      company_name: c.company_name,
      customer_type: c.customer_type,
      city: c.city || '',
      latitude: c.latitude,
      longitude: c.longitude,
      number_of_vehicles: c.number_of_vehicles || 0,
      annual_revenue_potential: Number(c.annual_revenue_potential || 0),
      last_visit_date: c.last_visit_date,
      phone: c.phone,
      sales_potential: c.sales_potential,
      visit_frequency: c.visit_frequency,
      address: c.address,
      visit_duration_minutes: c.visit_duration_minutes,
      relationship_type: c.relationship_type,
      zone: c.zone,
    }));

    const config: OptimizationConfig = {
      visitTarget,
      strategy,
      zoneLogic,
      typeFilter,
      excludeRecentDays: excludeRecent ? 7 : null,
      departureLat: userPos.lat,
      departureLng: userPos.lng,
      arrivalLat: arrival.lat,
      arrivalLng: arrival.lng,
    };

    return filterCandidates(sourcePool, zoneCustomerIds, config);
  }, [zoneCustomers, allCustomers, typeFilter, excludeRecent, userPos, effectiveArrival, zoneLogic, visitTarget, strategy]);

  const eligibleClients = zoneCustomers.filter((c: any) =>
    c.customer_type !== 'prospect' && c.customer_type !== 'prospect_qualifie').length;
  const eligibleProspects = zoneCustomers.filter((c: any) =>
    c.customer_type === 'prospect' || c.customer_type === 'prospect_qualifie').length;

  const overdueCount = candidates.filter(c => c.reasons.includes('En retard')).length;
  const highPriorityCount = candidates.filter(c => c.reasons.includes('Fort potentiel') || c.reasons.includes('Priorité A')).length;

  const handleLocate = () => {
    if (!navigator.geolocation) { toast.error('Géolocalisation non disponible'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success('Position détectée');
      },
      () => { setLocating(false); toast.error('Impossible d\'obtenir votre position'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleGeneratePreview = () => {
    const top = candidates.slice(0, Math.min(visitTarget + 2, candidates.length));
    setSelectedIds(new Set(top.map(c => c.id)));
    setStep('preview');
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleOptimize = () => {
    if (!userPos) { toast.error('Veuillez définir votre point de départ'); return; }
    const arrival = effectiveArrival || userPos;
    const selected = candidates.filter(c => selectedIds.has(c.id));

    const config: OptimizationConfig = {
      visitTarget,
      strategy,
      zoneLogic,
      typeFilter,
      excludeRecentDays: excludeRecent ? 7 : null,
      departureLat: userPos.lat,
      departureLng: userPos.lng,
      arrivalLat: arrival.lat,
      arrivalLng: arrival.lng,
    };

    const route = buildOptimizedRoute(selected, config);
    setOptimizedRoute(route);
    setStep('result');
  };

  const handleSaveAndStart = async () => {
    if (!user || !optimizedRoute) return;
    setSaving(true);
    try {
      const { data: route, error: routeErr } = await supabase
        .from('routes')
        .insert({
          rep_id: user.id,
          route_date: new Date().toISOString().split('T')[0],
          status: 'planned',
          total_distance_km: optimizedRoute.totalDistanceKm,
          estimated_duration_min: optimizedRoute.estimatedDurationMin,
          notes: `Tournée optimisée — ${optimizedRoute.customers.length} visites${zone ? ` — ${zone.custom_label || zone.system_name}` : ''}`,
        })
        .select('id')
        .single();
      if (routeErr) throw routeErr;

      const stops = optimizedRoute.customers.map((c, i) => ({
        route_id: route.id, customer_id: c.id, stop_order: i + 1, status: 'planned',
      }));
      const { error: stopsErr } = await supabase.from('route_stops').insert(stops);
      if (stopsErr) throw stopsErr;

      toast.success(`Tournée créée avec ${stops.length} visites`);
      onRouteGenerated?.(optimizedRoute);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la création de la tournée');
    } finally {
      setSaving(false);
    }
  };

  const zoneName = zone ? (zone.custom_label || zone.system_name) : null;
  const hasEnough = candidates.length >= 8;

  const getDepartureLabel = () => {
    switch (departureType) {
      case 'company': return 'Adresse entreprise';
      case 'home': return 'Adresse domicile';
      case 'custom': return customDepartureAddress || 'Autre adresse';
    }
  };

  const getArrivalLabel = () => {
    switch (arrivalType) {
      case 'same': return getDepartureLabel();
      case 'company': return 'Adresse entreprise';
      case 'home': return 'Adresse domicile';
      case 'custom': return customArrivalAddress || 'Autre adresse';
    }
  };

  const getZoneLogicLabel = () => {
    switch (zoneLogic) {
      case 'strict': return 'Strict';
      case 'tolerance': return 'Tolérance 15 km';
      case 'route': return 'Clients sur trajet';
    }
  };

  const departureLabel = getDepartureLabel();
  const arrivalLabel = getArrivalLabel();
  const strategyLabel = strategy === 'nearest' ? 'Plus proche d\'abord' : 'Plus loin d\'abord';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-primary" />
            Optimiser ma tournée
          </SheetTitle>
        </SheetHeader>

        {/* ── Config ── */}
        {step === 'config' && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-5">

              {/* Zone info */}
              {zone && (
                <div className="rounded-xl border p-3 space-y-1.5" style={{ borderColor: `${zone.color || '#3b82f6'}40` }}>
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: zone.color || '#3b82f6' }} />
                    <span className="text-sm font-bold" style={{ color: zone.color || '#3b82f6' }}>{zoneName}</span>
                    {dayLabel && <Badge variant="outline" className="text-[10px] h-5 ml-auto">{dayLabel}</Badge>}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{eligibleClients} clients</span>
                    <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{eligibleProspects} prospects</span>
                  </div>
                </div>
              )}

              {!zone && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-center">
                  <AlertTriangle className="mx-auto h-5 w-5 text-warning mb-1" />
                  <p className="text-sm text-warning font-medium">Aucune zone assignée à ce jour</p>
                  <p className="text-xs text-muted-foreground mt-0.5">L'optimisation utilisera tous vos clients géolocalisés</p>
                </div>
              )}

              {/* Departure point */}
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <CircleDot className="h-4 w-4 text-primary" />
                  Point de départ
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <Button variant={departureType === 'company' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
                    onClick={() => { setDepartureType('company'); handleLocate(); }}>
                    <Building2 className="h-3.5 w-3.5" />Entreprise
                  </Button>
                  <Button variant={departureType === 'home' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
                    onClick={() => { setDepartureType('home'); handleLocate(); }}>
                    <Home className="h-3.5 w-3.5" />Domicile
                  </Button>
                  <Button variant={departureType === 'custom' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
                    onClick={() => setDepartureType('custom')}>
                    <MoreHorizontal className="h-3.5 w-3.5" />Autre
                  </Button>
                </div>
                {departureType === 'custom' && (
                  <Input placeholder="Entrez une adresse de départ..." value={customDepartureAddress}
                    onChange={e => setCustomDepartureAddress(e.target.value)} className="h-10" />
                )}
                {userPos && departureType !== 'custom' && (
                  <Badge variant="secondary" className="text-[10px]">
                    <LocateFixed className="h-3 w-3 mr-1" />
                    Position détectée ({userPos.lat.toFixed(4)}, {userPos.lng.toFixed(4)})
                  </Badge>
                )}
              </div>

              {/* Arrival point */}
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <Flag className="h-4 w-4 text-primary" />
                  Point d'arrivée
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant={arrivalType === 'same' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
                    onClick={() => { setArrivalType('same'); setArrivalPos(null); }}>
                    <MapPinned className="h-3.5 w-3.5" />Même que départ
                  </Button>
                  <Button variant={arrivalType === 'company' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
                    onClick={() => setArrivalType('company')}>
                    <Building2 className="h-3.5 w-3.5" />Entreprise
                  </Button>
                  <Button variant={arrivalType === 'home' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
                    onClick={() => setArrivalType('home')}>
                    <Home className="h-3.5 w-3.5" />Domicile
                  </Button>
                  <Button variant={arrivalType === 'custom' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
                    onClick={() => setArrivalType('custom')}>
                    <MoreHorizontal className="h-3.5 w-3.5" />Autre
                  </Button>
                </div>
                {arrivalType === 'custom' && (
                  <Input placeholder="Entrez une adresse d'arrivée..." value={customArrivalAddress}
                    onChange={e => setCustomArrivalAddress(e.target.value)} className="h-10" />
                )}
                {arrivalType === 'same' && userPos && (
                  <p className="text-[10px] text-muted-foreground">Le trajet revient au point de départ</p>
                )}
              </div>

              {/* Type filter */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">Type de compte</label>
                <Select value={typeFilter} onValueChange={v => setTypeFilter(v as TypeFilter)}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tous">Clients + Prospects</SelectItem>
                    <SelectItem value="clients">Clients uniquement</SelectItem>
                    <SelectItem value="prospects">Prospects uniquement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Visit count */}
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-primary" />
                  Nombre de visites
                </label>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[visitTarget]}
                    onValueChange={v => setVisitTarget(v[0])}
                    min={4}
                    max={15}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold w-8 text-center">{visitTarget}</span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">Objectif recommandé : 8–12 visites</p>
              </div>

              {/* Zone logic */}
              {zone && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-primary" />
                    Logique de zone
                  </label>
                  <div className="space-y-1.5">
                    <button onClick={() => setZoneLogic('strict')}
                      className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                        zoneLogic === 'strict' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                      }`}>
                      <p className="text-xs font-semibold">Respect strict de la zone</p>
                      <p className="text-[10px] text-muted-foreground">Uniquement les clients dans la zone</p>
                    </button>
                    <button onClick={() => setZoneLogic('tolerance')}
                      className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                        zoneLogic === 'tolerance' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                      }`}>
                      <p className="text-xs font-semibold">Tolérance zone (15 km)</p>
                      <p className="text-[10px] text-muted-foreground">Inclut les clients proches de la zone</p>
                    </button>
                    <button onClick={() => setZoneLogic('route')}
                      className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                        zoneLogic === 'route' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                      }`}>
                      <p className="text-xs font-semibold">Clients sur le trajet aller/retour</p>
                      <p className="text-[10px] text-muted-foreground">Accepte les clients sur votre route</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Exclude recent */}
              <div className="flex items-center gap-2">
                <Checkbox id="excludeRecent" checked={excludeRecent} onCheckedChange={v => setExcludeRecent(!!v)} />
                <label htmlFor="excludeRecent" className="text-sm cursor-pointer">Exclure visités récemment (≤ 7 jours)</label>
              </div>

              {/* Route strategy */}
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <Route className="h-4 w-4 text-primary" />
                  Ordre de départ
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setStrategy('nearest')}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      strategy === 'nearest' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                    }`}>
                    <ArrowDown className="h-4 w-4 text-primary mb-1" />
                    <p className="text-xs font-semibold">Plus proche d'abord</p>
                    <p className="text-[10px] text-muted-foreground">Commence par le plus proche</p>
                  </button>
                  <button onClick={() => setStrategy('farthest')}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      strategy === 'farthest' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                    }`}>
                    <ArrowUp className="h-4 w-4 text-primary mb-1" />
                    <p className="text-xs font-semibold">Plus loin d'abord</p>
                    <p className="text-[10px] text-muted-foreground">Va au plus loin, puis revient</p>
                  </button>
                </div>
              </div>

              {/* Summary with priority insights */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="text-center">
                  <span className="font-bold text-primary text-sm">{candidates.length}</span>
                  <span className="text-sm text-muted-foreground"> comptes éligibles</span>
                </div>
                {candidates.length > 0 && (
                  <div className="flex justify-center gap-3 text-[11px]">
                    {overdueCount > 0 && (
                      <span className="text-destructive font-medium">🔴 {overdueCount} en retard</span>
                    )}
                    {highPriorityCount > 0 && (
                      <span className="text-primary font-medium">⭐ {highPriorityCount} prioritaires</span>
                    )}
                  </div>
                )}
                {!hasEnough && candidates.length > 0 && (
                  <p className="text-xs text-warning font-medium text-center">
                    ⚠ Pas assez de visites pour l'objectif (8 min.)
                  </p>
                )}
                {candidates.length === 0 && !userPos && (
                  <p className="text-xs text-muted-foreground text-center">
                    <LocateFixed className="h-3.5 w-3.5 inline mr-1" />
                    Définissez votre position pour voir les comptes éligibles
                  </p>
                )}
                {candidates.length === 0 && userPos && (
                  <div className="text-center space-y-1">
                    <AlertTriangle className="h-5 w-5 text-warning mx-auto" />
                    <p className="text-xs text-muted-foreground">
                      Aucun compte éligible dans cette zone
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Vérifiez la zone assignée et les filtres actifs
                    </p>
                  </div>
                )}
                {userPos && candidates.length > 0 && (
                  <div className="border-t pt-2 mt-2 space-y-1 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CircleDot className="h-3 w-3 text-primary shrink-0" />
                      <span>Départ : {departureLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flag className="h-3 w-3 text-primary shrink-0" />
                      <span>Arrivée : {arrivalLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Route className="h-3 w-3 text-primary shrink-0" />
                      <span>Stratégie : {strategyLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="h-3 w-3 text-primary shrink-0" />
                      <span>Visites : {visitTarget}</span>
                    </div>
                    {zone && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-primary shrink-0" />
                        <span>Zone : {getZoneLogicLabel()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t mt-auto">
              <Button className="w-full h-12 font-semibold" disabled={candidates.length === 0} onClick={handleGeneratePreview}>
                <Route className="h-4 w-4 mr-2" />
                Générer la tournée ({Math.min(visitTarget, candidates.length)} visites)
              </Button>
            </div>
          </div>
        )}

        {/* ── Preview with explainability ── */}
        {step === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
              <p className="text-sm font-semibold">{selectedIds.size} visites sélectionnées sur {candidates.length}</p>
              <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground mt-0.5">
                {zoneName && <span>Zone : {zoneName}</span>}
                <span>{strategyLabel}</span>
                <span>Objectif : {visitTarget} visites</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {candidates.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <button key={c.id} onClick={() => toggleSelection(c.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-primary/5' : 'opacity-50'}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox checked={isSelected} className="shrink-0 pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{c.company_name}</span>
                            <Badge variant="outline" className="text-[9px] h-4 shrink-0">{c.score}pts</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span>{c.city}</span>
                            <span>·</span>
                            <span className="font-medium">{formatMonthly(c.annual_revenue_potential)}</span>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />{c.visitDuration}min
                            </span>
                            {userPos && (
                              <>
                                <span>·</span>
                                <span>{c.distanceFromUser.toFixed(1)} km</span>
                              </>
                            )}
                          </div>
                          {/* Explainability badges */}
                          {c.reasons.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.reasons.slice(0, 3).map((reason) => {
                                const style = getReasonBadgeStyle(reason);
                                return (
                                  <span key={reason} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${style.className}`}>
                                    {reason}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="p-4 border-t flex gap-2 shrink-0">
              <Button variant="outline" className="flex-1 h-11" onClick={() => setStep('config')}>Retour</Button>
              <Button className="flex-1 h-11 font-semibold" disabled={selectedIds.size < 2 || !userPos} onClick={handleOptimize}>
                <Sparkles className="h-4 w-4 mr-2" />Optimiser ({selectedIds.size})
              </Button>
            </div>
            {!userPos && (
              <div className="px-4 pb-3">
                <p className="text-xs text-warning text-center">⚠ Définissez un point de départ pour optimiser</p>
              </div>
            )}
          </div>
        )}

        {/* ── Result with explainability ── */}
        {step === 'result' && optimizedRoute && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Time breakdown header */}
            <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-primary">{formatDuration(optimizedRoute.estimatedDurationMin)}</p>
                  <p className="text-[10px] text-muted-foreground">⏱ durée totale</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{formatDuration(optimizedRoute.totalTravelMin)}</p>
                  <p className="text-[10px] text-muted-foreground">🚗 trajet</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{formatDuration(optimizedRoute.totalVisitMin)}</p>
                  <p className="text-[10px] text-muted-foreground">🤝 visites</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center mt-2 pt-2 border-t">
                <div>
                  <p className="text-sm font-bold">{optimizedRoute.customers.length}</p>
                  <p className="text-[10px] text-muted-foreground">visites</p>
                </div>
                <div>
                  <p className="text-sm font-bold">{optimizedRoute.totalDistanceKm} km</p>
                  <p className="text-[10px] text-muted-foreground">distance</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><CircleDot className="h-3 w-3 text-primary" />{departureLabel}</span>
                <span>→</span>
                <span className="flex items-center gap-1"><Flag className="h-3 w-3 text-primary" />{arrivalLabel}</span>
              </div>
              {zoneName && (
                <p className="text-[10px] text-center text-muted-foreground mt-1">{zoneName} · {strategyLabel} · {getZoneLogicLabel()}</p>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-1">
                {/* Departure marker */}
                <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <CircleDot className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-medium">Départ — {departureLabel}</span>
                </div>

                {optimizedRoute.customers.map((c, i) => {
                  const nextC = optimizedRoute.customers[i + 1];
                  const legKm = nextC
                    ? haversineKm(c.latitude!, c.longitude!, nextC.latitude!, nextC.longitude!)
                    : (effectiveArrival ? haversineKm(c.latitude!, c.longitude!, effectiveArrival.lat, effectiveArrival.lng) : 0);
                  const isLast = i === optimizedRoute.customers.length - 1;
                  return (
                    <div key={c.id}>
                      <div className="rounded-xl border p-3 flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold mt-0.5">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{c.company_name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{c.city}</span>
                            <span>·</span>
                            <span>{formatMonthly(c.annual_revenue_potential)}</span>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />{c.visitDuration}min
                            </span>
                          </div>
                          {/* Reason badges in result */}
                          {c.reasons.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.reasons.slice(0, 3).map((reason) => {
                                const style = getReasonBadgeStyle(reason);
                                return (
                                  <span key={reason} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${style.className}`}>
                                    {reason}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                      {legKm > 0.1 && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-10 my-1">
                          <Navigation className="h-3 w-3" />
                          <span>
                            {legKm.toFixed(1)} km · ~{estimateDriveMin(legKm)} min
                            {isLast && ' → arrivée'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Arrival marker */}
                <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Flag className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-medium">Arrivée — {arrivalLabel}</span>
                </div>
              </div>
            </ScrollArea>

            <div className="p-4 border-t space-y-2 shrink-0">
              <Button className="w-full h-12 font-semibold" onClick={handleSaveAndStart} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Créer et démarrer la tournée
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-10" onClick={() => setStep('preview')}>Modifier la sélection</Button>
                <Button variant="outline" className="flex-1 h-10" onClick={() => { setStep('config'); setOptimizedRoute(null); }}>Recommencer</Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Re-export types for consumers
export type { OptCustomer, OptimizedRoute };
