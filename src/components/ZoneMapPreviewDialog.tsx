/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CommercialZone } from '@/hooks/useCommercialZones';
import { formatZoneName } from '@/hooks/useCommercialZones';

interface CustomerLite {
  id: string;
  company_name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  customer_type?: string | null;
  annual_revenue_potential?: number | null;
}

interface ZoneMapPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone: CommercialZone | null;
  customers: CustomerLite[];
  /** Optional starting point (commercial's departure) */
  origin?: { lat: number; lng: number; label?: string } | null;
}

const FRANCE_CENTER = { lat: 46.6, lng: 2.5 };

/**
 * Read-only map dialog showing a single zone polygon and its customers.
 * Used from the tournée page so commercials can quickly visualize the day's territory.
 */
export default function ZoneMapPreviewDialog({
  open,
  onOpenChange,
  zone,
  customers,
  origin = null,
}: ZoneMapPreviewDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<google.maps.Polygon | google.maps.Marker>>([]);
  const [ready, setReady] = useState(false);

  // Wait for Google Maps SDK
  useEffect(() => {
    if (!open) return;
    const check = () => typeof google !== 'undefined' && !!google.maps;
    if (check()) { setReady(true); return; }
    const iv = setInterval(() => { if (check()) { setReady(true); clearInterval(iv); } }, 200);
    return () => clearInterval(iv);
  }, [open]);

  // Render map + overlays each time the dialog opens
  useEffect(() => {
    if (!open || !ready || !containerRef.current || !zone) return;

    // Reset
    overlaysRef.current.forEach(o => (o as any).setMap?.(null));
    overlaysRef.current = [];

    const map = new google.maps.Map(containerRef.current, {
      center: FRANCE_CENTER,
      zoom: 6,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
    });
    mapRef.current = map;

    const bounds = new google.maps.LatLngBounds();
    let hasBoundsContent = false;

    // Polygon
    if (zone.polygon_coordinates && zone.polygon_coordinates.length >= 3) {
      const poly = new google.maps.Polygon({
        paths: zone.polygon_coordinates,
        fillColor: zone.color,
        fillOpacity: 0.2,
        strokeColor: zone.color,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        clickable: false,
      });
      poly.setMap(map);
      overlaysRef.current.push(poly);
      zone.polygon_coordinates.forEach(p => { bounds.extend(p); hasBoundsContent = true; });
    }

    // Customer markers (only those geocoded)
    customers.forEach(c => {
      if (typeof c.latitude !== 'number' || typeof c.longitude !== 'number') return;
      const marker = new google.maps.Marker({
        position: { lat: c.latitude, lng: c.longitude },
        map,
        title: c.company_name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: zone.color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 7,
        },
      });
      const info = new google.maps.InfoWindow({
        content: `<div style="font-size:12px;font-weight:600">${c.company_name}</div>${
          c.city ? `<div style="font-size:11px;color:#666">${c.city}</div>` : ''
        }`,
      });
      marker.addListener('click', () => info.open({ map, anchor: marker }));
      overlaysRef.current.push(marker);
      bounds.extend({ lat: c.latitude, lng: c.longitude });
      hasBoundsContent = true;
    });

    // Origin (departure point)
    if (origin && typeof origin.lat === 'number' && typeof origin.lng === 'number') {
      const m = new google.maps.Marker({
        position: { lat: origin.lat, lng: origin.lng },
        map,
        title: origin.label || 'Point de départ',
        label: { text: 'D', color: '#ffffff', fontWeight: '700', fontSize: '11px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#0f172a',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 11,
        },
      });
      overlaysRef.current.push(m);
      bounds.extend({ lat: origin.lat, lng: origin.lng });
      hasBoundsContent = true;
    }

    if (hasBoundsContent) {
      map.fitBounds(bounds, 60);
    }
  }, [open, ready, zone, customers, origin]);

  const geocodedCount = customers.filter(c => typeof c.latitude === 'number' && typeof c.longitude === 'number').length;
  const hasPolygon = !!(zone?.polygon_coordinates && zone.polygon_coordinates.length >= 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span
              className="h-3.5 w-3.5 rounded-full shrink-0"
              style={{ backgroundColor: zone?.color || '#3b82f6' }}
            />
            <span className="truncate">{zone ? formatZoneName(zone) : 'Zone'}</span>
            <Badge variant="secondary" className="ml-2 gap-1 font-medium">
              <Users className="h-3 w-3" />
              {customers.length} client{customers.length > 1 ? 's' : ''}
            </Badge>
            {geocodedCount < customers.length && (
              <Badge variant="outline" className="text-[10px]">
                {customers.length - geocodedCount} non géolocalisé{customers.length - geocodedCount > 1 ? 's' : ''}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative h-[60vh] min-h-[400px] bg-muted">
          <div ref={containerRef} className="absolute inset-0" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {ready && geocodedCount === 0 && !hasPolygon && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 text-center px-6">
              <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Aucun client géolocalisé dans cette zone</p>
              <p className="text-xs text-muted-foreground mt-1">
                Renseignez les adresses des clients pour les afficher sur la carte.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
