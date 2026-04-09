import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, Users, MapPin, Loader2, Eye, EyeOff } from 'lucide-react';
import { type CommercialZone, formatZoneName } from '@/hooks/useCommercialZones';

interface Profile { id: string; full_name: string; email: string | null; }

interface ZoneClient {
  id: string;
  company_name: string;
  city: string | null;
  latitude: number;
  longitude: number;
  annual_revenue_potential: number | null;
  zone: string | null;
  customer_type: string;
}

const FRANCE_CENTER = { lat: 46.6, lng: 2.5 };

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Props {
  zones: CommercialZone[];
  profiles: Profile[];
}

export default function ZoneMapOverview({ zones, profiles }: Props) {
  const { user } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [showClients, setShowClients] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [filterCommercial, setFilterCommercial] = useState<string>('all');
  const [filterZone, setFilterZone] = useState<string>('all');
  const [selectedZoneInfo, setSelectedZoneInfo] = useState<CommercialZone | null>(null);

  // Fetch clients with coordinates
  const { data: clients = [] } = useQuery({
    queryKey: ['zone-map-clients', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, company_name, city, latitude, longitude, annual_revenue_potential, zone, customer_type')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (error) throw error;
      return (data || []) as ZoneClient[];
    },
    enabled: !!user,
  });

  const getProfileName = useCallback((userId: string | null) => {
    if (!userId) return 'Non assigné';
    return profiles.find(p => p.id === userId)?.full_name || 'Utilisateur';
  }, [profiles]);

  // Count clients per zone
  const clientsPerZone = useMemo(() => {
    const map = new Map<string, { count: number; totalPotential: number }>();
    zones.forEach(z => {
      // Match clients by zone name or by city/postal code
      const matched = clients.filter(c => {
        if (c.zone === z.system_name || c.zone === z.custom_label) return true;
        if (c.city && z.cities.some(zc => zc.toLowerCase() === c.city?.toLowerCase())) return true;
        // Check if client point is inside polygon
        if (z.polygon_coordinates && c.latitude && c.longitude && window.google?.maps?.geometry) {
          const coords = (z.polygon_coordinates as any[]).map((p: any) => new google.maps.LatLng(p.lat, p.lng));
          const poly = new google.maps.Polygon({ paths: coords });
          return google.maps.geometry.poly.containsLocation(new google.maps.LatLng(c.latitude, c.longitude), poly);
        }
        return false;
      });
      map.set(z.id, {
        count: matched.length,
        totalPotential: matched.reduce((s, c) => s + (c.annual_revenue_potential || 0), 0),
      });
    });
    return map;
  }, [zones, clients]);

  // Filtered zones
  const filteredZones = useMemo(() => {
    return zones.filter(z => {
      if (filterCommercial !== 'all' && z.user_id !== filterCommercial) return false;
      if (filterZone !== 'all' && z.id !== filterZone) return false;
      return true;
    });
  }, [zones, filterCommercial, filterZone]);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const init = () => {
      mapInstance.current = new google.maps.Map(mapRef.current!, {
        center: FRANCE_CENTER,
        zoom: 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      });
    };
    if (window.google?.maps) { init(); return; }
    const check = setInterval(() => {
      if (window.google?.maps && mapRef.current) { clearInterval(check); init(); }
    }, 200);
    return () => clearInterval(check);
  }, []);

  // Draw polygons
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear old
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];

    if (!showZones) return;

    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;

    filteredZones.forEach(z => {
      if (!z.polygon_coordinates) return;
      const coords = (z.polygon_coordinates as any[]);
      if (!coords.length) return;

      const color = z.color || '#3b82f6';
      const path = coords.map((p: any) => ({ lat: p.lat, lng: p.lng }));

      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: color,
        strokeWeight: 2.5,
        strokeOpacity: 0.9,
        fillColor: color,
        fillOpacity: 0.25,
        map,
        zIndex: 1,
      });

      polygon.addListener('click', () => setSelectedZoneInfo(z));

      path.forEach((p: any) => { bounds.extend(p); hasBounds = true; });
      polygonsRef.current.push(polygon);
    });

    if (hasBounds) map.fitBounds(bounds, 60);
  }, [filteredZones, showZones]);

  // Draw client markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (infoWindowRef.current) infoWindowRef.current.close();

    if (!showClients) return;

    const iw = new google.maps.InfoWindow();
    infoWindowRef.current = iw;

    // Only show clients matching filtered zones (or all if no zone filter)
    const visibleClients = filterZone === 'all' && filterCommercial === 'all'
      ? clients
      : clients.filter(c => {
          return filteredZones.some(z => {
            if (c.zone === z.system_name || c.zone === z.custom_label) return true;
            if (c.city && z.cities.some(zc => zc.toLowerCase() === c.city?.toLowerCase())) return true;
            if (z.polygon_coordinates && c.latitude && c.longitude && window.google?.maps?.geometry) {
              const coords = (z.polygon_coordinates as any[]).map((p: any) => new google.maps.LatLng(p.lat, p.lng));
              const poly = new google.maps.Polygon({ paths: coords });
              return google.maps.geometry.poly.containsLocation(new google.maps.LatLng(c.latitude, c.longitude), poly);
            }
            return false;
          });
        });

    visibleClients.forEach(c => {
      // Find zone color for this client
      let markerColor = '#6b7280';
      for (const z of filteredZones) {
        if (c.zone === z.system_name || c.zone === z.custom_label) { markerColor = z.color || '#3b82f6'; break; }
        if (c.city && z.cities.some(zc => zc.toLowerCase() === c.city?.toLowerCase())) { markerColor = z.color || '#3b82f6'; break; }
      }

      const marker = new google.maps.Marker({
        position: { lat: c.latitude, lng: c.longitude },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: markerColor,
          fillOpacity: 0.9,
          strokeColor: '#fff',
          strokeWeight: 1.5,
        },
        title: c.company_name,
        zIndex: 2,
      });

      marker.addListener('click', () => {
        iw.setContent(`
          <div style="font-family:sans-serif;padding:4px;min-width:140px">
            <strong style="font-size:13px">${c.company_name}</strong>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${c.city || ''}</div>
            ${c.annual_revenue_potential ? `<div style="font-size:11px;margin-top:2px">CA potentiel: ${Math.round(c.annual_revenue_potential).toLocaleString('fr-FR')} €/an</div>` : ''}
          </div>
        `);
        iw.open(map, marker);
      });

      markersRef.current.push(marker);
    });
  }, [clients, filteredZones, showClients, filterZone, filterCommercial]);

  // Unique commercials from zones
  const commercials = useMemo(() => {
    const ids = new Set(zones.map(z => z.user_id).filter(Boolean) as string[]);
    return profiles.filter(p => ids.has(p.id));
  }, [zones, profiles]);

  const zoneInfo = selectedZoneInfo;
  const zoneStats = zoneInfo ? clientsPerZone.get(zoneInfo.id) : null;

  return (
    <div className="relative h-[500px] md:h-[600px] rounded-lg overflow-hidden border">
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <div className="bg-background/95 backdrop-blur rounded-lg border p-2.5 shadow-sm space-y-2.5">
          <div className="flex items-center gap-2">
            <Switch id="show-zones" checked={showZones} onCheckedChange={setShowZones} />
            <Label htmlFor="show-zones" className="text-xs cursor-pointer">Zones</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="show-clients" checked={showClients} onCheckedChange={setShowClients} />
            <Label htmlFor="show-clients" className="text-xs cursor-pointer">Clients</Label>
          </div>
          <Select value={filterCommercial} onValueChange={setFilterCommercial}>
            <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="Commercial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les commerciaux</SelectItem>
              {commercials.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterZone} onValueChange={setFilterZone}>
            <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="Zone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les zones</SelectItem>
              {zones.map(z => (
                <SelectItem key={z.id} value={z.id}>{formatZoneName(z)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Zone legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-background/95 backdrop-blur rounded-lg border p-2.5 shadow-sm max-h-[180px] overflow-y-auto">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Légende</p>
        <div className="space-y-1">
          {filteredZones.map(z => (
            <button
              key={z.id}
              onClick={() => setSelectedZoneInfo(z)}
              className="flex items-center gap-1.5 text-xs hover:bg-accent/50 rounded px-1 py-0.5 w-full text-left"
            >
              <div className="h-3 w-3 rounded-sm shrink-0 border" style={{ backgroundColor: z.color || '#3b82f6', opacity: 0.7 }} />
              <span className="truncate">{formatZoneName(z)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Zone info panel */}
      {zoneInfo && (
        <div className="absolute top-3 right-3 z-10 bg-background/95 backdrop-blur rounded-lg border p-3 shadow-md w-64">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: zoneInfo.color || '#3b82f6' }} />
              <span className="text-sm font-semibold">{formatZoneName(zoneInfo)}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedZoneInfo(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              Commercial : <span className="text-foreground font-medium">{getProfileName(zoneInfo.user_id)}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              Clients : <span className="text-foreground font-medium">{zoneStats?.count ?? 0}</span>
            </p>
            <p>
              CA potentiel : <span className="text-foreground font-medium">{Math.round(zoneStats?.totalPotential ?? 0).toLocaleString('fr-FR')} €/an</span>
            </p>
            {zoneInfo.cities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {zoneInfo.cities.map(c => (
                  <Badge key={c} variant="outline" className="text-[9px] h-4">{c}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
