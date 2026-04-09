import { useState, lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MapPin, Plus, Pencil, Trash2, Save, Loader2, Users, Building2, Palette, Map } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatZoneName, getNextSystemName, type CommercialZone } from '@/hooks/useCommercialZones';
import type { LatLng } from '@/components/MapZoneDrawer';

const MapZoneDrawer = lazy(() => import('@/components/MapZoneDrawer'));

// 30 visually distinct colors — good contrast on white & map backgrounds
const ZONE_PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777',
  '#0d9488', '#ea580c', '#4f46e5', '#059669', '#b91c1c', '#0284c7',
  '#9333ea', '#c026d3', '#65a30d', '#0891b2', '#e11d48', '#7e22ce',
  '#ca8a04', '#0e7490', '#be123c', '#15803d', '#6d28d9', '#c2410c',
  '#1d4ed8', '#9f1239', '#047857', '#a21caf', '#b45309', '#334155',
];

const FALLBACK_COLOR = '#64748b';

/** Pick the next color that isn't already used */
function pickAutoColor(usedColors: string[]): string {
  const usedSet = new Set(usedColors.map(c => c.toLowerCase()));
  const available = ZONE_PALETTE.find(c => !usedSet.has(c.toLowerCase()));
  if (available) return available;
  // All palette colors used — generate a deterministic one based on count
  const hue = (usedColors.length * 137) % 360; // golden-angle spread
  return `hsl(${hue}, 65%, 45%)`;
}

function hslToHex(hslStr: string): string {
  const m = hslStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!m) return FALLBACK_COLOR;
  const [, h, s, l] = m.map(Number);
  const a2 = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a2 * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function normalizeColor(c: string): string {
  if (c.startsWith('hsl')) return hslToHex(c);
  return c;
}

interface Profile { id: string; full_name: string; email: string | null; }

