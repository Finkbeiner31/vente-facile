import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import {
  Loader2, Navigation, MapPin, Play, Trash2, Route, Sparkles,
  LocateFixed, AlertTriangle, GripVertical, ChevronRight,
} from 'lucide-react';
import { formatMonthly } from '@/lib/revenueUtils';
import { toast } from 'sonner';

// ── Types ──

interface OptCustomer {
  id: string;
  company_name: string;
  customer_type: string;
  city: string;
  latitude: number;
  longitude: number;
  number_of_vehicles: number;
  annual_revenue_potential: number;
  last_visit_date: string | null;
  phone: string | null;
  sales_potential: string | null;
  visit_frequency: string | null;
  address: string | null;
}

export interface OptimizedRoute {
  customers: OptCustomer[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
}

type TypeFilter = 'tous' | 'clients' | 'prospects';

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

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function calcPriorityScore(
  c: OptCustomer,
  userLat: number,
  userLng: number,
  maxDistance: number
): number {
  let score = 0;
  const monthly = c.annual_revenue_potential / 12;

  // Potential weight (50%)
  if (monthly >= 5000) score += 50;
  else if (monthly >= 2000) score += 30;
  else if (monthly >= 500) score += 15;
  else score += 5;

  // Visit recency weight (30%)
  const days = daysSince(c.last_visit_date);
  if (days === null) score += 30; // never visited
  else if (days > 60) score += 28;
  else if (days > 30) score += 22;
  else if (days > 14) score += 12;
  else score += 3;

  // Distance weight (20%) — closer = higher
  const dist = haversineKm(userLat, userLng, c.latitude, c.longitude);
  const distRatio = Math.max(0, 1 - dist / maxDistance);
  score += Math.round(distRatio * 20);

  return score;
}

/** Nearest-neighbor TSP heuristic starting from user position */
function optimizeRouteOrder(
  customers: OptCustomer[],
  startLat: number,
  startLng: number
): { ordered: OptCustomer[]; totalKm: number } {
  if (customers.length === 0) return { ordered: [], totalKm: 0 };

  const remaining = [...customers];
  const ordered: OptCustomer[] = [];
  let currentLat = startLat;
  let currentLng = startLng;
  let totalKm = 0;

  while (remaining.length > 0) {
    let minDist = Infinity;
    let minIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(currentLat, currentLng, remaining[i].latitude, remaining[i].longitude);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    totalKm += minDist;
    const next = remaining.splice(minIdx, 1)[0];
    ordered.push(next);
    currentLat = next.latitude;
    currentLng = next.longitude;
  }

  return { ordered, totalKm };
}

// ── Component ──

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRouteGenerated?: (route: OptimizedRoute) => void;
  initialUserPos?: { lat: number; lng: number } | null;
}

