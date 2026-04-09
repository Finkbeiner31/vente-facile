import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Plus, Pencil, Trash2, Save, X, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ZONE_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export function AdminZoneManager() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(ZONE_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ['commercial-zones'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('commercial_zones').select('*').order('name');
      if (error) throw error;
      return data as { id: string; name: string; color: string }[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error('Nom requis');
      const { error } = await (supabase as any).from('commercial_zones').insert({ name: newName.trim(), color: newColor });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial-zones'] });
      setNewName('');
      toast.success('Zone créée');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const { error } = await (supabase as any).from('commercial_zones').update({ name, color }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial-zones'] });
      setEditingId(null);
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-base flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Zones commerciales
        </CardTitle>
        <p className="text-xs text-muted-foreground">Créez et gérez les zones géographiques pour le planning des tournées.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create form */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Nom de la zone (ex: Toulouse Nord)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="h-9 flex-1"
            onKeyDown={e => e.key === 'Enter' && createMutation.mutate()}
          />
          <div className="flex gap-1">
            {ZONE_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-all ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !newName.trim()}>
            <Plus className="h-4 w-4 mr-1" />Ajouter
          </Button>
        </div>

        {/* Zone list */}
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : zones.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Aucune zone créée</p>
        ) : (
          <div className="space-y-2">
            {zones.map(z => (
              <div key={z.id} className="flex items-center gap-3 rounded-lg border p-3">
                {editingId === z.id ? (
                  <>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 flex-1 text-sm" />
                    <div className="flex gap-1">
                      {ZONE_COLORS.map(c => (
                        <button key={c} onClick={() => setEditColor(c)}
                          className={`h-5 w-5 rounded-full border-2 transition-all ${editColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateMutation.mutate({ id: z.id, name: editName, color: editColor })}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                    <span className="text-sm font-medium flex-1">{z.name}</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingId(z.id); setEditName(z.name); setEditColor(z.color); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(z.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
