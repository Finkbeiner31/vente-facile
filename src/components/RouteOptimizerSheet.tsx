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
} from 'lucide-react';
import { formatMonthly } from '@/lib/revenueUtils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──

export interface OptCustomer {
  id: string;
  company_name: string;
  customer_type: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  number_of_vehicles: number;
  annual_revenue_potential: number;
  last_visit_date: string | null;
  phone: string | null;
  sales_potential: string | null;
  visit_frequency: string | null;
  address: string | null;
  visit_duration_minutes?: number | null;
}

export interface OptimizedRoute {
  customers: OptCustomer[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
  totalTravelMin: number;
  totalVisitMin: number;
}

type TypeFilter = 'tous' | 'clients' | 'prospects';
type DepartureType = 'company' | 'home' | 'custom';
type ArrivalType = 'same' | 'company' | 'home' | 'custom';
type RouteStrategy = 'nearest' | 'farthest';
type ZoneLogic = 'strict' | 'tolerance' | 'route';

// ── Constants ──

const DEFAULT_VISIT_DURATION_CLIENT = 30;
const DEFAULT_VISIT_DURATION_PROSPECT = 20;
const ZONE_TOLERANCE_KM = 15;

// ── Helpers ──

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDriveMin(km: number): number {
  return Math.round(km / 50 * 60);
}

function getVisitDuration(c: OptCustomer): number {
  if (c.visit_duration_minutes && c.visit_duration_minutes > 0) return c.visit_duration_minutes;
  const isProspect = c.customer_type === 'prospect' || c.customer_type === 'prospect_qualifie';
  return isProspect ? DEFAULT_VISIT_DURATION_PROSPECT : DEFAULT_VISIT_DURATION_CLIENT;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function calcPriorityScore(c: OptCustomer): number {
  let score = 0;
  score += Math.min((c.annual_revenue_potential || 0) / 1000, 100);
  if (c.sales_potential === 'A') score += 30;
  else if (c.sales_potential === 'B') score += 15;
  const days = daysSince(c.last_visit_date);
  if (days === null) score += 30;
  else if (days > 60) score += 28;
  else if (days > 30) score += 22;
  else if (days > 14) score += 12;
  else score += 3;
  if (c.customer_type === 'prospect_qualifie') score += 10;
  return Math.round(score);
}

/**
 * Nearest-neighbor with visit count limit.
 * Last stops are biased toward arrival point.
 */
function buildRouteByCount(
  candidates: OptCustomer[],
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  strategy: RouteStrategy,
  maxVisits: number,
): { ordered: OptCustomer[]; totalKm: number; totalDriveMin: number; totalVisitMin: number } {
  if (candidates.length === 0) return { ordered: [], totalKm: 0, totalDriveMin: 0, totalVisitMin: 0 };

  const remaining = [...candidates];
  const ordered: OptCustomer[] = [];
  let currentLat = startLat;
  let currentLng = startLng;
  let totalKm = 0;
  let totalDriveMin = 0;
  let totalVisitMin = 0;

  // For farthest strategy, first stop is farthest from departure
  if (strategy === 'farthest' && remaining.length > 0) {
    let maxDist = 0;
    let maxIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(startLat, startLng, remaining[i].latitude!, remaining[i].longitude!);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    const first = remaining.splice(maxIdx, 1)[0];
    ordered.push(first);
    totalKm += maxDist;
    totalDriveMin += estimateDriveMin(maxDist);
    totalVisitMin += getVisitDuration(first);
    currentLat = first.latitude!;
    currentLng = first.longitude!;
  }

  // Nearest-neighbor with count limit
  while (remaining.length > 0 && ordered.length < maxVisits) {
    const biasToEnd = remaining.length <= 3 ? 0.3 : 0;
    let bestScore = Infinity;
    let bestIdx = -1;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const distFromCurrent = haversineKm(currentLat, currentLng, c.latitude!, c.longitude!);
      const distToEnd = haversineKm(c.latitude!, c.longitude!, endLat, endLng);
      const score = distFromCurrent * (1 - biasToEnd) + distToEnd * biasToEnd;

      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    const next = remaining.splice(bestIdx, 1)[0];
    const legKm = haversineKm(currentLat, currentLng, next.latitude!, next.longitude!);
    totalKm += legKm;
    totalDriveMin += estimateDriveMin(legKm);
    totalVisitMin += getVisitDuration(next);
    ordered.push(next);
    currentLat = next.latitude!;
    currentLng = next.longitude!;
  }

  // Add return leg
  if (ordered.length > 0) {
    const last = ordered[ordered.length - 1];
    const returnKm = haversineKm(last.latitude!, last.longitude!, endLat, endLng);
    totalKm += returnKm;
    totalDriveMin += estimateDriveMin(returnKm);
  }

  return {
    ordered,
    totalKm: Math.round(totalKm * 10) / 10,
    totalDriveMin,
    totalVisitMin,
  };
}

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
  dayLabel?: string;
}

export default function RouteOptimizerSheet({
  open, onOpenChange, onRouteGenerated,
  zone, zoneCustomers = [], dayLabel,
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
    // For company/home types we'd use saved addresses — for now fall back to userPos
    return userPos;
  }, [arrivalType, arrivalPos, userPos]);

