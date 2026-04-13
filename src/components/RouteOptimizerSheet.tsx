import { useState, useEffect, useMemo, useCallback } from 'react';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, Navigation, MapPin, Play, Route, Sparkles, Zap,
  LocateFixed, AlertTriangle, Users, Target, ArrowDown, ArrowUp,
  Building2, MapPinned, Flag, CircleDot, Clock, Home, MoreHorizontal,
  Info, Pencil,
} from 'lucide-react';
import { formatMonthly } from '@/lib/revenueUtils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  type OptCustomer, type ScoredCustomer, type OptimizedRoute,
  type RouteStrategy, type ZoneLogic, type ZoneLogicFlags, type TypeFilter,
  type OptimizationConfig,
  filterCandidates, buildOptimizedRoute,
  haversineKm, estimateDriveMin, formatDuration, getReasonBadgeStyle,
} from '@/lib/tourneeOptimizer';

// ── Types ──

type PointType = 'company' | 'home' | 'custom';

interface SavedAddresses {
  entreprise_address: string | null;
  entreprise_lat: number | null;
  entreprise_lng: number | null;
  domicile_address: string | null;
  domicile_lat: number | null;
  domicile_lng: number | null;
  autre_address: string | null;
  autre_lat: number | null;
  autre_lng: number | null;
}

const EMPTY_ADDRESSES: SavedAddresses = {
  entreprise_address: null, entreprise_lat: null, entreprise_lng: null,
  domicile_address: null, domicile_lat: null, domicile_lng: null,
  autre_address: null, autre_lat: null, autre_lng: null,
};

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
  allCustomers?: any[];
  dayLabel?: string;
}

// Simple geocoding via Nominatim
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) { console.error('Geocoding error:', e); }
  return null;
}