export default function RouteOptimizerSheet({ open, onOpenChange, onRouteGenerated, initialUserPos }: Props) {
  const { user } = useAuth();

  // Config state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tous');
  const [radiusKm, setRadiusKm] = useState(30);
  const [maxVisits, setMaxVisits] = useState(10);
  const [excludeRecent, setExcludeRecent] = useState(true);

  // Process state
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(initialUserPos || null);
  const [locating, setLocating] = useState(false);
  const [step, setStep] = useState<'config' | 'preview' | 'result'>('config');
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('config');
      setOptimizedRoute(null);
      setSelectedIds(new Set());
      if (initialUserPos) setUserPos(initialUserPos);
    }
  }, [open, initialUserPos]);

  // Fetch all geolocated customers
  const { data: allCustomers = [], isLoading } = useQuery({
    queryKey: ['customers-optimizer', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, company_name, customer_type, city, latitude, longitude, number_of_vehicles, annual_revenue_potential, last_visit_date, phone, sales_potential, visit_frequency, address')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (error) throw error;
      return (data || []) as OptCustomer[];
    },
    enabled: open && !!user,
  });

  // Filter & score candidates
  const candidates = useMemo(() => {
    if (!userPos) return [];
    return allCustomers
      .filter(c => {
        if (typeFilter === 'clients' && c.customer_type === 'prospect') return false;
        if (typeFilter === 'prospects' && c.customer_type !== 'prospect') return false;
        // Distance filter
        const dist = haversineKm(userPos.lat, userPos.lng, c.latitude, c.longitude);
        if (dist > radiusKm) return false;
        // Exclude recently visited
        if (excludeRecent) {
          const days = daysSince(c.last_visit_date);
          if (days !== null && days <= 7) return false;
        }
        return true;
      })
      .map(c => ({
        ...c,
        score: calcPriorityScore(c, userPos.lat, userPos.lng, radiusKm),
        distance: haversineKm(userPos.lat, userPos.lng, c.latitude, c.longitude),
      }))
      .sort((a, b) => b.score - a.score);
  }, [allCustomers, userPos, typeFilter, radiusKm, excludeRecent]);

  // Geolocate
  const handleLocate = () => {
    if (!navigator.geolocation) {
      toast.error('Géolocalisation non disponible');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success('Position détectée');
      },
      () => {
        setLocating(false);
        toast.error('Impossible d\'obtenir votre position');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Generate preview
  const handleGeneratePreview = () => {
    const top = candidates.slice(0, maxVisits);
    setSelectedIds(new Set(top.map(c => c.id)));
    setStep('preview');
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Optimize & show result
  const handleOptimize = () => {
    if (!userPos) return;
    const selected = candidates.filter(c => selectedIds.has(c.id));
    const { ordered, totalKm } = optimizeRouteOrder(selected, userPos.lat, userPos.lng);
    const estimatedMin = Math.round(totalKm * 1.8 + ordered.length * 25); // ~1.8 min/km + 25min per visit

    const route: OptimizedRoute = {
      customers: ordered,
      totalDistanceKm: Math.round(totalKm * 10) / 10,
      estimatedDurationMin: estimatedMin,
    };
    setOptimizedRoute(route);
    setStep('result');
  };

  // Save route to DB
  const handleSaveAndStart = async () => {
    if (!user || !optimizedRoute) return;
    setSaving(true);
    try {
      // Create route
      const { data: route, error: routeErr } = await supabase
        .from('routes')
        .insert({
          rep_id: user.id,
          route_date: new Date().toISOString().split('T')[0],
          status: 'planned',
          total_distance_km: optimizedRoute.totalDistanceKm,
          estimated_duration_min: optimizedRoute.estimatedDurationMin,
          notes: `Tournée optimisée — ${optimizedRoute.customers.length} visites`,
        })
        .select('id')
        .single();
      if (routeErr) throw routeErr;

      // Create stops
      const stops = optimizedRoute.customers.map((c, i) => ({
        route_id: route.id,
        customer_id: c.id,
        stop_order: i + 1,
        status: 'planned',
      }));
      const { error: stopsErr } = await supabase
        .from('route_stops')
        .insert(stops);
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            Optimiser ma tournée
          </SheetTitle>
        </SheetHeader>

        {/* ── Step: Config ── */}
        {step === 'config' && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-5">
              {/* GPS */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">📍 Point de départ</label>
                {userPos ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <LocateFixed className="h-3 w-3 mr-1" />
                      Position détectée
                    </Badge>
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleLocate}>
                      Actualiser
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full h-11" onClick={handleLocate} disabled={locating}>
                    {locating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LocateFixed className="h-4 w-4 mr-2" />}
                    Utiliser ma position GPS
                  </Button>
                )}
              </div>

              {/* Type filter */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">🏢 Type de compte</label>
                <Select value={typeFilter} onValueChange={v => setTypeFilter(v as TypeFilter)}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tous">Tous (clients + prospects)</SelectItem>
                    <SelectItem value="clients">Clients uniquement</SelectItem>
                    <SelectItem value="prospects">Prospects uniquement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Radius */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">📏 Rayon de recherche : {radiusKm} km</label>
                <Slider
                  value={[radiusKm]}
                  onValueChange={v => setRadiusKm(v[0])}
                  min={5}
                  max={100}
                  step={5}
                  className="py-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>5 km</span>
                  <span>100 km</span>
                </div>
              </div>

              {/* Max visits */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">🎯 Nombre de visites : {maxVisits}</label>
                <Slider
                  value={[maxVisits]}
                  onValueChange={v => setMaxVisits(v[0])}
                  min={3}
                  max={20}
                  step={1}
                  className="py-2"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>3 visites</span>
                  <span>20 visites</span>
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="excludeRecent"
                  checked={excludeRecent}
                  onCheckedChange={v => setExcludeRecent(!!v)}
                />
                <label htmlFor="excludeRecent" className="text-sm cursor-pointer">
                  Exclure les clients visités récemment (≤ 7 jours)
                </label>
              </div>

              {/* Candidates count */}
              {userPos && (
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-sm">
                    <span className="font-bold text-primary">{candidates.length}</span> clients trouvés
                    dans un rayon de {radiusKm} km
                  </p>
                  {candidates.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Élargissez le rayon ou changez les filtres
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Action */}
            <div className="p-4 border-t mt-auto">
              <Button
                className="w-full h-12 font-semibold"
                disabled={!userPos || candidates.length === 0}
                onClick={handleGeneratePreview}
              >
                <Route className="h-4 w-4 mr-2" />
                Générer la tournée ({Math.min(maxVisits, candidates.length)} visites)
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Preview ── */}
        {step === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
              <p className="text-sm font-semibold">
                {selectedIds.size} visites sélectionnées sur {candidates.length} disponibles
              </p>
              <p className="text-xs text-muted-foreground">
                Décochez pour retirer · Cochez pour ajouter
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {candidates.map((c, i) => {
                  const isSelected = selectedIds.has(c.id);
                  const days = daysSince(c.last_visit_date);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleSelection(c.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-primary/5' : 'opacity-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox checked={isSelected} className="shrink-0 pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{c.company_name}</span>
                            <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                              {c.score}pts
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span>{c.city}</span>
                            <span>·</span>
                            <span className="font-medium">{formatMonthly(c.annual_revenue_potential)}</span>
                            <span>·</span>
                            <span>{c.distance.toFixed(1)} km</span>
                            {days === null && (
                              <>
                                <span>·</span>
                                <span className="text-destructive flex items-center gap-0.5">
                                  <AlertTriangle className="h-3 w-3" /> Jamais visité
                                </span>
                              </>
                            )}
                            {days !== null && days > 30 && (
                              <>
                                <span>·</span>
                                <span className="text-warning">+{days}j</span>
                              </>
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
              <Button variant="outline" className="flex-1 h-11" onClick={() => setStep('config')}>
                Retour
              </Button>
              <Button
                className="flex-1 h-11 font-semibold"
                disabled={selectedIds.size < 2}
                onClick={handleOptimize}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Optimiser ({selectedIds.size})
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Result ── */}
        {step === 'result' && optimizedRoute && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Stats */}
            <div className="px-4 py-3 border-b bg-muted/30 shrink-0">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-primary">{optimizedRoute.customers.length}</p>
                  <p className="text-[10px] text-muted-foreground">visites</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{optimizedRoute.totalDistanceKm} km</p>
                  <p className="text-[10px] text-muted-foreground">distance</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{formatDuration(optimizedRoute.estimatedDurationMin)}</p>
                  <p className="text-[10px] text-muted-foreground">durée estimée</p>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {optimizedRoute.customers.map((c, i) => (
                  <div key={c.id} className="rounded-xl border p-3 flex items-center gap-3">
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
                        <span>{c.number_of_vehicles} véh.</span>
                      </div>
                    </div>
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t space-y-2 shrink-0">
              <Button
                className="w-full h-12 font-semibold"
                onClick={handleSaveAndStart}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Créer et démarrer la tournée
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-10" onClick={() => setStep('preview')}>
                  Modifier la sélection
                </Button>
                <Button variant="outline" className="flex-1 h-10" onClick={() => {
                  setStep('config');
                  setOptimizedRoute(null);
                }}>
                  Recommencer
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