  useEffect(() => {
    if (open) {
      setStep('config');
      setOptimizedRoute(null);
      setSelectedIds(new Set());
    }
  }, [open]);

  // Build candidates
  const candidates = useMemo(() => {
    return zoneCustomers
      .filter((c: any) => c.latitude != null && c.longitude != null)
      .filter((c: any) => {
        if (typeFilter === 'clients' && (c.customer_type === 'prospect' || c.customer_type === 'prospect_qualifie')) return false;
        if (typeFilter === 'prospects' && c.customer_type !== 'prospect' && c.customer_type !== 'prospect_qualifie') return false;
        if (excludeRecent) {
          const days = daysSince(c.last_visit_date);
          if (days !== null && days <= 7) return false;
        }
        return true;
      })
      .map((c: any) => {
        const cust: OptCustomer = {
          id: c.id, company_name: c.company_name, customer_type: c.customer_type,
          city: c.city || '', latitude: c.latitude, longitude: c.longitude,
          number_of_vehicles: c.number_of_vehicles || 0,
          annual_revenue_potential: Number(c.annual_revenue_potential || 0),
          last_visit_date: c.last_visit_date, phone: c.phone,
          sales_potential: c.sales_potential, visit_frequency: c.visit_frequency,
          address: c.address, visit_duration_minutes: c.visit_duration_minutes,
        };
        const score = calcPriorityScore(cust);
        const distance = userPos ? haversineKm(userPos.lat, userPos.lng, c.latitude, c.longitude) : 0;
        const visitDur = getVisitDuration(cust);
        return { ...cust, score, distance, visitDur };
      })
      .sort((a: any, b: any) => b.score - a.score);
  }, [zoneCustomers, typeFilter, excludeRecent, userPos]);

  const eligibleClients = zoneCustomers.filter((c: any) =>
    c.customer_type !== 'prospect' && c.customer_type !== 'prospect_qualifie').length;
  const eligibleProspects = zoneCustomers.filter((c: any) =>
    c.customer_type === 'prospect' || c.customer_type === 'prospect_qualifie').length;

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
    setSelectedIds(new Set(top.map((c: any) => c.id)));
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
    const endPoint = effectiveArrival || userPos;
    const selected = candidates.filter((c: any) => selectedIds.has(c.id));

    const { ordered, totalKm, totalDriveMin, totalVisitMin } = buildRouteByCount(
      selected, userPos.lat, userPos.lng, endPoint.lat, endPoint.lng, strategy, visitTarget
    );

    setOptimizedRoute({
      customers: ordered,
      totalDistanceKm: totalKm,
      estimatedDurationMin: totalDriveMin + totalVisitMin,
      totalTravelMin: totalDriveMin,
      totalVisitMin,
    });
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

  const formatDuration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}` : `${m}min`;
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

              {/* Summary */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="text-center">
                  <span className="font-bold text-primary text-sm">{candidates.length}</span>
                  <span className="text-sm text-muted-foreground"> comptes éligibles</span>
                </div>
                {!hasEnough && candidates.length > 0 && (
                  <p className="text-xs text-warning font-medium text-center">
                    ⚠ Pas assez de visites pour l'objectif (8 min.)
                  </p>
                )}
                {candidates.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center">Aucun compte géolocalisé</p>
                )}
                {userPos && (
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

        {/* ── Preview ── */}
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
                {candidates.map((c: any) => {
                  const isSelected = selectedIds.has(c.id);
                  const days = daysSince(c.last_visit_date);
                  return (
                    <button key={c.id} onClick={() => toggleSelection(c.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-primary/5' : 'opacity-50'}`}>
                      <div className="flex items-center gap-3">
                        <Checkbox checked={isSelected} className="shrink-0 pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{c.company_name}</span>
                            <Badge variant="outline" className="text-[9px] h-4 shrink-0">{c.score}pts</Badge>
                            {c.sales_potential === 'A' && (
                              <Badge className="bg-primary/15 text-primary text-[9px] h-4 shrink-0">★ A</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span>{c.city}</span>
                            <span>·</span>
                            <span className="font-medium">{formatMonthly(c.annual_revenue_potential)}</span>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />{c.visitDur}min
                            </span>
                            {userPos && (
                              <>
                                <span>·</span>
                                <span>{c.distance.toFixed(1)} km</span>
                              </>
                            )}
                            {days === null && (
                              <>
                                <span>·</span>
                                <span className="text-destructive flex items-center gap-0.5">
                                  <AlertTriangle className="h-3 w-3" /> Jamais visité
                                </span>
                              </>
                            )}
                            {days !== null && days > 30 && (
                              <><span>·</span><span className="text-warning">+{days}j</span></>
                            )}
                          </div>
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

        {/* ── Result ── */}
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
                  const visitDur = getVisitDuration(c);
                  return (
                    <div key={c.id}>
                      <div className="rounded-xl border p-3 flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
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
                              <Clock className="h-3 w-3" />{visitDur}min
                            </span>
                          </div>
                        </div>
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
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