export default function RouteOptimizerSheet({
  open, onOpenChange, onRouteGenerated,
  zone, zoneCustomers = [], allCustomers, dayLabel,
}: Props) {
  const { user } = useAuth();

  // Saved addresses from profile
  const [addresses, setAddresses] = useState<SavedAddresses>(EMPTY_ADDRESSES);
  const [addressesLoaded, setAddressesLoaded] = useState(false);

  // Config
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tous');
  const [visitTarget, setVisitTarget] = useState(10);
  const [excludeRecent, setExcludeRecent] = useState(true);
  const [strategy, setStrategy] = useState<RouteStrategy>('nearest');
  const [departureType, setDepartureType] = useState<PointType>('company');
  const [arrivalType, setArrivalType] = useState<PointType>('company');
  const [zoneLogicFlags, setZoneLogicFlags] = useState<ZoneLogicFlags>({ strict: true, tolerance: false, route: false });

  // Address edit modal
  const [editingField, setEditingField] = useState<'entreprise' | 'domicile' | 'autre' | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Process state
  const [step, setStep] = useState<'config' | 'preview' | 'result'>('config');
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Load addresses from profile
  useEffect(() => {
    if (!user?.id || addressesLoaded) return;
    supabase.from('profiles').select('entreprise_address, entreprise_lat, entreprise_lng, domicile_address, domicile_lat, domicile_lng, autre_address, autre_lat, autre_lng')
      .eq('id', user.id).single().then(({ data }) => {
        if (data) setAddresses(data as SavedAddresses);
        setAddressesLoaded(true);
      });
  }, [user?.id, addressesLoaded]);

  // Resolve position for a point type
  const getPosition = useCallback((type: PointType): { lat: number; lng: number } | null => {
    switch (type) {
      case 'company':
        return addresses.entreprise_lat && addresses.entreprise_lng
          ? { lat: addresses.entreprise_lat, lng: addresses.entreprise_lng } : null;
      case 'home':
        return addresses.domicile_lat && addresses.domicile_lng
          ? { lat: addresses.domicile_lat, lng: addresses.domicile_lng } : null;
      case 'custom':
        return addresses.autre_lat && addresses.autre_lng
          ? { lat: addresses.autre_lat, lng: addresses.autre_lng } : null;
    }
  }, [addresses]);

  const getAddressLabel = useCallback((type: PointType): string | null => {
    switch (type) {
      case 'company': return addresses.entreprise_address;
      case 'home': return addresses.domicile_address;
      case 'custom': return addresses.autre_address;
    }
  }, [addresses]);

  const departurePos = useMemo(() => getPosition(departureType), [getPosition, departureType]);
  const arrivalPos = useMemo(() => getPosition(arrivalType), [getPosition, arrivalType]);
  const effectiveArrival = arrivalPos || departurePos;

  useEffect(() => {
    if (open) {
      setStep('config');
      setOptimizedRoute(null);
      setSelectedIds(new Set());
    }
  }, [open]);

  const hasExtension = zoneLogicFlags.tolerance || zoneLogicFlags.route;

  const candidates = useMemo(() => {
    if (!departurePos) return [];
    const arrival = effectiveArrival || departurePos;
    const zoneCustomerIds = new Set(zoneCustomers.map((c: any) => c.id));

    const sourcePool: OptCustomer[] = (
      !hasExtension ? zoneCustomers : (allCustomers || zoneCustomers)
    ).map((c: any) => ({
      id: c.id, company_name: c.company_name, customer_type: c.customer_type,
      city: c.city || '', latitude: c.latitude, longitude: c.longitude,
      number_of_vehicles: c.number_of_vehicles || 0,
      annual_revenue_potential: Number(c.annual_revenue_potential || 0),
      last_visit_date: c.last_visit_date, phone: c.phone,
      sales_potential: c.sales_potential, visit_frequency: c.visit_frequency,
      address: c.address, visit_duration_minutes: c.visit_duration_minutes,
      relationship_type: c.relationship_type, zone: c.zone,
    }));

    const config: OptimizationConfig = {
      visitTarget, strategy, zoneLogic: 'strict', zoneLogicFlags, typeFilter,
      excludeRecentDays: excludeRecent ? 7 : null,
      departureLat: departurePos.lat, departureLng: departurePos.lng,
      arrivalLat: arrival.lat, arrivalLng: arrival.lng,
    };

    return filterCandidates(sourcePool, zoneCustomerIds, config);
  }, [zoneCustomers, allCustomers, typeFilter, excludeRecent, departurePos, effectiveArrival, zoneLogicFlags, hasExtension, visitTarget, strategy]);

  const eligibleClients = zoneCustomers.filter((c: any) =>
    c.customer_type !== 'prospect' && c.customer_type !== 'prospect_qualifie').length;
  const eligibleProspects = zoneCustomers.filter((c: any) =>
    c.customer_type === 'prospect' || c.customer_type === 'prospect_qualifie').length;

  const overdueCount = candidates.filter(c => c.reasons.includes('En retard')).length;
  const highPriorityCount = candidates.filter(c => c.reasons.includes('Fort potentiel') || c.reasons.includes('Priorité A')).length;

  // Save address to profile
  const saveAddress = async (field: 'entreprise' | 'domicile' | 'autre', address: string) => {
    if (!user?.id) return;
    setEditSaving(true);
    try {
      const geo = await geocodeAddress(address);
      if (!geo) { toast.error('Adresse introuvable. Vérifiez la saisie.'); setEditSaving(false); return; }
      
      const update: Record<string, any> = {
        [`${field}_address`]: address,
        [`${field}_lat`]: geo.lat,
        [`${field}_lng`]: geo.lng,
      };
      
      const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
      if (error) throw error;
      
      setAddresses(prev => ({ ...prev, ...update }));
      toast.success('Adresse enregistrée');
      setEditingField(null);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setEditSaving(false);
    }
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
    if (!departurePos) { toast.error('Veuillez définir votre point de départ'); return; }
    const arrival = effectiveArrival || departurePos;
    const selected = candidates.filter(c => selectedIds.has(c.id));

    const config: OptimizationConfig = {
      visitTarget, strategy, zoneLogic: 'strict', zoneLogicFlags, typeFilter,
      excludeRecentDays: excludeRecent ? 7 : null,
      departureLat: departurePos.lat, departureLng: departurePos.lng,
      arrivalLat: arrival.lat, arrivalLng: arrival.lng,
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

  const getPointLabel = (type: PointType) => {
    switch (type) {
      case 'company': return 'Entreprise';
      case 'home': return 'Domicile';
      case 'custom': return 'Autre';
    }
  };

  const getPointDisplayAddress = (type: PointType) => getAddressLabel(type);

  const getZoneLogicLabels = (): string[] => {
    const labels: string[] = [];
    if (zoneLogicFlags.strict) labels.push('Zone stricte');
    if (zoneLogicFlags.tolerance) labels.push('Tolérance 15 km');
    if (zoneLogicFlags.route) labels.push('Trajet A/R');
    return labels.length > 0 ? labels : ['Zone stricte'];
  };

  const departureLabel = getPointLabel(departureType);
  const arrivalLabel = getPointLabel(arrivalType);
  const strategyLabel = strategy === 'nearest' ? 'Plus proche d\'abord' : 'Plus loin d\'abord';

  const openEditModal = (field: 'entreprise' | 'domicile' | 'autre') => {
    setEditAddress(addresses[`${field}_address`] || '');
    setEditingField(field);
  };

  const fieldLabelMap: Record<string, string> = {
    entreprise: 'Adresse entreprise',
    domicile: 'Adresse domicile',
    autre: 'Autre adresse',
  };

  // Render address selector block
  const renderPointSelector = (
    label: string,
    icon: React.ReactNode,
    selectedType: PointType,
    setType: (t: PointType) => void,
  ) => {
    const addr = getPointDisplayAddress(selectedType);
    const pos = getPosition(selectedType);
    const fieldMap: Record<PointType, 'entreprise' | 'domicile' | 'autre'> = {
      company: 'entreprise', home: 'domicile', custom: 'autre',
    };

    return (
      <div className="space-y-2">
        <label className="text-sm font-semibold flex items-center gap-1.5">
          {icon}
          {label}
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          <Button variant={selectedType === 'company' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
            onClick={() => setType('company')}>
            <Building2 className="h-3.5 w-3.5" />Entreprise
          </Button>
          <Button variant={selectedType === 'home' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
            onClick={() => setType('home')}>
            <Home className="h-3.5 w-3.5" />Domicile
          </Button>
          <Button variant={selectedType === 'custom' ? 'default' : 'outline'} className="h-10 text-xs gap-1"
            onClick={() => setType('custom')}>
            <MoreHorizontal className="h-3.5 w-3.5" />Autre
          </Button>
        </div>
        {/* Address display */}
        {addr && pos ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate flex-1">{addr}</span>
            <button onClick={() => openEditModal(fieldMap[selectedType])}
              className="text-primary hover:text-primary/80 shrink-0" title="Modifier">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">Adresse non renseignée</span>
            <Button variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => openEditModal(fieldMap[selectedType])}>
              Configurer
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
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
                {renderPointSelector(
                  'Point de départ',
                  <CircleDot className="h-4 w-4 text-primary" />,
                  departureType,
                  setDepartureType,
                )}

                {/* Arrival point */}
                {renderPointSelector(
                  "Point d'arrivée",
                  <Flag className="h-4 w-4 text-primary" />,
                  arrivalType,
                  setArrivalType,
                )}

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
                      <label className={`flex items-start gap-2.5 w-full rounded-lg border p-2.5 cursor-pointer transition-all ${
                        zoneLogicFlags.strict ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                      }`}>
                        <Checkbox checked={zoneLogicFlags.strict} disabled className="mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold">Respect strict de la zone</p>
                          <p className="text-[10px] text-muted-foreground">Toujours actif — base de la tournée</p>
                        </div>
                      </label>
                      <label className={`flex items-start gap-2.5 w-full rounded-lg border p-2.5 cursor-pointer transition-all ${
                        zoneLogicFlags.tolerance ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                      }`}
                        onClick={() => setZoneLogicFlags(f => ({ ...f, tolerance: !f.tolerance }))}>
                        <Checkbox checked={zoneLogicFlags.tolerance} className="mt-0.5"
                          onCheckedChange={v => setZoneLogicFlags(f => ({ ...f, tolerance: !!v }))} />
                        <div>
                          <p className="text-xs font-semibold">Tolérance zone (15 km)</p>
                          <p className="text-[10px] text-muted-foreground">Inclut les clients proches de la zone</p>
                        </div>
                      </label>
                      <label className={`flex items-start gap-2.5 w-full rounded-lg border p-2.5 cursor-pointer transition-all ${
                        zoneLogicFlags.route ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                      }`}
                        onClick={() => setZoneLogicFlags(f => ({ ...f, route: !f.route }))}>
                        <Checkbox checked={zoneLogicFlags.route} className="mt-0.5"
                          onCheckedChange={v => setZoneLogicFlags(f => ({ ...f, route: !!v }))} />
                        <div>
                          <p className="text-xs font-semibold">Clients sur le trajet aller/retour</p>
                          <p className="text-[10px] text-muted-foreground">Accepte les clients sur votre route</p>
                        </div>
                      </label>
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
                  {candidates.length === 0 && !departurePos && (
                    <p className="text-xs text-muted-foreground text-center">
                      <LocateFixed className="h-3.5 w-3.5 inline mr-1" />
                      Configurez votre adresse de départ pour voir les comptes éligibles
                    </p>
                  )}
                  {candidates.length === 0 && departurePos && (
                    <div className="text-center space-y-1">
                      <AlertTriangle className="h-5 w-5 text-warning mx-auto" />
                      <p className="text-xs text-muted-foreground">Aucun compte éligible dans cette zone</p>
                    </div>
                  )}
                  {departurePos && candidates.length > 0 && (
                    <div className="border-t pt-2 mt-2 space-y-1 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <CircleDot className="h-3 w-3 text-primary shrink-0" />
                        <span className="truncate">Départ : {getPointDisplayAddress(departureType) || departureLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Flag className="h-3 w-3 text-primary shrink-0" />
                        <span className="truncate">Arrivée : {getPointDisplayAddress(arrivalType) || arrivalLabel}</span>
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
                        <div className="flex items-start gap-2">
                          <MapPin className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                          <span>Zone : {getZoneLogicLabels().join(' + ')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t mt-auto">
                <Button className="w-full h-12 font-semibold" disabled={candidates.length === 0 || !departurePos} onClick={handleGeneratePreview}>
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
                              {departurePos && (
                                <>
                                  <span>·</span>
                                  <span>{c.distanceFromUser.toFixed(1)} km</span>
                                </>
                              )}
                            </div>
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
                <Button className="flex-1 h-11 font-semibold" disabled={selectedIds.size < 2 || !departurePos} onClick={handleOptimize}>
                  <Sparkles className="h-4 w-4 mr-2" />Optimiser ({selectedIds.size})
                </Button>
              </div>
              {!departurePos && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-warning text-center">⚠ Définissez un point de départ pour optimiser</p>
                </div>
              )}
            </div>
          )}

          {/* ── Result ── */}
          {step === 'result' && optimizedRoute && (
            <div className="flex-1 flex flex-col overflow-hidden">
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
                  <span className="flex items-center gap-1 truncate"><CircleDot className="h-3 w-3 text-primary shrink-0" />{getPointDisplayAddress(departureType) || departureLabel}</span>
                  <span>→</span>
                  <span className="flex items-center gap-1 truncate"><Flag className="h-3 w-3 text-primary shrink-0" />{getPointDisplayAddress(arrivalType) || arrivalLabel}</span>
                </div>
                {zoneName && (
                  <p className="text-[10px] text-center text-muted-foreground mt-1">{zoneName} · {strategyLabel} · {getZoneLogicLabels().join(' + ')}</p>
                )}
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-1">
                  <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <CircleDot className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium truncate">Départ — {getPointDisplayAddress(departureType) || departureLabel}</span>
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

                  <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Flag className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium truncate">Arrivée — {getPointDisplayAddress(arrivalType) || arrivalLabel}</span>
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

      {/* Address edit modal */}
      <Dialog open={!!editingField} onOpenChange={(o) => { if (!o) setEditingField(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? fieldLabelMap[editingField] : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Entrez l'adresse complète..."
              value={editAddress}
              onChange={e => setEditAddress(e.target.value)}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              L'adresse sera géocodée et sauvegardée automatiquement dans votre profil.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingField(null)}>Annuler</Button>
            <Button disabled={!editAddress.trim() || editSaving}
              onClick={() => editingField && saveAddress(editingField, editAddress.trim())}>
              {editSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Re-export types for consumers
export type { OptCustomer, OptimizedRoute };
