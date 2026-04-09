import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { X, Users, MapPin, Loader2, Pencil, Save, Ban, AlertTriangle } from 'lucide-react';
import { type CommercialZone, formatZoneName } from '@/hooks/useCommercialZones';
import { toast } from 'sonner';

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

interface Props {
  zones: CommercialZone[];
  profiles: Profile[];
}

/** Check if a point is inside a polygon using ray casting */
function pointInPolygon(lat: number, lng: number, coords: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i].lat, yi = coords[i].lng;
    const xj = coords[j].lat, yj = coords[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function clientsInPolygon(clients: ZoneClient[], coords: { lat: number; lng: number }[]): ZoneClient[] {
  if (!coords.length) return [];
  return clients.filter(c => c.latitude && c.longitude && pointInPolygon(c.latitude, c.longitude, coords));
}

export default function ZoneMapOverview({ zones, profiles }: Props) {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin' || role === 'manager';
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<Map<string, google.maps.Polygon>>(new Map());
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [showClients, setShowClients] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [filterCommercial, setFilterCommercial] = useState<string>('all');
  const [filterZone, setFilterZone] = useState<string>('all');
  const [selectedZoneInfo, setSelectedZoneInfo] = useState<CommercialZone | null>(null);

  // Edit mode state
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [impactPreview, setImpactPreview] = useState<{ added: ZoneClient[]; removed: ZoneClient[]; unchanged: ZoneClient[] } | null>(null);
  const [pendingSaveCoords, setPendingSaveCoords] = useState<{ lat: number; lng: number }[] | null>(null);
  const [saving, setSaving] = useState(false);

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
      const matched = clients.filter(c => {
        if (c.zone === z.system_name || c.zone === z.custom_label) return true;
        if (c.city && z.cities.some(zc => zc.toLowerCase() === c.city?.toLowerCase())) return true;
        if (z.polygon_coordinates && c.latitude && c.longitude) {
          const coords = (z.polygon_coordinates as any[]);
          return pointInPolygon(c.latitude, c.longitude, coords);
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
    polygonsRef.current.clear();

    if (!showZones) return;

    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;

    filteredZones.forEach(z => {
      if (!z.polygon_coordinates) return;
      const coords = (z.polygon_coordinates as any[]);
      if (!coords.length) return;

      const color = z.color || '#3b82f6';
      const path = coords.map((p: any) => ({ lat: p.lat, lng: p.lng }));
      const isEditing = editingZoneId === z.id;

      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: color,
        strokeWeight: isEditing ? 3 : 2.5,
        strokeOpacity: 0.9,
        fillColor: color,
        fillOpacity: isEditing ? 0.35 : 0.25,
        map,
        editable: isEditing,
        draggable: false,
        zIndex: isEditing ? 10 : 1,
      });

      if (isEditing) {
        // Listen for vertex changes
        const onPathChange = () => setEditDirty(true);
        google.maps.event.addListener(polygon.getPath(), 'set_at', onPathChange);
        google.maps.event.addListener(polygon.getPath(), 'insert_at', onPathChange);
        google.maps.event.addListener(polygon.getPath(), 'remove_at', onPathChange);
      }

      polygon.addListener('click', () => {
        if (!editingZoneId) setSelectedZoneInfo(z);
      });

      path.forEach((p: any) => { bounds.extend(p); hasBounds = true; });
      polygonsRef.current.set(z.id, polygon);
    });

    if (hasBounds && !editingZoneId) map.fitBounds(bounds, 60);
  }, [filteredZones, showZones, editingZoneId]);

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

    const visibleClients = filterZone === 'all' && filterCommercial === 'all'
      ? clients
      : clients.filter(c => {
          return filteredZones.some(z => {
            if (c.zone === z.system_name || c.zone === z.custom_label) return true;
            if (c.city && z.cities.some(zc => zc.toLowerCase() === c.city?.toLowerCase())) return true;
            if (z.polygon_coordinates && c.latitude && c.longitude) {
              return pointInPolygon(c.latitude, c.longitude, z.polygon_coordinates as any[]);
            }
            return false;
          });
        });

    visibleClients.forEach(c => {
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

  // --- Edit mode actions ---
  const startEditing = useCallback((zone: CommercialZone) => {
    setEditingZoneId(zone.id);
    setEditDirty(false);
    setSelectedZoneInfo(zone);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingZoneId(null);
    setEditDirty(false);
    setImpactPreview(null);
    setPendingSaveCoords(null);
  }, []);

  const getEditedCoords = useCallback((): { lat: number; lng: number }[] => {
    if (!editingZoneId) return [];
    const polygon = polygonsRef.current.get(editingZoneId);
    if (!polygon) return [];
    const path = polygon.getPath();
    const coords: { lat: number; lng: number }[] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i);
      coords.push({ lat: p.lat(), lng: p.lng() });
    }
    return coords;
  }, [editingZoneId]);

  const handleSaveClick = useCallback(() => {
    if (!editingZoneId) return;
    const zone = zones.find(z => z.id === editingZoneId);
    if (!zone) return;

    const newCoords = getEditedCoords();
    if (newCoords.length < 3) {
      toast.error('Le polygone doit avoir au moins 3 points');
      return;
    }

    // Calculate client impact
    const oldCoords = (zone.polygon_coordinates as any[] || []);
    const oldClients = clientsInPolygon(clients, oldCoords);
    const newClients = clientsInPolygon(clients, newCoords);

    const oldIds = new Set(oldClients.map(c => c.id));
    const newIds = new Set(newClients.map(c => c.id));

    const added = newClients.filter(c => !oldIds.has(c.id));
    const removed = oldClients.filter(c => !newIds.has(c.id));
    const unchanged = newClients.filter(c => oldIds.has(c.id));

    setPendingSaveCoords(newCoords);

    if (added.length > 0 || removed.length > 0) {
      setImpactPreview({ added, removed, unchanged });
      setShowConfirmDialog(true);
    } else {
      // No impact, save directly
      doSave(newCoords);
    }
  }, [editingZoneId, zones, clients, getEditedCoords]);

  const saveMutation = useMutation({
    mutationFn: async (coords: { lat: number; lng: number }[]) => {
      if (!editingZoneId) throw new Error('No zone');
      const { error } = await (supabase as any).from('commercial_zones')
        .update({ polygon_coordinates: coords })
        .eq('id', editingZoneId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial-zones'] });
      queryClient.invalidateQueries({ queryKey: ['zone-map-clients'] });
      toast.success('Zone mise à jour');
      setEditingZoneId(null);
      setEditDirty(false);
      setImpactPreview(null);
      setPendingSaveCoords(null);
      setShowConfirmDialog(false);
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  const doSave = useCallback((coords: { lat: number; lng: number }[]) => {
    setSaving(true);
    saveMutation.mutate(coords, { onSettled: () => setSaving(false) });
  }, [saveMutation]);

  const confirmSave = useCallback(() => {
    if (pendingSaveCoords) doSave(pendingSaveCoords);
  }, [pendingSaveCoords, doSave]);

  const zoneInfo = selectedZoneInfo;
  const zoneStats = zoneInfo ? clientsPerZone.get(zoneInfo.id) : null;
  const editingZone = editingZoneId ? zones.find(z => z.id === editingZoneId) : null;

  return (
    <div className="relative h-[500px] md:h-[600px] rounded-lg overflow-hidden border">
      {/* Edit mode toolbar */}
      {editingZone && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-primary text-primary-foreground px-4 py-2 flex items-center gap-3">
          <Pencil className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium flex-1">
            Édition : {formatZoneName(editingZone)}
          </span>
          <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" onClick={cancelEditing}>
            <Ban className="h-3 w-3" /> Annuler
          </Button>
          <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" onClick={handleSaveClick} disabled={!editDirty || saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Enregistrer
          </Button>
        </div>
      )}

      {/* Controls */}
      {!editingZoneId && (
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
      )}

      {/* Zone legend */}
      {!editingZoneId && (
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
      )}

      {/* Zone info panel */}
      {zoneInfo && !editingZoneId && (
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
          {/* Edit button for admins */}
          {isAdmin && zoneInfo.polygon_coordinates && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3 h-7 text-xs gap-1.5"
              onClick={() => startEditing(zoneInfo)}
            >
              <Pencil className="h-3 w-3" /> Modifier la zone
            </Button>
          )}
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="w-full h-full" />

      {/* Confirmation dialog for client impact */}
      <Dialog open={showConfirmDialog} onOpenChange={open => { if (!open) { setShowConfirmDialog(false); setImpactPreview(null); setPendingSaveCoords(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Modification de zone
            </DialogTitle>
            <DialogDescription>
              Cette modification affecte {(impactPreview?.added.length ?? 0) + (impactPreview?.removed.length ?? 0)} client(s).
              Voulez-vous mettre à jour la géométrie de la zone ?
            </DialogDescription>
          </DialogHeader>
          {impactPreview && (
            <div className="space-y-2 text-sm">
              {impactPreview.added.length > 0 && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                  <p className="font-medium text-emerald-800 text-xs mb-1">
                    +{impactPreview.added.length} client(s) ajouté(s) dans la zone
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {impactPreview.added.slice(0, 8).map(c => (
                      <Badge key={c.id} variant="outline" className="text-[10px] h-4 bg-emerald-100/50">{c.company_name}</Badge>
                    ))}
                    {impactPreview.added.length > 8 && (
                      <Badge variant="outline" className="text-[10px] h-4">+{impactPreview.added.length - 8}</Badge>
                    )}
                  </div>
                </div>
              )}
              {impactPreview.removed.length > 0 && (
                <div className="rounded border border-red-200 bg-red-50 p-2">
                  <p className="font-medium text-red-800 text-xs mb-1">
                    -{impactPreview.removed.length} client(s) retiré(s) de la zone
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {impactPreview.removed.slice(0, 8).map(c => (
                      <Badge key={c.id} variant="outline" className="text-[10px] h-4 bg-red-100/50">{c.company_name}</Badge>
                    ))}
                    {impactPreview.removed.length > 8 && (
                      <Badge variant="outline" className="text-[10px] h-4">+{impactPreview.removed.length - 8}</Badge>
                    )}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {impactPreview.unchanged.length} client(s) inchangé(s)
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setShowConfirmDialog(false); setImpactPreview(null); setPendingSaveCoords(null); }}>
              Annuler
            </Button>
            <Button size="sm" onClick={confirmSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
