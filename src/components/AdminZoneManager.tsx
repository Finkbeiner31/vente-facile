import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MapPin, Plus, Pencil, Trash2, Save, Loader2, Users, Building2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatZoneName, getNextSystemName, type CommercialZone } from '@/hooks/useCommercialZones';

const ZONE_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
}

const defaultForm = { customLabel: '', color: ZONE_COLORS[0], userId: '', cities: '', postalCodes: '' };

export function AdminZoneManager() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin' || role === 'manager';
  const [form, setForm] = useState(defaultForm);
  const [editingZone, setEditingZone] = useState<CommercialZone | null>(null);
  const [editForm, setEditForm] = useState(defaultForm);

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email').order('full_name');
      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: isAdmin,
  });

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ['commercial-zones'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('commercial_zones').select('*').order('system_name');
      if (error) throw error;
      return (data || []).map((z: any) => ({ ...z, cities: z.cities || [], postal_codes: z.postal_codes || [] })) as CommercialZone[];
    },
  });

  const parseArray = (s: string) => s.split(',').map(v => v.trim()).filter(Boolean);

  const createMutation = useMutation({
    mutationFn: async () => {
      const userId = isAdmin && form.userId ? form.userId : user?.id;
      if (!userId) throw new Error('Utilisateur requis');
      const systemName = getNextSystemName(zones);
      const { error } = await (supabase as any).from('commercial_zones').insert({
        system_name: systemName,
        custom_label: form.customLabel.trim() || null,
        color: form.color,
        user_id: userId,
        cities: parseArray(form.cities),
        postal_codes: parseArray(form.postalCodes),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial-zones'] });
      setForm(defaultForm);
      toast.success('Zone créée');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingZone) return;
      const { error } = await (supabase as any).from('commercial_zones').update({
        custom_label: editForm.customLabel.trim() || null,
        color: editForm.color,
        cities: parseArray(editForm.cities),
        postal_codes: parseArray(editForm.postalCodes),
      }).eq('id', editingZone.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial-zones'] });
      setEditingZone(null);
      toast.success('Zone modifiée');
    },
    onError: () => toast.error('Erreur'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('commercial_zones').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial-zones'] });
      toast.success('Zone supprimée');
    },
    onError: () => toast.error('Erreur'),
  });

  const getProfileName = (userId: string | null) => {
    if (!userId) return 'Non assigné';
    return profiles.find(p => p.id === userId)?.full_name || 'Utilisateur';
  };

  const openEdit = (z: CommercialZone) => {
    setEditingZone(z);
    setEditForm({
      customLabel: z.custom_label || '',
      color: z.color,
      userId: z.user_id || '',
      cities: z.cities.join(', '),
      postalCodes: z.postal_codes.join(', '),
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Zones commerciales
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Créez et configurez les zones géographiques. Le numéro (Zone 1, Zone 2…) est attribué automatiquement.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Create form */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input placeholder="Libellé de la zone (ex: Toulouse Sud)" value={form.customLabel} onChange={e => setForm(f => ({ ...f, customLabel: e.target.value }))} className="h-9 flex-1" />
              <div className="flex gap-1">
                {ZONE_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Villes (séparées par des virgules)" value={form.cities} onChange={e => setForm(f => ({ ...f, cities: e.target.value }))} className="h-9 text-xs" />
              <Input placeholder="Codes postaux (séparés par des virgules)" value={form.postalCodes} onChange={e => setForm(f => ({ ...f, postalCodes: e.target.value }))} className="h-9 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Select value={form.userId} onValueChange={v => setForm(f => ({ ...f, userId: v }))}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue placeholder="Assigner à un commercial..." />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" />Ajouter
              </Button>
            </div>
            {/* Preview next system name */}
            <p className="text-[10px] text-muted-foreground">
              Prochain numéro automatique : <span className="font-semibold">{getNextSystemName(zones)}</span>
            </p>
          </div>

          {/* Zone list */}
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : zones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucune zone créée</p>
          ) : (
            <div className="space-y-2">
              {zones.map(z => (
                <div key={z.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{formatZoneName(z)}</span>
                      {isAdmin && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Users className="h-2.5 w-2.5" />{getProfileName(z.user_id)}
                        </p>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(z)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(z.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {(z.cities.length > 0 || z.postal_codes.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 pl-7">
                      {z.cities.map(c => (
                        <Badge key={c} variant="outline" className="text-[9px] h-4 gap-1">
                          <Building2 className="h-2.5 w-2.5" />{c}
                        </Badge>
                      ))}
                      {z.postal_codes.map(pc => (
                        <Badge key={pc} variant="secondary" className="text-[9px] h-4">{pc}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit zone dialog */}
      <Dialog open={!!editingZone} onOpenChange={open => !open && setEditingZone(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier {editingZone?.system_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Libellé personnalisé</Label>
              <Input value={editForm.customLabel} onChange={e => setEditForm(f => ({ ...f, customLabel: e.target.value }))} placeholder="Ex: Toulouse Sud - Portet" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Couleur</Label>
              <div className="flex gap-1.5">
                {ZONE_COLORS.map(c => (
                  <button key={c} onClick={() => setEditForm(f => ({ ...f, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${editForm.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Villes (séparées par des virgules)</Label>
              <Input value={editForm.cities} onChange={e => setEditForm(f => ({ ...f, cities: e.target.value }))} placeholder="Toulouse, Muret, Colomiers" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Codes postaux (séparés par des virgules)</Label>
              <Input value={editForm.postalCodes} onChange={e => setEditForm(f => ({ ...f, postalCodes: e.target.value }))} placeholder="31100, 31600, 31770" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingZone(null)}>Annuler</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
