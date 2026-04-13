import { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ExternalLink, MapPin, User, CheckCircle, Map, Save, AlertTriangle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterStatus: 'to_confirm' | 'outside';
  onSaved?: () => void;
}

interface PendingChange {
  zoneId?: string;
  zoneName?: string;
  repId?: string;
  markOutside?: boolean;
}

/* ── Map dialog ── */
function ClientMapDialog({ client, zones, open, onOpenChange }: {
  client: any;
  zones: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (!open || !mapRef.current || !client?.latitude || !client?.longitude) return;
    if (!window.google?.maps) return;

    // Small delay to ensure dialog DOM is fully rendered
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      const center = { lat: client.latitude, lng: client.longitude };
      const map = new google.maps.Map(mapRef.current, {
        center,
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapInstanceRef.current = map;

      new google.maps.Marker({
        position: center,
        map,
        title: client.company_name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      const zonesWithPolygons = zones.filter((z: any) => z.polygon_coordinates);
      for (const z of zonesWithPolygons) {
        try {
          const coords = typeof z.polygon_coordinates === 'string'
            ? JSON.parse(z.polygon_coordinates)
            : z.polygon_coordinates;
          if (!Array.isArray(coords) || coords.length < 3) continue;

          const paths = coords.map((c: any) => ({ lat: c.lat || c[0], lng: c.lng || c[1] }));
          const polygon = new google.maps.Polygon({
            paths,
            map,
            fillColor: z.color || '#3b82f6',
            fillOpacity: 0.2,
            strokeColor: z.color || '#3b82f6',
            strokeOpacity: 0.8,
            strokeWeight: 2,
          });

          const infoWindow = new google.maps.InfoWindow({
            content: `<div style="font-size:12px;font-weight:600">${z.custom_label || z.system_name}</div>`,
          });
          polygon.addListener('click', (e: any) => {
            infoWindow.setPosition(e.latLng);
            infoWindow.open(map);
          });
        } catch {}
      }

      // Trigger resize so tiles render properly
      google.maps.event.trigger(map, 'resize');
      map.setCenter(center);
    }, 150);

    return () => {
      clearTimeout(timer);
      mapInstanceRef.current = null;
    };
  }, [open, client, zones]);

  const hasCoords = client?.latitude && client?.longitude;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Map className="h-4 w-4 text-primary" />
            {client?.company_name}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {[client?.address, client?.postal_code, client?.city].filter(Boolean).join(', ') || 'Adresse inconnue'}
          </p>
        </DialogHeader>
        {hasCoords ? (
          <div ref={mapRef} className="w-full rounded-lg border" style={{ minHeight: 400, height: 400 }} />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground text-sm" style={{ minHeight: 300 }}>
            <MapPin className="h-8 w-8 mb-2 opacity-30" />
            Adresse non géolocalisée
          </div>
        )}
        {/* Zone legend */}
        <div className="flex flex-wrap gap-2 mt-1">
          <div className="flex items-center gap-1.5 text-xs">
            <div className="h-3 w-3 rounded-full bg-destructive border-2 border-background" />
            <span className="text-muted-foreground">{client?.company_name}</span>
          </div>
          {zones.filter((z: any) => z.polygon_coordinates).slice(0, 6).map((z: any) => (
            <div key={z.id} className="flex items-center gap-1.5 text-xs">
              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: z.color || '#3b82f6' }} />
              <span className="text-muted-foreground">{z.custom_label || z.system_name}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main sheet ── */
export function AssignmentIssuesSheet({ open, onOpenChange, filterStatus, onSaved }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingChanges, setPendingChanges] = useState<Record<string, PendingChange>>({});
  const [saving, setSaving] = useState(false);
  const [mapClient, setMapClient] = useState<any>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const title = filterStatus === 'to_confirm' ? 'Clients à confirmer' : 'Clients hors zone';
  const description = filterStatus === 'to_confirm'
    ? 'Clients avec plusieurs zones possibles — choisissez la bonne affectation.'
    : 'Clients en dehors de toutes les zones définies.';

  const hasUnsaved = Object.keys(pendingChanges).length > 0;

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['assignment-issues', filterStatus],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('customers')
        .select('id, company_name, city, address, postal_code, zone, zone_status, assignment_mode, assigned_rep_id, latitude, longitude')
        .eq('zone_status', filterStatus)
        .order('company_name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: allZones = [] } = useQuery({
    queryKey: ['all-commercial-zones-full'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('commercial_zones')
        .select('id, system_name, custom_label, user_id, color, polygon_coordinates')
        .order('system_name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: allReps = [] } = useQuery({
    queryKey: ['all-reps-for-assignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const setZoneForClient = (clientId: string, zoneId: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [clientId]: {
        ...prev[clientId],
        zoneId,
        zoneName: allZones.find((z: any) => z.id === zoneId)?.custom_label || allZones.find((z: any) => z.id === zoneId)?.system_name,
        markOutside: undefined,
      },
    }));
  };

  const setRepForClient = (clientId: string, repId: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [clientId]: { ...prev[clientId], repId },
    }));
  };

  const markOutside = (clientId: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [clientId]: { ...prev[clientId], markOutside: true, zoneId: undefined, zoneName: undefined },
    }));
  };

  const handleSaveAll = async () => {
    if (!hasUnsaved) return;
    setSaving(true);
    try {
      for (const [clientId, change] of Object.entries(pendingChanges)) {
        const update: Record<string, any> = {};

        if (change.markOutside) {
          update.zone_status = 'outside';
          update.assignment_mode = 'manual';
        } else if (change.zoneId) {
          const zone = allZones.find((z: any) => z.id === change.zoneId);
          update.zone = zone?.system_name || zone?.custom_label || change.zoneId;
          update.assignment_mode = 'manual';
          update.zone_status = 'assigned';
          update.assignment_source = 'admin_manual';
          if (zone?.user_id && !change.repId) {
            update.assigned_rep_id = zone.user_id;
            update.rep_assignment_mode = 'automatic';
          }
        }

        if (change.repId) {
          update.assigned_rep_id = change.repId;
          update.rep_assignment_mode = 'manual';
        }

        if (Object.keys(update).length > 0) {
          const { error } = await (supabase as any).from('customers').update(update).eq('id', clientId);
          if (error) throw error;
        }
      }

      setPendingChanges({});
      // Refresh the list and parent counters
      await queryClient.invalidateQueries({ queryKey: ['assignment-issues'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Modifications enregistrées');
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || "Impossible d'enregistrer les modifications");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (wantOpen: boolean) => {
    if (!wantOpen && hasUnsaved) {
      setConfirmClose(true);
      return;
    }
    if (!wantOpen) setPendingChanges({});
    onOpenChange(wantOpen);
  };

  const forceClose = () => {
    setConfirmClose(false);
    setPendingChanges({});
    onOpenChange(false);
  };

  const getRepName = (repId: string | null) => {
    if (!repId) return null;
    return allReps.find((r: any) => r.id === repId)?.full_name || null;
  };

  // After save, if list is now empty, auto-close
  const shouldAutoClose = !isLoading && clients.length === 0 && !hasUnsaved;

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {filterStatus === 'to_confirm' ? (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">{clients.length}</Badge>
              ) : (
                <Badge variant="secondary">{clients.length}</Badge>
              )}
              {title}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">{description}</p>
          </SheetHeader>

          <ScrollArea className="flex-1 mt-4 pr-2">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <CheckCircle className="mx-auto h-8 w-8 text-primary/30 mb-2" />
                Aucun client dans cette catégorie
                <p className="text-xs mt-1">Tous les problèmes ont été résolus.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clients.map((c: any) => {
                  const pending = pendingChanges[c.id];
                  const hasPending = !!pending;
                  return (
                    <div key={c.id} className={`rounded-lg border p-3 space-y-2 transition-colors ${hasPending ? 'border-primary/40 bg-primary/5' : ''}`}>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.company_name}</p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{[c.address, c.postal_code, c.city].filter(Boolean).join(', ') || 'Adresse inconnue'}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMapClient(c)}>
                            <Map className="h-3 w-3 mr-1" />
                            Carte
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { handleClose(false); navigate(`/customers/${c.id}`); }}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Current info + pending badge */}
                      <div className="flex flex-wrap gap-1.5">
                        {c.zone && <Badge variant="outline" className="text-[10px]">Zone: {c.zone}</Badge>}
                        {getRepName(c.assigned_rep_id) && (
                          <Badge variant="outline" className="text-[10px]">
                            <User className="h-2.5 w-2.5 mr-0.5" />
                            {getRepName(c.assigned_rep_id)}
                          </Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${c.zone_status === 'to_confirm' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-muted'}`}>
                          {c.zone_status === 'to_confirm' ? 'À confirmer' : 'Hors zone'}
                        </Badge>
                        {pending?.markOutside && <Badge className="text-[10px] bg-muted text-muted-foreground">→ Hors zone</Badge>}
                        {pending?.zoneName && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">→ {pending.zoneName}</Badge>}
                        {pending?.repId && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">→ {getRepName(pending.repId)}</Badge>}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <div className="flex gap-1.5 flex-1 min-w-0">
                          <Select value={pending?.zoneId || ''} onValueChange={v => setZoneForClient(c.id, v)}>
                            <SelectTrigger className="h-8 text-xs flex-1">
                              <SelectValue placeholder="Assigner zone..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allZones.map((z: any) => (
                                <SelectItem key={z.id} value={z.id} className="text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: z.color || '#3b82f6' }} />
                                    {z.custom_label || z.system_name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-1.5 flex-1 min-w-0">
                          <Select value={pending?.repId || ''} onValueChange={v => setRepForClient(c.id, v)}>
                            <SelectTrigger className="h-8 text-xs flex-1">
                              <SelectValue placeholder="Assigner commercial..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allReps.map((r: any) => (
                                <SelectItem key={r.id} value={r.id} className="text-xs">
                                  {r.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {filterStatus === 'to_confirm' && !pending?.markOutside && (
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground w-full" onClick={() => markOutside(c.id)}>
                          Marquer hors zone
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Sticky save footer */}
          {clients.length > 0 && (
            <div className="border-t pt-3 mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {hasUnsaved
                  ? `${Object.keys(pendingChanges).length} modification(s) en attente`
                  : 'Aucune modification'}
              </p>
              <Button onClick={handleSaveAll} disabled={!hasUnsaved || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Enregistrer les modifications
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Map preview dialog */}
      <ClientMapDialog
        client={mapClient}
        zones={allZones}
        open={mapClient !== null}
        onOpenChange={(o) => { if (!o) setMapClient(null); }}
      />

      {/* Confirm discard dialog */}
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Modifications non enregistrées
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Des modifications non enregistrées seront perdues. Voulez-vous continuer ?
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmClose(false)}>
              Annuler
            </Button>
            <Button variant="destructive" size="sm" onClick={forceClose}>
              Quitter sans enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
