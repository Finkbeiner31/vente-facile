import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ExternalLink, MapPin, User, CheckCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterStatus: 'to_confirm' | 'outside';
}

export function AssignmentIssuesSheet({ open, onOpenChange, filterStatus }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedZones, setSelectedZones] = useState<Record<string, string>>({});
  const [selectedReps, setSelectedReps] = useState<Record<string, string>>({});

  const title = filterStatus === 'to_confirm' ? 'Clients à confirmer' : 'Clients hors zone';
  const description = filterStatus === 'to_confirm'
    ? 'Clients avec plusieurs zones possibles — choisissez la bonne affectation.'
    : 'Clients en dehors de toutes les zones définies.';

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
    queryKey: ['all-commercial-zones'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('commercial_zones')
        .select('id, system_name, custom_label, user_id, color')
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

  const assignZone = async (clientId: string) => {
    const zoneId = selectedZones[clientId];
    if (!zoneId) return;
    setSaving(clientId);
    try {
      const zone = allZones.find((z: any) => z.id === zoneId);
      const update: Record<string, any> = {
        zone: zone?.system_name || zone?.custom_label || zoneId,
        assignment_mode: 'manual',
        zone_status: 'assigned',
        assignment_source: 'admin_manual',
      };
      if (zone?.user_id) {
        update.assigned_rep_id = zone.user_id;
        update.rep_assignment_mode = 'automatic';
      }
      const { error } = await (supabase as any).from('customers').update(update).eq('id', clientId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['assignment-issues'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Zone assignée');
    } catch (e: any) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(null);
    }
  };

  const assignRep = async (clientId: string) => {
    const repId = selectedReps[clientId];
    if (!repId) return;
    setSaving(clientId);
    try {
      const { error } = await (supabase as any).from('customers').update({
        assigned_rep_id: repId,
        rep_assignment_mode: 'manual',
      }).eq('id', clientId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['assignment-issues'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Commercial assigné');
    } catch (e: any) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(null);
    }
  };

  const markOutside = async (clientId: string) => {
    setSaving(clientId);
    try {
      const { error } = await (supabase as any).from('customers').update({
        zone_status: 'outside',
        assignment_mode: 'manual',
      }).eq('id', clientId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['assignment-issues'] });
      toast.success('Client marqué hors zone');
    } catch (e: any) {
      toast.error(e.message || 'Erreur');
    } finally {
      setSaving(null);
    }
  };

  const getRepName = (repId: string | null) => {
    if (!repId) return null;
    const rep = allReps.find((r: any) => r.id === repId);
    return rep?.full_name || null;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
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

        <ScrollArea className="h-[calc(100vh-120px)] mt-4 pr-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <CheckCircle className="mx-auto h-8 w-8 text-primary/30 mb-2" />
              Aucun client dans cette catégorie
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map((c: any) => (
                <div key={c.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.company_name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{[c.address, c.postal_code, c.city].filter(Boolean).join(', ') || 'Adresse inconnue'}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7 text-xs"
                      onClick={() => { onOpenChange(false); navigate(`/customers/${c.id}`); }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Profil
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {c.zone && (
                      <Badge variant="outline" className="text-[10px]">
                        Zone: {c.zone}
                      </Badge>
                    )}
                    {getRepName(c.assigned_rep_id) && (
                      <Badge variant="outline" className="text-[10px]">
                        <User className="h-2.5 w-2.5 mr-0.5" />
                        {getRepName(c.assigned_rep_id)}
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${
                      c.zone_status === 'to_confirm' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-muted'
                    }`}>
                      {c.zone_status === 'to_confirm' ? 'À confirmer' : 'Hors zone'}
                    </Badge>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <div className="flex gap-1.5 flex-1 min-w-0">
                      <Select
                        value={selectedZones[c.id] || ''}
                        onValueChange={v => setSelectedZones(prev => ({ ...prev, [c.id]: v }))}
                      >
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
                      <Button
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        disabled={!selectedZones[c.id] || saving === c.id}
                        onClick={() => assignZone(c.id)}
                      >
                        {saving === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                      </Button>
                    </div>

                    <div className="flex gap-1.5 flex-1 min-w-0">
                      <Select
                        value={selectedReps[c.id] || ''}
                        onValueChange={v => setSelectedReps(prev => ({ ...prev, [c.id]: v }))}
                      >
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
                      <Button
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        disabled={!selectedReps[c.id] || saving === c.id}
                        onClick={() => assignRep(c.id)}
                      >
                        {saving === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <User className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  {filterStatus === 'to_confirm' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-muted-foreground w-full"
                      disabled={saving === c.id}
                      onClick={() => markOutside(c.id)}
                    >
                      Marquer hors zone
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