function ColorPicker({ value, onChange, usedColors }: { value: string; onChange: (c: string) => void; usedColors: string[] }) {
  const [customOpen, setCustomOpen] = useState(false);
  const usedSet = new Set(usedColors.map(c => c.toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ZONE_PALETTE.map(c => {
          const isUsed = usedSet.has(c.toLowerCase());
          const isSelected = value.toLowerCase() === c.toLowerCase();
          return (
            <button key={c} onClick={() => onChange(c)}
              className={`h-6 w-6 rounded-full border-2 transition-all relative ${
                isSelected ? 'border-foreground scale-110 ring-1 ring-foreground/20' : 'border-transparent hover:scale-105'
              } ${isUsed && !isSelected ? 'opacity-40' : ''}`}
              style={{ backgroundColor: c }}
              title={isUsed ? 'Déjà utilisée' : c}
            />
          );
        })}
      </div>
      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <Palette className="h-3 w-3" />
            Couleur personnalisée
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <input type="color" value={normalizeColor(value)} onChange={e => { onChange(e.target.value); setCustomOpen(false); }}
            className="h-10 w-20 cursor-pointer border-0 p-0 bg-transparent" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

const defaultForm = { customLabel: '', color: '', userId: '', cities: '', postalCodes: '', polygonCoordinates: null as LatLng[] | null };

export function AdminZoneManager() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin' || role === 'manager';
  const [form, setForm] = useState(defaultForm);
  const [editingZone, setEditingZone] = useState<CommercialZone | null>(null);
  const [editForm, setEditForm] = useState(defaultForm);
  const [mapMode, setMapMode] = useState<'create' | 'edit' | null>(null);

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

  const usedColors = zones.map(z => z.color).filter(Boolean);
  const parseArray = (s: string) => s.split(',').map(v => v.trim()).filter(Boolean);

  const createMutation = useMutation({
   mutationFn: async () => {
      const userId = isAdmin && form.userId ? form.userId : user?.id;
      if (!userId) throw new Error('Utilisateur requis');
      const systemName = getNextSystemName(zones);
      const color = form.color || pickAutoColor(usedColors);
      const { error } = await (supabase as any).from('commercial_zones').insert({
        system_name: systemName,
        custom_label: form.customLabel.trim() || null,
        color: normalizeColor(color),
        user_id: userId,
        cities: parseArray(form.cities),
        postal_codes: parseArray(form.postalCodes),
        polygon_coordinates: form.polygonCoordinates,
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
        color: normalizeColor(editForm.color || FALLBACK_COLOR),
        cities: parseArray(editForm.cities),
        postal_codes: parseArray(editForm.postalCodes),
        polygon_coordinates: editForm.polygonCoordinates,
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
      color: z.color || FALLBACK_COLOR,
      userId: z.user_id || '',
      cities: z.cities.join(', '),
      postalCodes: z.postal_codes.join(', '),
      polygonCoordinates: z.polygon_coordinates || null,
    });
  };

  const handleMapConfirm = (polygon: LatLng[], suggestedPostalCodes: string[], suggestedCities: string[]) => {
    if (mapMode === 'create') {
      setForm(f => {
        const existingCities = parseArray(f.cities);
        const existingPc = parseArray(f.postalCodes);
        const mergedCities = Array.from(new Set([...existingCities, ...suggestedCities]));
        const mergedPc = Array.from(new Set([...existingPc, ...suggestedPostalCodes]));
        return { ...f, cities: mergedCities.join(', '), postalCodes: mergedPc.join(', '), polygonCoordinates: polygon };
      });
      toast.success(`${suggestedPostalCodes.length} codes postaux et ${suggestedCities.length} villes suggérés`);
    } else if (mapMode === 'edit') {
      setEditForm(f => {
        const existingCities = parseArray(f.cities);
        const existingPc = parseArray(f.postalCodes);
        const mergedCities = Array.from(new Set([...existingCities, ...suggestedCities]));
        const mergedPc = Array.from(new Set([...existingPc, ...suggestedPostalCodes]));
        return { ...f, cities: mergedCities.join(', '), postalCodes: mergedPc.join(', '), polygonCoordinates: polygon };
      });
      toast.success(`${suggestedPostalCodes.length} codes postaux et ${suggestedCities.length} villes suggérés`);
    }
    setMapMode(null);
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
            Le numéro est attribué automatiquement. La couleur est auto-assignée si vous n'en choisissez pas.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Create form */}
          <div className="space-y-2">
            <Input placeholder="Libellé de la zone (ex: Toulouse Sud)" value={form.customLabel} onChange={e => setForm(f => ({ ...f, customLabel: e.target.value }))} className="h-9" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Villes (séparées par des virgules)" value={form.cities} onChange={e => setForm(f => ({ ...f, cities: e.target.value }))} className="h-9 text-xs" />
              <Input placeholder="Codes postaux (séparés par des virgules)" value={form.postalCodes} onChange={e => setForm(f => ({ ...f, postalCodes: e.target.value }))} className="h-9 text-xs" />
            </div>
            {/* Color selection */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Couleur</Label>
                {form.color ? (
                  <div className="flex items-center gap-1.5">
                    <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: form.color }} />
                    <button className="text-[10px] text-muted-foreground underline" onClick={() => setForm(f => ({ ...f, color: '' }))}>auto</button>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-[10px] h-4">
                    Auto : {pickAutoColor(usedColors)}
                    <div className="h-2.5 w-2.5 rounded-full ml-1" style={{ backgroundColor: pickAutoColor(usedColors) }} />
                  </Badge>
                )}
              </div>
              <ColorPicker value={form.color || pickAutoColor(usedColors)} onChange={c => setForm(f => ({ ...f, color: c }))} usedColors={usedColors} />
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
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setMapMode('create')} className="gap-1">
                  <Map className="h-4 w-4" />Définir sur la carte
                </Button>
              )}
              <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" />Ajouter
              </Button>
            </div>
            {form.polygonCoordinates && (
              <Badge variant="outline" className="text-[10px] h-4 gap-1">
                <Map className="h-2.5 w-2.5" />Polygone défini ({form.polygonCoordinates.length} points)
                <button className="ml-1 underline" onClick={() => setForm(f => ({ ...f, polygonCoordinates: null }))}>×</button>
              </Badge>
            )}
            <p className="text-[10px] text-muted-foreground">
              Prochain numéro : <span className="font-semibold">{getNextSystemName(zones)}</span>
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
                    <div className="h-4 w-4 rounded-full shrink-0 border" style={{ backgroundColor: z.color || FALLBACK_COLOR }} />
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
              <ColorPicker
                value={editForm.color}
                onChange={c => setEditForm(f => ({ ...f, color: c }))}
                usedColors={usedColors.filter(uc => uc.toLowerCase() !== (editingZone?.color || '').toLowerCase())}
              />
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
