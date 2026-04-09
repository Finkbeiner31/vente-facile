import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Users, Shield, Settings as SettingsIcon, Truck, Plus, Edit, Trash2, Save,
  Loader2, ArrowRightCircle, MapPin, Building2, Calendar, UserPlus, Power,
} from 'lucide-react';
import { AdminZoneManager } from '@/components/AdminZoneManager';
import { AdminConversionRequests } from '@/components/AdminConversionRequests';
import { useVehiclePotentials } from '@/hooks/useVehiclePotentials';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Responsable',
  sales_rep: 'Commercial',
  executive: 'Observateur',
};

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-destructive/10 text-destructive border-destructive/20',
  manager: 'bg-blue-500/10 text-blue-700 border-blue-200',
  sales_rep: 'bg-primary/10 text-primary border-primary/20',
  executive: 'bg-muted text-muted-foreground border-border',
};

interface UserWithRole {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
}

export default function AdminPage() {
  const { user: currentUser, role: currentRole, loading: authLoading } = useAuth();
  const { data: potentials = [], isLoading: potentialsLoading } = useVehiclePotentials();
  const [editingPotentials, setEditingPotentials] = useState(false);
  const [potentialForm, setPotentialForm] = useState<Record<string, number>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [createForm, setCreateForm] = useState({ firstName: '', lastName: '', email: '', phone: '', role: 'sales_rep', password: '' });
  const queryClient = useQueryClient();

  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, is_active')
        .order('full_name');
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await (supabase as any)
        .from('user_roles')
        .select('user_id, role');
      if (rErr) throw rErr;

      const roleMap: Record<string, string> = {};
      (roles || []).forEach((r: any) => { roleMap[r.user_id] = r.role; });

      return (profiles || []).map((p): UserWithRole => ({
        id: p.id,
        full_name: p.full_name || 'Sans nom',
        email: p.email,
        phone: p.phone,
        role: roleMap[p.id] || 'sales_rep',
        is_active: (p as any).is_active !== false,
      }));
    },
    enabled: !!currentUser,
  });

  const isAdmin = currentRole === 'admin';

  // Manage user (delete/deactivate/reactivate)
  const manageUserMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: 'delete' | 'deactivate' | 'reactivate' }) => {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { user_id: userId, action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowDeleteModal(null);
      if (data.result === 'deleted') {
        setSelectedUserId(null);
        toast.success('Profil supprimé');
      } else if (data.result === 'deactivated') {
        toast.success(data.reason || 'Profil désactivé');
      } else if (data.result === 'reactivated') {
        toast.success('Profil réactivé');
      }
    },
    onError: (e: any) => toast.error(e.message || 'Erreur'),
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async () => {
      const fullName = `${createForm.firstName} ${createForm.lastName}`.trim();
      if (!fullName || !createForm.email || !createForm.role) {
        throw new Error('Champs requis manquants');
      }
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: createForm.email,
          password: createForm.password || undefined,
          full_name: fullName,
          phone: createForm.phone || undefined,
          role: createForm.role,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowCreateModal(false);
      setCreateForm({ firstName: '', lastName: '', email: '', phone: '', role: 'sales_rep', password: '' });
      toast.success('Profil créé avec succès');
    },
    onError: (e: any) => toast.error(e.message || 'Erreur lors de la création'),
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const { error } = await (supabase as any)
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Rôle modifié');
    },
    onError: () => toast.error('Erreur lors du changement de rôle'),
  });

  const reassignClientMutation = useMutation({
    mutationFn: async ({ clientId, newRepId }: { clientId: string; newRepId: string }) => {
      const { error } = await supabase
        .from('customers')
        .update({ assigned_rep_id: newRepId } as any)
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-clients'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Client réassigné');
    },
    onError: () => toast.error('Erreur de réassignation'),
  });

  const selectedUser = allUsers.find(u => u.id === selectedUserId);

  const { data: selectedUserZones = [] } = useQuery({
    queryKey: ['admin-user-zones', selectedUserId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('commercial_zones')
        .select('*')
        .eq('user_id', selectedUserId)
        .order('name');
      if (error) throw error;
      return data as { id: string; name: string; color: string }[];
    },
    enabled: !!selectedUserId,
  });

  const { data: selectedUserClients = [] } = useQuery({
    queryKey: ['admin-user-clients', selectedUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, company_name, city, customer_type, annual_revenue_potential, zone')
        .eq('assigned_rep_id', selectedUserId!)
        .order('company_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUserId,
  });

  const { data: selectedUserPlanning = [] } = useQuery({
    queryKey: ['admin-user-planning', selectedUserId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('weekly_zone_planning')
        .select('*, commercial_zones(system_name, custom_label, color)')
        .eq('user_id', selectedUserId)
        .order('day_of_week');
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUserId,
  });

  // Potentials logic
  const updatePotentialMutation = useMutation({
    mutationFn: async (updates: { vehicle_type: string; annual_potential: number }[]) => {
      for (const u of updates) {
        const { error } = await (supabase as any)
          .from('vehicle_type_potentials')
          .update({ annual_potential: u.annual_potential })
          .eq('vehicle_type', u.vehicle_type);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-type-potentials'] });
      setEditingPotentials(false);
      toast.success('Potentiels véhicules mis à jour');
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const startEditPotentials = () => {
    const form: Record<string, number> = {};
    potentials.forEach(p => { form[p.vehicle_type] = Number(p.annual_potential); });
    setPotentialForm(form);
    setEditingPotentials(true);
  };

  const savePotentials = () => {
    const updates = Object.entries(potentialForm).map(([vehicle_type, annual_potential]) => ({
      vehicle_type,
      annual_potential,
    }));
    updatePotentialMutation.mutate(updates);
  };

  const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const isCommercialRole = (role: string) => role === 'sales_rep';
  const filteredUsers = allUsers.filter(u => {
    if (statusFilter === 'active') return u.is_active;
    if (statusFilter === 'inactive') return !u.is_active;
    return true;
  });
  const deleteTargetUser = allUsers.find(u => u.id === showDeleteModal);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-2xl font-bold">Administration</h1>
        <p className="text-sm text-muted-foreground">Gérez les profils, zones et paramètres</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />Profils</TabsTrigger>
          <TabsTrigger value="conversions"><ArrowRightCircle className="mr-1 h-4 w-4" />Conversions</TabsTrigger>
          <TabsTrigger value="zones"><MapPin className="mr-1 h-4 w-4" />Zones</TabsTrigger>
          <TabsTrigger value="roles"><Shield className="mr-1 h-4 w-4" />Rôles</TabsTrigger>
          <TabsTrigger value="potentials"><Truck className="mr-1 h-4 w-4" />Potentiels</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="mr-1 h-4 w-4" />Paramètres</TabsTrigger>
        </TabsList>

        {/* ===== PROFILS TAB ===== */}
        <TabsContent value="users" className="mt-4 space-y-4">
          {/* Header with create button and filter */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Gestion des profils ({filteredUsers.length})
              </p>
              <div className="flex gap-1">
                {(['all', 'active', 'inactive'] as const).map(f => (
                  <Button key={f} variant={statusFilter === f ? 'default' : 'ghost'} size="sm" className="h-6 text-[10px] px-2"
                    onClick={() => setStatusFilter(f)}>
                    {f === 'all' ? 'Tous' : f === 'active' ? 'Actifs' : 'Inactifs'}
                  </Button>
                ))}
              </div>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <UserPlus className="h-4 w-4 mr-1" />Créer un profil
              </Button>
            )}
          </div>

          {usersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filteredUsers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {statusFilter !== 'all' ? 'Aucun profil dans ce filtre' : 'Aucun profil créé'}
                </p>
                {isAdmin && statusFilter === 'all' && (
                  <Button size="sm" className="mt-4" onClick={() => setShowCreateModal(true)}>
                    <UserPlus className="h-4 w-4 mr-1" />Créer un profil
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {/* User list */}
              <div className="space-y-2 md:col-span-1">
                {filteredUsers.map(u => (
                  <button key={u.id} onClick={() => setSelectedUserId(u.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      selectedUserId === u.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/30'
                    } ${!u.is_active ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full font-heading text-xs font-bold shrink-0 ${
                        u.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {u.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{u.full_name}</p>
                          {!u.is_active && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">Inactif</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className={`text-[9px] ${roleBadgeColors[u.role] || ''}`}>
                          {roleLabels[u.role] || u.role}
                        </Badge>
                        {isAdmin && u.role !== 'admin' && (
                          <button
                            onClick={e => { e.stopPropagation(); setShowDeleteModal(u.id); }}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Supprimer / Désactiver"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Selected user detail */}
              <div className="md:col-span-2 space-y-4">
                {!selectedUser ? (
                  <div className="py-12 text-center">
                    <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
                    <p className="mt-3 text-sm text-muted-foreground">Sélectionnez un profil pour voir ses données</p>
                  </div>
                ) : (
                  <>
                    {/* User header */}
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 font-heading text-lg font-bold text-primary">
                            {selectedUser.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-semibold">{selectedUser.full_name}</p>
                            <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                            {selectedUser.phone && (
                              <p className="text-xs text-muted-foreground">{selectedUser.phone}</p>
                            )}
                          </div>
                          {isAdmin ? (
                            <Select
                              value={selectedUser.role}
                              onValueChange={v => changeRoleMutation.mutate({ userId: selectedUser.id, newRole: v })}
                            >
                              <SelectTrigger className="h-8 w-[160px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(roleLabels).map(([key, label]) => (
                                  <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className={roleBadgeColors[selectedUser.role]}>
                              {roleLabels[selectedUser.role]}
                            </Badge>
                          )}
                        </div>
                        {/* Status + actions row */}
                        <div className="mt-3 flex items-center gap-2 pt-2 border-t">
                          <Badge variant={selectedUser.is_active ? 'default' : 'secondary'} className="text-[10px]">
                            {selectedUser.is_active ? 'Actif' : 'Inactif'}
                          </Badge>
                          {isAdmin && selectedUser.role !== 'admin' && (
                            <>
                              {selectedUser.is_active ? (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                                  onClick={() => manageUserMutation.mutate({ userId: selectedUser.id, action: 'deactivate' })}
                                  disabled={manageUserMutation.isPending}>
                                  <Power className="h-3.5 w-3.5 mr-1" />Désactiver
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary"
                                  onClick={() => manageUserMutation.mutate({ userId: selectedUser.id, action: 'reactivate' })}
                                  disabled={manageUserMutation.isPending}>
                                  <Power className="h-3.5 w-3.5 mr-1" />Réactiver
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive ml-auto"
                                onClick={() => setShowDeleteModal(selectedUser.id)}>
                                <Trash2 className="h-3.5 w-3.5 mr-1" />Supprimer
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* KPIs — only for commercial */}
                    {isCommercialRole(selectedUser.role) && (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <Card>
                            <CardContent className="p-3 text-center">
                              <Building2 className="mx-auto h-5 w-5 text-primary mb-1" />
                              <p className="text-lg font-bold">{selectedUserClients.length}</p>
                              <p className="text-[10px] text-muted-foreground">Clients</p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-3 text-center">
                              <MapPin className="mx-auto h-5 w-5 text-primary mb-1" />
                              <p className="text-lg font-bold">{selectedUserZones.length}</p>
                              <p className="text-[10px] text-muted-foreground">Zones</p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="p-3 text-center">
                              <Truck className="mx-auto h-5 w-5 text-primary mb-1" />
                              <p className="text-lg font-bold">
                                {selectedUserClients.reduce((s, c) => s + Number(c.annual_revenue_potential || 0), 0).toLocaleString('fr-FR')}€
                              </p>
                              <p className="text-[10px] text-muted-foreground">CA potentiel</p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Zones */}
                        <Card>
                          <CardHeader className="pb-2 px-4 pt-4">
                            <CardTitle className="font-heading text-sm flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />Zones ({selectedUserZones.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            {selectedUserZones.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Aucune zone assignée</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {selectedUserZones.map(z => (
                                  <Badge key={z.id} variant="outline" className="gap-1.5">
                                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: z.color }} />
                                    {z.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Weekly planning */}
                        <Card>
                          <CardHeader className="pb-2 px-4 pt-4">
                            <CardTitle className="font-heading text-sm flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-primary" />Planning hebdomadaire
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            <div className="grid grid-cols-5 gap-2">
                              {dayNames.map((day, i) => {
                                const plan = selectedUserPlanning.find((p: any) => p.day_of_week === i + 1);
                                const zone = plan?.commercial_zones;
                                return (
                                  <div key={i} className="rounded-lg border p-2 text-center">
                                    <p className="text-xs font-semibold">{day.slice(0, 3)}</p>
                                    {zone ? (
                                      <div className="mt-1">
                                        <div className="h-2 w-full rounded-full mx-auto" style={{ backgroundColor: zone.color }} />
                                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{zone.custom_label ? `${zone.system_name} — ${zone.custom_label}` : zone.system_name}</p>
                                      </div>
                                    ) : (
                                      <p className="text-[10px] text-muted-foreground mt-1">—</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Clients */}
                        <Card>
                          <CardHeader className="pb-2 px-4 pt-4">
                            <CardTitle className="font-heading text-sm flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-primary" />Clients ({selectedUserClients.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            {selectedUserClients.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Aucun client assigné</p>
                            ) : (
                              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                                {selectedUserClients.map(c => (
                                  <div key={c.id} className="flex items-center gap-2 rounded-lg bg-muted p-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium truncate">{c.company_name}</p>
                                      <p className="text-[10px] text-muted-foreground">{c.city || '—'}</p>
                                    </div>
                                    {(c as any).zone && (
                                      <Badge variant="outline" className="text-[9px] h-4">{(c as any).zone}</Badge>
                                    )}
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                      {Number(c.annual_revenue_potential || 0).toLocaleString('fr-FR')}€
                                    </span>
                                    {isAdmin && (
                                      <Select onValueChange={v => reassignClientMutation.mutate({ clientId: c.id, newRepId: v })}>
                                        <SelectTrigger className="h-6 w-6 border-0 p-0 [&>svg]:hidden">
                                          <ArrowRightCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {allUsers.filter(u => u.id !== selectedUserId).map(u => (
                                            <SelectItem key={u.id} value={u.id} className="text-xs">{u.full_name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </>
                    )}

                    {/* Non-commercial roles — minimal info */}
                    {!isCommercialRole(selectedUser.role) && (
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground">
                            {selectedUser.role === 'admin' && 'Ce profil a un accès complet à toutes les fonctionnalités et données.'}
                            {selectedUser.role === 'manager' && 'Ce profil peut voir les données de son équipe et gérer les commerciaux.'}
                            {selectedUser.role === 'executive' && 'Ce profil a un accès en lecture seule aux tableaux de bord et rapports.'}
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Conversions tab */}
        <TabsContent value="conversions" className="mt-4">
          <AdminConversionRequests />
        </TabsContent>

        {/* Zones tab */}
        <TabsContent value="zones" className="mt-4">
          <AdminZoneManager />
        </TabsContent>

        {/* Roles tab */}
        <TabsContent value="roles" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(roleLabels).map(([key, label]) => (
              <Card key={key}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <p className="font-medium">{label}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {key === 'admin' && 'Accès complet à toutes les fonctionnalités et données.'}
                    {key === 'manager' && 'Peut voir les données de son équipe et gérer les commerciaux.'}
                    {key === 'sales_rep' && 'Accès à ses propres clients, visites, tâches et rapports.'}
                    {key === 'executive' && 'Accès en lecture seule aux tableaux de bord et rapports.'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Vehicle Potentials tab */}
        <TabsContent value="potentials" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Configuration du potentiel véhicule
                </span>
                {!editingPotentials && (
                  <Button variant="outline" size="sm" onClick={startEditPotentials}>
                    <Edit className="h-3.5 w-3.5 mr-1" />Modifier
                  </Button>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Définissez le CA annuel potentiel par type de véhicule.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {potentialsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : editingPotentials ? (
                <div className="space-y-3">
                  {potentials.map(p => (
                    <div key={p.vehicle_type} className="flex items-center gap-3 rounded-lg border p-3">
                      <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium flex-1">{p.label}</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          value={potentialForm[p.vehicle_type] || 0}
                          onChange={e => setPotentialForm(f => ({ ...f, [p.vehicle_type]: parseInt(e.target.value) || 0 }))}
                          className="h-9 w-24 text-sm text-right"
                        />
                        <span className="text-xs text-muted-foreground">€/an</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button onClick={savePotentials} disabled={updatePotentialMutation.isPending}>
                      <Save className="h-4 w-4 mr-1" />
                      {updatePotentialMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingPotentials(false)}>Annuler</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {potentials.map(p => (
                    <div key={p.vehicle_type} className="flex items-center gap-3 rounded-lg bg-muted p-3">
                      <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium flex-1">{p.label}</span>
                      <span className="text-sm font-bold text-primary">{Number(p.annual_potential).toLocaleString('fr-FR')} €/an</span>
                      <span className="text-xs text-muted-foreground">({Math.round(Number(p.annual_potential) / 12)} €/mois)</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Les paramètres de l'application seront disponibles ici.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== CREATE USER MODAL ===== */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Créer un profil
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Prénom *</Label>
                <Input
                  placeholder="Jean"
                  value={createForm.firstName}
                  onChange={e => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nom *</Label>
                <Input
                  placeholder="Dupont"
                  value={createForm.lastName}
                  onChange={e => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input
                type="email"
                placeholder="jean.dupont@example.com"
                value={createForm.email}
                onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Téléphone</Label>
              <Input
                type="tel"
                placeholder="06 12 34 56 78"
                value={createForm.phone}
                onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rôle *</Label>
              <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mot de passe temporaire</Label>
              <Input
                type="password"
                placeholder="Laisser vide pour invitation par email"
                value={createForm.password}
                onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">
                Si renseigné, l'utilisateur pourra se connecter immédiatement avec ce mot de passe.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Annuler</Button>
            <Button
              onClick={() => createUserMutation.mutate()}
              disabled={createUserMutation.isPending || !createForm.firstName || !createForm.lastName || !createForm.email}
            >
              {createUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <UserPlus className="h-4 w-4 mr-1" />
              )}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      <Dialog open={!!showDeleteModal} onOpenChange={open => !open && setShowDeleteModal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Supprimer ce profil
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Voulez-vous supprimer le profil de <strong>{deleteTargetUser?.full_name}</strong> ?
          </p>
          <p className="text-xs text-muted-foreground">
            Les données associées (clients, visites, CA) seront conservées.
            Si ce profil a des données, il sera désactivé au lieu d'être supprimé.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteModal(null)}>Annuler</Button>
            <Button variant="destructive"
              onClick={() => showDeleteModal && manageUserMutation.mutate({ userId: showDeleteModal, action: 'delete' })}
              disabled={manageUserMutation.isPending}>
              {manageUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
