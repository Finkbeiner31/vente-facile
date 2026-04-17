/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, MapPin, Route as RouteIcon, Clock, Navigation, Store, Hammer, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

/**
 * GPS-style itinerary view of the day's tournée.
 * Renders an ordered route: A (départ) → 1, 2, 3 ... → B (arrivée),
 * with a connecting polyline and per-stop info windows.
 *
 * This is a *visualization* component, not a navigation app.
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

// Average urban driving speed (km/h) used for the rough ETA.
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
  if (rt === 'magasin') return { label: 'Magasin', icon: Store, cls: 'bg-blue-100 text-blue-700 border-blue-200' };
  if (rt === 'atelier') return { label: 'Atelier', icon: Hammer, cls: 'bg-orange-100 text-orange-700 border-orange-200' };
  if (rt === 'mixte') return { label: 'Mixte', icon: Layers, cls: 'bg-purple-100 text-purple-700 border-purple-200' };
  return null;
}

function customerTypeBadge(t?: string | null) {
  if (t === 'client_actif') return 'Client';
  if (t === 'prospect_qualifie') return 'Prospect qualifié';
  if (t === 'prospect') return 'Prospect';
  return null;
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
  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState<SavedPoint | null>(null);

  const lineColor = zoneColor || 'hsl(var(--primary))';

  // Wait for Google Maps SDK
  useEffect(() => {
    if (!open) return;
    const check = () => typeof google !== 'undefined' && !!google.maps;
    if (check()) { setReady(true); return; }
    const iv = setInterval(() => { if (check()) { setReady(true); clearInterval(iv); } }, 200);
    return () => clearInterval(iv);
  }, [open]);

  // Load the user's saved company/home/other point as the natural A & B.
  // We pick the first one configured (priority: entreprise → domicile → autre).
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

  // Build the ordered geometry: [origin?, ...stops, origin?]
  const path = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [];
    if (origin) pts.push({ lat: origin.lat, lng: origin.lng });
    geocodedStops.forEach(s => pts.push({ lat: s.latitude as number, lng: s.longitude as number }));
    if (origin) pts.push({ lat: origin.lat, lng: origin.lng });
    return pts;
  }, [origin, geocodedStops]);

  // Distance + driving-time approximation (no real routing)
  const summary = useMemo(() => {
    let km = 0;
    for (let i = 0; i < path.length - 1; i++) km += haversineKm(path[i], path[i + 1]);
    const driveMin = (km / AVG_SPEED_KMH) * 60;
    const visitMin = stops.reduce((sum, s) => sum + (s.visit_duration_minutes ?? DEFAULT_VISIT_MIN), 0);
    return {
      visits: stops.length,
      km,
      driveMin,
      visitMin,
      totalMin: driveMin + visitMin,
      missingGeo: stops.length - geocodedStops.length,
    };
  }, [path, stops, geocodedStops]);

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

    const bounds = new google.maps.LatLngBounds();
    let hasContent = false;

    // Origin (A) and arrival (B) — same point if a single departure is configured
    if (origin) {
      const aMarker = new google.maps.Marker({
        position: { lat: origin.lat, lng: origin.lng },
        map,
        title: `Départ — ${origin.label}`,
        label: { text: 'A', color: '#ffffff', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#0f172a',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 13,
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

    // Numbered stops
    geocodedStops.forEach((s, i) => {
      const pos = { lat: s.latitude as number, lng: s.longitude as number };
      const marker = new google.maps.Marker({
        position: pos,
        map,
        title: `${i + 1}. ${s.company_name}`,
        label: { text: String(i + 1), color: '#ffffff', fontWeight: '700', fontSize: '11px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: zoneColor || '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 12,
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

    // Arrival (B) — only show distinctly if we have stops AND an origin
    if (origin && geocodedStops.length > 0) {
      const bMarker = new google.maps.Marker({
        position: { lat: origin.lat, lng: origin.lng },
        map,
        title: `Arrivée — ${origin.label}`,
        label: { text: 'B', color: '#ffffff', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#475569',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 13,
        },
        zIndex: 1001,
      });
      overlaysRef.current.push(bMarker);
    }

    // Connecting polyline
    if (path.length >= 2) {
      const line = new google.maps.Polyline({
        path,
        strokeColor: zoneColor || '#2563eb',
        strokeOpacity: 0.9,
        strokeWeight: 3,
        geodesic: true,
        icons: [{
          icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5 },
          offset: '50%',
          repeat: '120px',
        }],
      });
      line.setMap(map);
      overlaysRef.current.push(line);
    }

    if (hasContent) map.fitBounds(bounds, 70);
  }, [open, ready, geocodedStops, origin, path, zoneColor]);

  const externalGmapsUrl = useMemo(() => {
    if (geocodedStops.length === 0) return null;
    const fmt = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
    const start = origin ? fmt(origin) : fmt({ lat: geocodedStops[0].latitude as number, lng: geocodedStops[0].longitude as number });
    const end = origin ? fmt(origin) : fmt({ lat: geocodedStops[geocodedStops.length - 1].latitude as number, lng: geocodedStops[geocodedStops.length - 1].longitude as number });
    const waypoints = (origin ? geocodedStops : geocodedStops.slice(1, -1))
      .map(s => fmt({ lat: s.latitude as number, lng: s.longitude as number }))
      .join('|');
    const wp = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
    return `https://www.google.com/maps/dir/?api=1&origin=${start}&destination=${end}${wp}&travelmode=driving`;
  }, [geocodedStops, origin]);

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
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
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

        {/* Footer actions — future-ready slot for GPS / recalc */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-background">
          <p className="text-[11px] text-muted-foreground">
            Estimations indicatives (vitesse moyenne {AVG_SPEED_KMH} km/h, sans trafic réel).
          </p>
          {externalGmapsUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              asChild
            >
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
