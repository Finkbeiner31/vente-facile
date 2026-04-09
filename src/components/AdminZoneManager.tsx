import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Plus, Pencil, Trash2, Save, X, Loader2, Users } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const ZONE_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
}

export function AdminZoneManager() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin' || role === 'manager';
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(ZONE_COLORS[0]);
  const [newUserId, setNewUserId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  // Load all profiles for admin to assign zones
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
      const { data, error } = await (supabase as any).from('commercial_zones').select('*').order('name');
      if (error) throw error;
      return data as { id: string; name: string; color: string; user_id: string | null }[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error('Nom requis');
      const userId = isAdmin && newUserId ? newUserId : user?.id;
      if (!userId) throw new Error('Utilisateur requis');
      const { error } = await (supabase as any).from('commercial_zones').insert({
        name: newName.trim(),
        color: newColor,
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial-zones'] });
      setNewName('');
      setNewUserId('');
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

  const getProfileName = (userId: string | null) => {
    if (!userId) return 'Non assigné';
    const p = profiles.find(p => p.id === userId);
    return p?.full_name || 'Utilisateur';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-base flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Zones commerciales
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {isAdmin ? 'Créez et assignez les zones géographiques aux commerciaux.' : 'Gérez vos zones géographiques.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create form */}
        <div className="space-y-2">
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
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={newUserId} onValueChange={setNewUserId}>
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
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !newName.trim()}>
              <Plus className="h-4 w-4 mr-1" />Ajouter
            </Button>
          </div>
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
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{z.name}</span>
                      {isAdmin && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Users className="h-2.5 w-2.5" />{getProfileName(z.user_id)}
                        </p>
                      )}
                    </div>
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
