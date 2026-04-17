/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, MapPin, Route as RouteIcon, Clock, Navigation, Store, Hammer, Layers, AlertTriangle, Sparkles, CircleDot, Flag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import {
  loadPrefs, type PointType, pointTypeLabel, strategyLabel, relationshipLabel,
} from '@/lib/tourneePrefs';
import { routeWithDirections, MAX_DIRECTIONS_WAYPOINTS } from '@/lib/directionsRouting';

/**
 * GPS-style itinerary view for the day's tournée.
 *
 * Routing strategy:
 *  1. Resolve A (départ) and B (arrivée) from the user's persisted optimizer
 *     preferences (Entreprise / Domicile / Autre). A and B can differ.
 *  2. Use Google Directions with `optimizeWaypoints` (via routeWithDirections)
 *     to compute a real road polyline + an optimized stop order that respects
 *     the chosen 'nearest' / 'farthest' strategy.
 *  3. If Directions fails, fall back to a nearest-neighbor heuristic (or a
 *     farthest-first pass if the user picked that strategy) and draw a clean
 *     non-crossing polyline through the reordered points.
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
  zoneName?: string | null;
}

interface SavedPoint {
  lat: number;
  lng: number;
  label: string;
  type: PointType;
}

interface RenderMarkerItem {
  key: string;
  kind: 'departure' | 'stop' | 'arrival';
  position: google.maps.LatLngLiteral;
  displayPosition: google.maps.LatLngLiteral;
  title: string;
  label: string;
  stop?: DayRouteStop;
  stopNumber?: number;
  pointType?: PointType;
  pointLabel?: string;
}

const FRANCE_CENTER = { lat: 46.6, lng: 2.5 };
const AVG_SPEED_KMH = 45;
const DEFAULT_VISIT_MIN = 30;

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
function cacheKey(
  start: { lat: number; lng: number } | null,
  end: { lat: number; lng: number } | null,
  strategy: string,
  ids: string[],
): string {
  const s = start ? `${start.lat.toFixed(5)},${start.lng.toFixed(5)}` : 'no-start';
  const e = end ? `${end.lat.toFixed(5)},${end.lng.toFixed(5)}` : 'no-end';
  return `${s}|${e}|${strategy}|${ids.join(',')}`;
}

interface ProfileAddresses {
  entreprise_lat: number | null; entreprise_lng: number | null; entreprise_address: string | null;
  domicile_lat: number | null; domicile_lng: number | null; domicile_address: string | null;
  autre_lat: number | null; autre_lng: number | null; autre_address: string | null;
}

function resolvePoint(type: PointType, addr: ProfileAddresses | null): SavedPoint | null {
  if (!addr) return null;
  switch (type) {
    case 'company':
      return addr.entreprise_lat != null && addr.entreprise_lng != null
        ? { lat: addr.entreprise_lat, lng: addr.entreprise_lng, label: addr.entreprise_address || 'Entreprise', type }
        : null;
    case 'home':
      return addr.domicile_lat != null && addr.domicile_lng != null
        ? { lat: addr.domicile_lat, lng: addr.domicile_lng, label: addr.domicile_address || 'Domicile', type }
        : null;
    case 'custom':
      return addr.autre_lat != null && addr.autre_lng != null
        ? { lat: addr.autre_lat, lng: addr.autre_lng, label: addr.autre_address || 'Autre', type }
        : null;
  }
}

function firstAvailablePoint(addr: ProfileAddresses | null): SavedPoint | null {
  return resolvePoint('company', addr) || resolvePoint('home', addr) || resolvePoint('custom', addr);
}

function coordinateKey(point: google.maps.LatLngLiteral): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

function offsetDuplicatePosition(
  base: google.maps.LatLngLiteral,
  index: number,
  total: number,
): google.maps.LatLngLiteral {
  if (total <= 1) return base;

  const ring = Math.floor(index / 8);
  const radius = 0.00022 + ring * 0.00008;
  const angle = ((index % 8) / Math.min(total, 8)) * Math.PI * 2 - Math.PI / 2;
  const lngScale = Math.max(Math.cos((base.lat * Math.PI) / 180), 0.35);

  return {
    lat: base.lat + Math.sin(angle) * radius,
    lng: base.lng + (Math.cos(angle) * radius) / lngScale,
  };
}

export default function DayRouteMapDialog({
  open,
  onOpenChange,
  stops,
  zoneColor,
  dayLabel,
  zoneName,
}: DayRouteMapDialogProps) {
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;

  // Persisted optimizer prefs drive A, B and strategy so this view stays
  // consistent with what the user configured in "Optimiser ma tournée".
  const prefs = useMemo(() => loadPrefs(user?.id), [user?.id, open]);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlaysRef = useRef<Array<google.maps.Marker | google.maps.Polyline>>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [addresses, setAddresses] = useState<ProfileAddresses | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const check = () => typeof google !== 'undefined' && !!google.maps;
    if (check()) { setReady(true); return; }
    const iv = setInterval(() => { if (check()) { setReady(true); clearInterval(iv); } }, 200);
    return () => clearInterval(iv);
  }, [open]);

  useEffect(() => {
    if (!open || !activeUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('entreprise_address, entreprise_lat, entreprise_lng, domicile_address, domicile_lat, domicile_lng, autre_address, autre_lat, autre_lng')
        .eq('id', activeUserId)
        .maybeSingle();
      if (cancelled) return;
      setAddresses((data as any) || null);
    })();
    return () => { cancelled = true; };
  }, [open, activeUserId]);

  // Resolve A from the user's chosen departure type. If that exact type has
  // no saved coordinates we fall back to the next available saved point
  // (firstAvailablePoint) so A is still rendered. We also surface a warning
  // to the user when their actual selection is not honored.
  const resolvedDeparture = useMemo(
    () => resolvePoint(prefs.departureType, addresses),
    [prefs.departureType, addresses],
  );
  const resolvedArrival = useMemo(
    () => resolvePoint(prefs.arrivalType, addresses),
    [prefs.arrivalType, addresses],
  );
  const departurePoint: SavedPoint | null = useMemo(
    () => resolvedDeparture || firstAvailablePoint(addresses),
    [resolvedDeparture, addresses],
  );
  const arrivalPoint: SavedPoint | null = useMemo(
    () => resolvedArrival || departurePoint,
    [resolvedArrival, departurePoint],
  );

  // Warn explicitly when the selected departure/arrival type has no saved
  // coordinates on the profile. This is the root cause of "A/B markers don't
  // appear" for users who never configured their entreprise/domicile address.
  const departureMissing = !!addresses && !resolvedDeparture;
  const arrivalMissing = !!addresses && !resolvedArrival;

  // Dev-friendly debug trace so the propagation of A/B is verifiable.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line no-console
    console.debug('[DayRouteMapDialog] A/B resolution', {
      prefsDepartureType: prefs.departureType,
      prefsArrivalType: prefs.arrivalType,
      strategy: prefs.strategy,
      hasProfileAddresses: !!addresses,
      resolvedDeparture,
      resolvedArrival,
      finalDeparture: departurePoint,
      finalArrival: arrivalPoint,
      departureMissing,
      arrivalMissing,
      stopCount: stops.length,
    });
  }, [open, prefs.departureType, prefs.arrivalType, prefs.strategy, addresses, resolvedDeparture, resolvedArrival, departurePoint, arrivalPoint, departureMissing, arrivalMissing, stops.length]);

  const geocodedStops = useMemo(
    () => stops.filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number'),
    [stops],
  );

  useEffect(() => {
    if (!open || !ready || geocodedStops.length === 0) {
      setRoute(null);
      return;
    }

    const ids = geocodedStops.map(s => s.id);
    const key = cacheKey(departurePoint, arrivalPoint, prefs.strategy, ids);
    const cached = routeCache.get(key);
    if (cached) { setRoute(cached); return; }

    let cancelled = false;
    setRouting(true);

    const run = async () => {
      const positions = geocodedStops.map(s => ({ lat: s.latitude as number, lng: s.longitude as number }));
      const start = departurePoint
        ? { lat: departurePoint.lat, lng: departurePoint.lng }
        : positions[0];
      const end = arrivalPoint
        ? { lat: arrivalPoint.lat, lng: arrivalPoint.lng }
        : (departurePoint ? { lat: departurePoint.lat, lng: departurePoint.lng } : positions[positions.length - 1]);

      // 1. Google Directions with strategy-aware optimization
      if (positions.length > 0 && positions.length <= MAX_DIRECTIONS_WAYPOINTS) {
        const dr = await routeWithDirections(start, positions, end, prefs.strategy);
        if (cancelled) return;
        if (dr) {
          const result: RouteResult = {
            order: dr.order, path: dr.path, km: dr.km, driveMin: dr.driveMin, usedRouting: true,
          };
          routeCache.set(key, result);
          setRoute(result);
          setRouting(false);
          return;
        }
      }

      // 2. Fallback honoring A/B and strategy
      if (cancelled) return;
      let order: number[];
      if (prefs.strategy === 'farthest' && positions.length >= 2) {
        let maxD = -1; let maxI = 0;
        positions.forEach((p, i) => {
          const d = haversineKm(start, p);
          if (d > maxD) { maxD = d; maxI = i; }
        });
        const remainingIdx = positions.map((_, i) => i).filter(i => i !== maxI);
        const tail = nearestNeighborOrder(positions[maxI], remainingIdx.map(i => positions[i]));
        order = [maxI, ...tail.map(t => remainingIdx[t])];
      } else {
        order = nearestNeighborOrder(start, positions);
      }

      const seq: google.maps.LatLngLiteral[] = [start];
      order.forEach(i => seq.push(positions[i]));
      seq.push(end);
      let km = 0;
      for (let i = 0; i < seq.length - 1; i++) km += haversineKm(seq[i], seq[i + 1]);
      const fb: RouteResult = {
        order, path: seq, km, driveMin: (km / AVG_SPEED_KMH) * 60, usedRouting: false,
      };
      routeCache.set(key, fb);
      setRoute(fb);
      setRouting(false);
    };

    run();
    return () => { cancelled = true; };
  }, [open, ready, geocodedStops, departurePoint, arrivalPoint, prefs.strategy]);

  // Effective ordered stops, derived from route.order if available
  const orderedStops = useMemo(() => {
    if (geocodedStops.length === 0) return [];
    if (!route || route.order.length === 0) return geocodedStops;

    const seen = new Set<number>();
    const mapped = route.order
      .filter((index) => Number.isInteger(index) && index >= 0 && index < geocodedStops.length)
      .filter((index) => {
        if (seen.has(index)) return false;
        seen.add(index);
        return true;
      })
      .map((index) => geocodedStops[index]);

    if (mapped.length === geocodedStops.length) return mapped;

    const missing = geocodedStops.filter((_, index) => !seen.has(index));
    return [...mapped, ...missing];
  }, [route, geocodedStops]);

  // True when A and B resolve to the exact same physical point (round trip).
  // We then render a single combined "A/B" marker instead of two stacked ones,
  // so the user immediately understands the day starts and ends at the same place.
  const sameStartEnd = useMemo(() => {
    if (!departurePoint || !arrivalPoint) return false;
    return (
      Math.abs(departurePoint.lat - arrivalPoint.lat) < 1e-6 &&
      Math.abs(departurePoint.lng - arrivalPoint.lng) < 1e-6
    );
  }, [departurePoint, arrivalPoint]);

  const renderedMarkers = useMemo<RenderMarkerItem[]>(() => {
    const baseItems: Omit<RenderMarkerItem, 'displayPosition'>[] = [];

    if (departurePoint) {
      baseItems.push({
        key: `departure-${departurePoint.type}`,
        kind: 'departure',
        position: { lat: departurePoint.lat, lng: departurePoint.lng },
        title: sameStartEnd
          ? `Départ et arrivée — ${departurePoint.label}`
          : `Départ — ${departurePoint.label}`,
        label: sameStartEnd ? 'A/B' : 'A',
        pointType: departurePoint.type,
        pointLabel: departurePoint.label,
      });
    }

    orderedStops.forEach((stop, index) => {
      baseItems.push({
        key: `stop-${stop.id}`,
        kind: 'stop',
        position: { lat: stop.latitude as number, lng: stop.longitude as number },
        title: `${index + 1}. ${stop.company_name}`,
        label: String(index + 1),
        stop,
        stopNumber: index + 1,
      });
    });

    // Skip the arrival marker when it's identical to departure — the combined
    // A/B departure marker already represents both concepts. Otherwise always
    // render B explicitly so the day's end point is never silently omitted.
    if (arrivalPoint && !sameStartEnd) {
      baseItems.push({
        key: `arrival-${arrivalPoint.type}`,
        kind: 'arrival',
        position: { lat: arrivalPoint.lat, lng: arrivalPoint.lng },
        title: `Arrivée — ${arrivalPoint.label}`,
        label: 'B',
        pointType: arrivalPoint.type,
        pointLabel: arrivalPoint.label,
      });
    }

    const grouped = new Map<string, Omit<RenderMarkerItem, 'displayPosition'>[]>();
    baseItems.forEach((item) => {
      const key = coordinateKey(item.position);
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });

    return baseItems.map((item) => {
      const duplicates = grouped.get(coordinateKey(item.position)) || [item];
      const duplicateIndex = duplicates.findIndex((duplicate) => duplicate.key === item.key);
      return {
        ...item,
        displayPosition: offsetDuplicatePosition(item.position, duplicateIndex, duplicates.length),
      };
    });
  }, [departurePoint, orderedStops, arrivalPoint, sameStartEnd]);

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

    // Build a reliable square SVG icon as a data URI. Using an inline SVG (vs
    // SymbolPath with a custom path) ensures the A/B markers render at a
    // predictable size, are anchored on their center, and are never clipped or
    // invisible due to a misconfigured custom path.
    const buildPinIcon = (color: string, label: string): google.maps.Icon => {
      const fontSize = label.length > 1 ? 12 : 16;
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
          <defs>
            <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity="0.35"/>
            </filter>
          </defs>
          <path d="M18 2 C9 2 2 9 2 18 c0 11 16 24 16 24 s16-13 16-24 C34 9 27 2 18 2 z"
                fill="${color}" stroke="#ffffff" stroke-width="2.5" filter="url(#s)"/>
          <text x="18" y="23" text-anchor="middle" font-family="Arial, sans-serif"
                font-size="${fontSize}" font-weight="800" fill="#ffffff">${label}</text>
        </svg>`.trim();
      return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new google.maps.Size(36, 44),
        anchor: new google.maps.Point(18, 42),
        labelOrigin: new google.maps.Point(18, 18),
      };
    };

    renderedMarkers.forEach((item) => {
      if (item.kind === 'departure') {
        const isCombined = item.label === 'A/B';
        const color = isCombined ? '#7c3aed' : '#16a34a';
        const marker = new google.maps.Marker({
          position: item.displayPosition,
          map,
          title: item.title,
          icon: buildPinIcon(color, item.label),
          zIndex: 2000,
          optimized: false,
        });
        const headerText = isCombined
          ? `Départ et arrivée — ${pointTypeLabel(item.pointType || prefs.departureType)}`
          : `Départ — ${pointTypeLabel(item.pointType || prefs.departureType)}`;
        const info = new google.maps.InfoWindow({
          content: `<div style="font-size:12px;font-weight:700">${headerText}</div><div style="font-size:11px;color:#666">${item.pointLabel || '—'}</div>`,
        });
        marker.addListener('click', () => info.open({ map, anchor: marker }));
        overlaysRef.current.push(marker);
        bounds.extend(item.displayPosition);
        hasContent = true;
        return;
      }

      if (item.kind === 'arrival') {
        const marker = new google.maps.Marker({
          position: item.displayPosition,
          map,
          title: item.title,
          icon: buildPinIcon('#dc2626', item.label),
          zIndex: 1990,
          optimized: false,
        });
        const info = new google.maps.InfoWindow({
          content: `<div style="font-size:12px;font-weight:700">Arrivée — ${pointTypeLabel(item.pointType || prefs.arrivalType)}</div><div style="font-size:11px;color:#666">${item.pointLabel || '—'}</div>`,
        });
        marker.addListener('click', () => info.open({ map, anchor: marker }));
        overlaysRef.current.push(marker);
        bounds.extend(item.displayPosition);
        hasContent = true;
        return;
      }

      if (!item.stop || item.stop.latitude == null || item.stop.longitude == null) return;

      const marker = new google.maps.Marker({
        position: item.displayPosition,
        map,
        title: item.title,
        label: { text: item.label, color: '#ffffff', fontWeight: '700', fontSize: '11px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: zoneColor || '#2563eb', fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 2, scale: 13,
        },
        zIndex: 800 + (item.stopNumber || 0),
      });
      const rt = relationshipBadge(item.stop.relationship_type);
      const ct = customerTypeBadge(item.stop.customer_type);
      const html = `
        <div style="font-size:12px;font-weight:700;margin-bottom:2px">${item.stopNumber}. ${item.stop.company_name}</div>
        ${item.stop.city ? `<div style="font-size:11px;color:#666">${item.stop.city}</div>` : ''}
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
          ${ct ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#f1f5f9;color:#334155">${ct}</span>` : ''}
          ${rt ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${rt.label === 'Magasin' ? '#dbeafe;color:#1d4ed8' : rt.label === 'Atelier' ? '#ffedd5;color:#c2410c' : '#ede9fe;color:#6d28d9'}">${rt.label}</span>` : ''}
        </div>`;
      const info = new google.maps.InfoWindow({ content: html });
      marker.addListener('click', () => info.open({ map, anchor: marker }));
      overlaysRef.current.push(marker);
      bounds.extend(item.displayPosition);
      hasContent = true;
    });

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
      route.path.forEach(point => bounds.extend(point));
      hasContent = true;
    }

    if (hasContent) map.fitBounds(bounds, 70);
  }, [open, ready, renderedMarkers, route, zoneColor, prefs.departureType, prefs.arrivalType]);

  const externalGmapsUrl = useMemo(() => {
    if (orderedStops.length === 0) return null;
    const fmt = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
    const start = departurePoint
      ? fmt({ lat: departurePoint.lat, lng: departurePoint.lng })
      : fmt({ lat: orderedStops[0].latitude as number, lng: orderedStops[0].longitude as number });
    const end = arrivalPoint
      ? fmt({ lat: arrivalPoint.lat, lng: arrivalPoint.lng })
      : fmt({ lat: orderedStops[orderedStops.length - 1].latitude as number, lng: orderedStops[orderedStops.length - 1].longitude as number });
    const wpStops = departurePoint ? orderedStops : orderedStops.slice(1);
    const finalWp = arrivalPoint ? wpStops : wpStops.slice(0, -1);
    const waypoints = finalWp
      .map(s => fmt({ lat: s.latitude as number, lng: s.longitude as number }))
      .join('|');
    const wp = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
    return `https://www.google.com/maps/dir/?api=1&origin=${start}&destination=${end}${wp}&travelmode=driving`;
  }, [orderedStops, departurePoint, arrivalPoint]);

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
              <Badge variant="outline" className="gap-1 text-warning border-warning/40">
                <AlertTriangle className="h-3 w-3" /> Approximation
              </Badge>
            )}
            {summary.missingGeo > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {summary.missingGeo} non géolocalisé{summary.missingGeo > 1 ? 's' : ''}
              </Badge>
            )}
          </DialogTitle>
          {/* Optimization context chips: keeps the user trustfully aware of which
              prefs (Départ / Arrivée / Ordre / Zone) drove this route. */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <Badge variant="outline" className="gap-1 text-[10px] font-medium">
              <CircleDot className="h-3 w-3" />
              Départ : {departurePoint ? pointTypeLabel(departurePoint.type) : pointTypeLabel(prefs.departureType)}
            </Badge>
            <Badge variant="outline" className="gap-1 text-[10px] font-medium">
              <Flag className="h-3 w-3" />
              Arrivée : {arrivalPoint ? pointTypeLabel(arrivalPoint.type) : pointTypeLabel(prefs.arrivalType)}
            </Badge>
            <Badge variant="outline" className="gap-1 text-[10px] font-medium">
              <Navigation className="h-3 w-3" />
              {strategyLabel(prefs.strategy)}
            </Badge>
            {zoneName && (
              <Badge variant="outline" className="gap-1 text-[10px] font-medium" style={zoneColor ? { borderColor: `${zoneColor}66`, color: zoneColor } : undefined}>
                <MapPin className="h-3 w-3" />
                {zoneName}
              </Badge>
            )}
            <Badge variant="outline" className="gap-1 text-[10px] font-medium">
              {relationshipLabel(prefs.relationshipFilter)}
            </Badge>
          </div>
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
          {/* Map legend so the user instantly maps colors/letters to A/B/stops. */}
          {ready && geocodedStops.length > 0 && (
            <div className="absolute top-2 left-2 z-10 bg-background/95 backdrop-blur border rounded-md shadow-sm px-2.5 py-1.5 flex items-center gap-3 text-[11px] font-medium pointer-events-none">
              {sameStartEnd ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-white text-[8px] font-bold shadow" style={{ background: '#7c3aed' }}>A/B</span>
                  Départ / Arrivée
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-white text-[10px] font-bold shadow" style={{ background: '#16a34a' }}>A</span>
                    Départ
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full text-white text-[10px] font-bold shadow" style={{ background: '#dc2626' }}>B</span>
                    Arrivée
                  </span>
                </>
              )}
              <span className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full text-white text-[10px] font-bold" style={{ background: zoneColor || '#2563eb' }}>1</span>
                Visites
              </span>
            </div>
          )}
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
