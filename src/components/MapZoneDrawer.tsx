/// <reference types="google.maps" />
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Check } from 'lucide-react';

export interface LatLng { lat: number; lng: number; }

interface MapZoneDrawerProps {
  /** Existing polygon to display for editing */
  initialPolygon?: LatLng[] | null;
  /** Zone color for polygon fill */
  zoneColor?: string;
  /** Called when the user confirms the polygon */
  onConfirm: (polygon: LatLng[], suggestedPostalCodes: string[], suggestedCities: string[]) => void;
  onCancel: () => void;
}

const FRANCE_CENTER = { lat: 43.6, lng: 1.44 }; // Toulouse area default

/**
 * Full-screen-ish map that lets the admin draw ONE polygon,
 * then reverse-geocodes sample points to suggest postal codes & cities.
 */
export default function MapZoneDrawer({ initialPolygon, zoneColor = '#3b82f6', onConfirm, onCancel }: MapZoneDrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);

  const [ready, setReady] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [loading, setLoading] = useState(false);

  // Wait for google maps
  useEffect(() => {
    const check = () => typeof google !== 'undefined' && !!google.maps?.drawing;
    if (check()) { setReady(true); return; }
    const iv = setInterval(() => { if (check()) { setReady(true); clearInterval(iv); } }, 200);
    return () => clearInterval(iv);
  }, []);

  // Init map
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;

    const center = initialPolygon && initialPolygon.length > 0
      ? { lat: initialPolygon.reduce((s, p) => s + p.lat, 0) / initialPolygon.length, lng: initialPolygon.reduce((s, p) => s + p.lng, 0) / initialPolygon.length }
      : FRANCE_CENTER;

    const map = new google.maps.Map(containerRef.current, {
      center,
      zoom: initialPolygon ? 11 : 9,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    // If editing existing polygon
    if (initialPolygon && initialPolygon.length > 0) {
      const poly = new google.maps.Polygon({
        paths: initialPolygon,
        editable: true,
        draggable: true,
        fillColor: zoneColor,
        fillOpacity: 0.25,
        strokeColor: zoneColor,
        strokeWeight: 2,
      });
      poly.setMap(map);
      polygonRef.current = poly;
      setHasPolygon(true);

      const bounds = new google.maps.LatLngBounds();
      initialPolygon.forEach(p => bounds.extend(p));
      map.fitBounds(bounds, 60);
    } else {
      // Drawing manager
      const dm = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        polygonOptions: {
          editable: true,
          draggable: true,
          fillColor: zoneColor,
          fillOpacity: 0.25,
          strokeColor: zoneColor,
          strokeWeight: 2,
        },
      });
      dm.setMap(map);
      drawingManagerRef.current = dm;

      google.maps.event.addListener(dm, 'polygoncomplete', (poly: google.maps.Polygon) => {
        polygonRef.current = poly;
        setHasPolygon(true);
        dm.setDrawingMode(null);
      });
    }
  }, [ready, initialPolygon, zoneColor]);

  const clearPolygon = useCallback(() => {
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    setHasPolygon(false);
    drawingManagerRef.current?.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
  }, []);

  const getPolygonPath = (): LatLng[] => {
    if (!polygonRef.current) return [];
    const path = polygonRef.current.getPath();
    const coords: LatLng[] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i);
      coords.push({ lat: p.lat(), lng: p.lng() });
    }
    return coords;
  };

  /** Sample points inside polygon bounding box, reverse-geocode to find postal codes & cities */
  const handleConfirm = useCallback(async () => {
    const coords = getPolygonPath();
    if (coords.length < 3) return;

    setLoading(true);
    const postalCodes = new Set<string>();
    const cities = new Set<string>();

    try {
      const geocoder = new google.maps.Geocoder();
      const polygon = polygonRef.current!;

      // Get bounding box
      const lats = coords.map(c => c.lat);
      const lngs = coords.map(c => c.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

      // Sample grid points inside polygon
      const GRID = 5;
      const samplePoints: google.maps.LatLng[] = [];
      for (let i = 0; i <= GRID; i++) {
        for (let j = 0; j <= GRID; j++) {
          const lat = minLat + (maxLat - minLat) * (i / GRID);
          const lng = minLng + (maxLng - minLng) * (j / GRID);
          const pt = new google.maps.LatLng(lat, lng);
          if (google.maps.geometry?.poly?.containsLocation(pt, polygon) ||
              isPointInPolygon(pt, coords)) {
            samplePoints.push(pt);
          }
        }
      }

      // Also add vertices and centroid
      const centroid = new google.maps.LatLng(
        (minLat + maxLat) / 2,
        (minLng + maxLng) / 2
      );
      samplePoints.push(centroid);

      // Reverse-geocode up to 10 sample points (API rate limit)
      const toGeocode = samplePoints.slice(0, 10);

      const results = await Promise.allSettled(
        toGeocode.map(pt =>
          new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
            geocoder.geocode({ location: pt }, (res, status) => {
              if (status === 'OK' && res) resolve(res);
              else reject(status);
            });
          })
        )
      );

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const result of r.value) {
          for (const comp of result.address_components) {
            if (comp.types.includes('postal_code')) {
              postalCodes.add(comp.long_name);
            }
            if (comp.types.includes('locality')) {
              cities.add(comp.long_name);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Geocoding partial failure', e);
    }

    setLoading(false);
    onConfirm(coords, Array.from(postalCodes).sort(), Array.from(cities).sort());
  }, [onConfirm]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-background">
        <p className="text-xs text-muted-foreground flex-1">
          {hasPolygon
            ? 'Modifiez le polygone ou confirmez la zone.'
            : 'Dessinez un polygone sur la carte pour définir la zone.'}
        </p>
        {hasPolygon && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={clearPolygon}>
            <Trash2 className="h-3 w-3" />Effacer
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Annuler
        </Button>
        <Button size="sm" className="h-7 text-xs gap-1" disabled={!hasPolygon || loading} onClick={handleConfirm}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Valider
        </Button>
      </div>

      {/* Map */}
      <div ref={containerRef} className="flex-1 min-h-[350px]" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

/** Simple ray-casting point-in-polygon fallback (if geometry library not loaded) */
function isPointInPolygon(point: google.maps.LatLng, polygon: LatLng[]): boolean {
  const x = point.lat(), y = point.lng();
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
