/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, MapPin, Route as RouteIcon, Clock, Navigation, Store, Hammer, Layers, AlertTriangle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

/**
 * GPS-style itinerary view for the day's tournée.
 *
 * Routing strategy:
 *  1. Use Google Maps DirectionsService with `optimizeWaypoints: true` to compute
 *     a real road-based polyline AND an optimized stop order in one call.
 *  2. If Directions fails (quota, no road found, etc.), fall back to a
 *     nearest-neighbor heuristic on great-circle distance and draw a clean
 *     non-crossing polyline through the reordered points.
 *
 * The optimized order is reflected in the marker numbering so the user
 * immediately understands the recommended sequence.
 */

export interface DayRouteStop {
  id: string;
  company_name: string;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  customer_type?: string | null;
  relationship_type?: string | null;
  visit_duration_minutes?: number | null;
  annual_revenue_potential?: number | null;
  last_visit_date?: string | null;
}

interface DayRouteMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stops: DayRouteStop[];
  zoneColor?: string | null;
  dayLabel?: string;
}

interface SavedPoint {
  lat: number;
  lng: number;
  label: string;
}

const FRANCE_CENTER = { lat: 46.6, lng: 2.5 };
const AVG_SPEED_KMH = 45;
const DEFAULT_VISIT_MIN = 30;
// Google caps optimizeWaypoints to ~25 intermediate stops; well above our 8–12 target.
const MAX_DIRECTIONS_WAYPOINTS = 23;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function fmtMin(min: number): string {
  if (!isFinite(min) || min <= 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

function relationshipBadge(rt?: string | null) {
  if (rt === 'magasin') return { label: 'Magasin', icon: Store };
  if (rt === 'atelier') return { label: 'Atelier', icon: Hammer };
  if (rt === 'mixte') return { label: 'Mixte', icon: Layers };
  return null;
}

function customerTypeBadge(t?: string | null) {
  if (t === 'client_actif') return 'Client';
  if (t === 'prospect_qualifie') return 'Prospect qualifié';
  if (t === 'prospect') return 'Prospect';
  return null;
}

/** Order points by nearest-neighbor starting from `start`. Returns indices into `stops`. */
function nearestNeighborOrder(
  start: { lat: number; lng: number },
  stops: Array<{ lat: number; lng: number }>,
): number[] {
  const remaining = stops.map((_, i) => i);
  const order: number[] = [];
  let current = start;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, stops[remaining[i]]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const picked = remaining.splice(bestIdx, 1)[0];
    order.push(picked);
    current = stops[picked];
  }
  return order;
}

interface RouteResult {
  /** order is a permutation of indices into the geocoded stops array */
  order: number[];
  /** Polyline path: real road geometry from Directions, or straight legs as fallback */
  path: google.maps.LatLngLiteral[];
  /** Total distance in km */
  km: number;
  /** Total drive time in minutes */
  driveMin: number;
  /** True if real road routing was used (vs nearest-neighbor fallback) */
  usedRouting: boolean;
}

/** Module-level cache keyed by origin + ordered stop ids to avoid repeated API calls. */
const routeCache = new Map<string, RouteResult>();
function cacheKey(origin: SavedPoint | null, ids: string[]): string {
  const o = origin ? `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}` : 'no-origin';
  return `${o}|${[...ids].sort().join(',')}`;
}

export default function DayRouteMapDialog({
  open,
  onOpenChange,
  stops,
  zoneColor,
  dayLabel,
}: DayRouteMapDialogProps) {
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;

  const containerRef = useRef<HTMLDivElement>(null);
  const overlaysRef = useRef<Array<google.maps.Marker | google.maps.Polyline>>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState<SavedPoint | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);

  // Wait for Google Maps SDK
  useEffect(() => {
    if (!open) return;
    const check = () => typeof google !== 'undefined' && !!google.maps;
    if (check()) { setReady(true); return; }
    const iv = setInterval(() => { if (check()) { setReady(true); clearInterval(iv); } }, 200);
    return () => clearInterval(iv);
  }, [open]);

  // Load the user's saved company/home/other point for A & B
  useEffect(() => {
    if (!open || !activeUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('entreprise_address, entreprise_lat, entreprise_lng, domicile_address, domicile_lat, domicile_lng, autre_address, autre_lat, autre_lng')
        .eq('id', activeUserId)
        .maybeSingle();
      if (cancelled || !data) return;
      const candidates: Array<{ lat?: number | null; lng?: number | null; label: string }> = [
        { lat: (data as any).entreprise_lat, lng: (data as any).entreprise_lng, label: (data as any).entreprise_address || 'Entreprise' },
        { lat: (data as any).domicile_lat, lng: (data as any).domicile_lng, label: (data as any).domicile_address || 'Domicile' },
        { lat: (data as any).autre_lat, lng: (data as any).autre_lng, label: (data as any).autre_address || 'Autre' },
      ];
      const found = candidates.find(c => typeof c.lat === 'number' && typeof c.lng === 'number');
      setOrigin(found ? { lat: found.lat as number, lng: found.lng as number, label: found.label } : null);
    })();
    return () => { cancelled = true; };
  }, [open, activeUserId]);

  const geocodedStops = useMemo(
    () => stops.filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number'),
    [stops],
  );

  // Compute route: optimized order + real polyline
  useEffect(() => {
    if (!open || !ready || geocodedStops.length === 0) {
      setRoute(null);
      return;
    }

    const ids = geocodedStops.map(s => s.id);
    const key = cacheKey(origin, ids);
    const cached = routeCache.get(key);
    if (cached) { setRoute(cached); return; }

    let cancelled = false;
    setRouting(true);

    const run = async () => {
      const positions = geocodedStops.map(s => ({ lat: s.latitude as number, lng: s.longitude as number }));
      const start = origin ? { lat: origin.lat, lng: origin.lng } : positions[0];
      const end = origin ? { lat: origin.lat, lng: origin.lng } : positions[positions.length - 1];

      // Try Google Directions with waypoint optimization first.
      // We optimize all stops (or all but the first when no origin is provided).
      const waypointSourceIdx = origin
        ? positions.map((_, i) => i)              // [0..n-1] all geocoded stops
        : positions.map((_, i) => i).slice(1, -1); // exclude pinned start & end

      const useDirections =
        waypointSourceIdx.length > 0 &&
        waypointSourceIdx.length <= MAX_DIRECTIONS_WAYPOINTS;

      if (useDirections) {
        try {
          const ds = new google.maps.DirectionsService();
          const waypoints = waypointSourceIdx.map(i => ({ location: positions[i], stopover: true }));
          const result = await ds.route({
            origin: start,
            destination: end,
            waypoints,
            optimizeWaypoints: true,
            travelMode: google.maps.TravelMode.DRIVING,
          });

          if (cancelled) return;
          const r = result.routes[0];
          if (r) {
            // r.waypoint_order contains the optimized order of `waypoints`,
            // so we rebuild full stop order from it.
            const optimized: number[] = [];
            if (origin) {
              r.waypoint_order.forEach(o => optimized.push(waypointSourceIdx[o]));
            } else {
              optimized.push(0);
              r.waypoint_order.forEach(o => optimized.push(waypointSourceIdx[o]));
              optimized.push(positions.length - 1);
            }

            // Real road polyline + summed metrics from each leg
            let km = 0;
            let driveSec = 0;
            const path: google.maps.LatLngLiteral[] = [];
            r.legs.forEach(leg => {
              km += (leg.distance?.value || 0) / 1000;
              driveSec += leg.duration?.value || 0;
              leg.steps.forEach(step => {
                step.path?.forEach(p => path.push({ lat: p.lat(), lng: p.lng() }));
              });
            });

            const result2: RouteResult = {
              order: optimized,
              path,
              km,
              driveMin: driveSec / 60,
              usedRouting: true,
            };
            routeCache.set(key, result2);
            setRoute(result2);
            setRouting(false);
            return;
          }
        } catch (err) {
          console.warn('[DayRouteMap] Directions failed, falling back to nearest-neighbor', err);
        }
      }

      // Fallback: nearest-neighbor from `start`, straight-leg polyline
      if (cancelled) return;
      const nnOrder = nearestNeighborOrder(start, positions);
      // If no origin, force first geocoded stop to remain the entry point
      const order = origin ? nnOrder : (() => {
        const idx = nnOrder.indexOf(0);
        if (idx > 0) { nnOrder.splice(idx, 1); nnOrder.unshift(0); }
        return nnOrder;
      })();
      const seq: google.maps.LatLngLiteral[] = [];
      if (origin) seq.push({ lat: origin.lat, lng: origin.lng });
      order.forEach(i => seq.push(positions[i]));
      if (origin) seq.push({ lat: origin.lat, lng: origin.lng });
      let km = 0;
      for (let i = 0; i < seq.length - 1; i++) km += haversineKm(seq[i], seq[i + 1]);
      const fb: RouteResult = {
        order,
        path: seq,
        km,
        driveMin: (km / AVG_SPEED_KMH) * 60,
        usedRouting: false,
      };
      routeCache.set(key, fb);
      setRoute(fb);
      setRouting(false);
    };

    run();
    return () => { cancelled = true; };
  }, [open, ready, geocodedStops, origin]);

  // Effective ordered stops, derived from route.order if available
  const orderedStops = useMemo(() => {
    if (!route) return geocodedStops;
    return route.order.map(i => geocodedStops[i]);
  }, [route, geocodedStops]);

  const summary = useMemo(() => {
    const visitMin = stops.reduce((sum, s) => sum + (s.visit_duration_minutes ?? DEFAULT_VISIT_MIN), 0);
    const km = route?.km ?? 0;
    const driveMin = route?.driveMin ?? 0;
    return {
      visits: stops.length,
      km,
      driveMin,
      visitMin,
      totalMin: driveMin + visitMin,
      missingGeo: stops.length - geocodedStops.length,
      usedRouting: route?.usedRouting ?? false,
    };
  }, [route, stops, geocodedStops]);

  // Render markers + polyline
  useEffect(() => {
    if (!open || !ready || !containerRef.current) return;

    overlaysRef.current.forEach(o => (o as any).setMap?.(null));
    overlaysRef.current = [];

    const map = new google.maps.Map(containerRef.current, {
      center: FRANCE_CENTER,
      zoom: 6,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: 'greedy',
    });
    mapRef.current = map;

    const bounds = new google.maps.LatLngBounds();
    let hasContent = false;

    if (origin) {
      const aMarker = new google.maps.Marker({
        position: { lat: origin.lat, lng: origin.lng },
        map,
        title: `Départ — ${origin.label}`,
        label: { text: 'A', color: '#ffffff', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#0f172a', fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 2, scale: 13,
        },
        zIndex: 1000,
      });
      const aInfo = new google.maps.InfoWindow({
        content: `<div style="font-size:12px;font-weight:700">Départ</div><div style="font-size:11px;color:#666">${origin.label}</div>`,
      });
      aMarker.addListener('click', () => aInfo.open({ map, anchor: aMarker }));
      overlaysRef.current.push(aMarker);
      bounds.extend({ lat: origin.lat, lng: origin.lng });
      hasContent = true;
    }

    orderedStops.forEach((s, i) => {
      const pos = { lat: s.latitude as number, lng: s.longitude as number };
      const marker = new google.maps.Marker({
        position: pos, map,
        title: `${i + 1}. ${s.company_name}`,
        label: { text: String(i + 1), color: '#ffffff', fontWeight: '700', fontSize: '11px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: zoneColor || '#2563eb', fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 2, scale: 12,
        },
        zIndex: 500 + i,
      });
      const rt = relationshipBadge(s.relationship_type);
      const ct = customerTypeBadge(s.customer_type);
      const html = `
        <div style="font-size:12px;font-weight:700;margin-bottom:2px">${i + 1}. ${s.company_name}</div>
        ${s.city ? `<div style="font-size:11px;color:#666">${s.city}</div>` : ''}
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
          ${ct ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#f1f5f9;color:#334155">${ct}</span>` : ''}
          ${rt ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${rt.label === 'Magasin' ? '#dbeafe;color:#1d4ed8' : rt.label === 'Atelier' ? '#ffedd5;color:#c2410c' : '#ede9fe;color:#6d28d9'}">${rt.label}</span>` : ''}
        </div>`;
      const info = new google.maps.InfoWindow({ content: html });
      marker.addListener('click', () => info.open({ map, anchor: marker }));
      overlaysRef.current.push(marker);
      bounds.extend(pos);
      hasContent = true;
    });

    if (origin && orderedStops.length > 0) {
      const bMarker = new google.maps.Marker({
        position: { lat: origin.lat, lng: origin.lng },
        map,
        title: `Arrivée — ${origin.label}`,
        label: { text: 'B', color: '#ffffff', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#475569', fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 2, scale: 13,
        },
        zIndex: 1001,
      });
      overlaysRef.current.push(bMarker);
    }

    if (route && route.path.length >= 2) {
      const line = new google.maps.Polyline({
        path: route.path,
        strokeColor: zoneColor || '#2563eb',
        strokeOpacity: route.usedRouting ? 0.9 : 0.6,
        strokeWeight: route.usedRouting ? 4 : 3,
        geodesic: true,
        // Arrows only on the simplified fallback line; the real road polyline is dense.
        icons: route.usedRouting ? undefined : [{
          icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5 },
          offset: '50%',
          repeat: '120px',
        }],
      });
      line.setMap(map);
      overlaysRef.current.push(line);
    }

    if (hasContent) map.fitBounds(bounds, 70);
  }, [open, ready, orderedStops, origin, route, zoneColor]);

  const externalGmapsUrl = useMemo(() => {
    if (orderedStops.length === 0) return null;
    const fmt = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
    const start = origin ? fmt(origin) : fmt({ lat: orderedStops[0].latitude as number, lng: orderedStops[0].longitude as number });
    const end = origin ? fmt(origin) : fmt({ lat: orderedStops[orderedStops.length - 1].latitude as number, lng: orderedStops[orderedStops.length - 1].longitude as number });
    const wpStops = origin ? orderedStops : orderedStops.slice(1, -1);
    const waypoints = wpStops
      .map(s => fmt({ lat: s.latitude as number, lng: s.longitude as number }))
      .join('|');
    const wp = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
    return `https://www.google.com/maps/dir/?api=1&origin=${start}&destination=${end}${wp}&travelmode=driving`;
  }, [orderedStops, origin]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base flex-wrap">
            <RouteIcon className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Trajet du jour{dayLabel ? ` — ${dayLabel}` : ''}</span>
            <Badge variant="secondary" className="gap-1 font-medium">
              <MapPin className="h-3 w-3" />
              {summary.visits} visite{summary.visits > 1 ? 's' : ''}
            </Badge>
            {summary.usedRouting && !routing && (
              <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                <Sparkles className="h-3 w-3" /> Itinéraire optimisé
              </Badge>
            )}
            {!summary.usedRouting && route && !routing && (
              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                <AlertTriangle className="h-3 w-3" /> Approximation
              </Badge>
            )}
            {summary.missingGeo > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {summary.missingGeo} non géolocalisé{summary.missingGeo > 1 ? 's' : ''}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Summary bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 py-2.5 border-b bg-muted/30 text-xs">
          <div className="flex items-center gap-1.5">
            <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">{summary.km.toFixed(1)} km</span>
            <span className="text-muted-foreground">trajet</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Navigation className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">{fmtMin(summary.driveMin)}</span>
            <span className="text-muted-foreground">conduite</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">{fmtMin(summary.visitMin)}</span>
            <span className="text-muted-foreground">visites</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="font-bold text-primary">{fmtMin(summary.totalMin)}</span>
            <span className="text-muted-foreground">total estimé</span>
          </div>
        </div>

        {/* Map */}
        <div className="relative h-[60vh] min-h-[420px] bg-muted">
          <div ref={containerRef} className="absolute inset-0" />
          {(!ready || routing) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              {routing && <p className="text-xs text-muted-foreground">Calcul du trajet optimisé…</p>}
            </div>
          )}
          {ready && stops.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 text-center px-6">
              <RouteIcon className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Aucune visite planifiée pour ce jour</p>
              <p className="text-xs text-muted-foreground mt-1">Ajoutez des clients à la tournée pour visualiser le trajet.</p>
            </div>
          )}
          {ready && stops.length > 0 && geocodedStops.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 text-center px-6">
              <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Aucun arrêt géolocalisé</p>
              <p className="text-xs text-muted-foreground mt-1">Renseignez les adresses des clients pour afficher l'itinéraire.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-background gap-2">
          <p className="text-[11px] text-muted-foreground">
            {summary.usedRouting
              ? 'Distance et durée calculées par Google Maps (sans trafic en temps réel).'
              : `Estimations indicatives (vitesse moyenne ${AVG_SPEED_KMH} km/h).`}
          </p>
          {externalGmapsUrl && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" asChild>
              <a href={externalGmapsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-3.5 w-3.5" />
                Ouvrir dans Google Maps
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
