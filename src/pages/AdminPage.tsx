import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Shield, Settings as SettingsIcon, Truck, Plus, Edit, Trash2, Save, Loader2 } from 'lucide-react';
import { useVehiclePotentials, type VehiclePotential } from '@/hooks/useVehiclePotentials';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const users = [
  { id: '1', name: 'Sophie Leclerc', email: 'sophie@f7sales.com', role: 'sales_rep', status: 'active' },
  { id: '2', name: 'Marc Dubois', email: 'marc@f7sales.com', role: 'sales_rep', status: 'active' },
  { id: '3', name: 'Claire Moreau', email: 'claire@f7sales.com', role: 'manager', status: 'active' },
  { id: '4', name: 'Jean-Pierre Duval', email: 'jp@f7sales.com', role: 'admin', status: 'active' },
  { id: '5', name: 'Isabelle Fontaine', email: 'isabelle@f7sales.com', role: 'executive', status: 'active' },
];

const roleLabels: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Responsable',
  sales_rep: 'Commercial',
  executive: 'Observateur',
};

export default function AdminPage() {
  const { data: potentials = [], isLoading: potentialsLoading } = useVehiclePotentials();
  const [editingPotentials, setEditingPotentials] = useState(false);
  const [potentialForm, setPotentialForm] = useState<Record<string, number>>({});
  const queryClient = useQueryClient();

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-2xl font-bold">Administration</h1>
        <p className="text-sm text-muted-foreground">Gérez les utilisateurs et les paramètres</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />Utilisateurs</TabsTrigger>
          <TabsTrigger value="roles"><Shield className="mr-1 h-4 w-4" />Rôles</TabsTrigger>
          <TabsTrigger value="potentials"><Truck className="mr-1 h-4 w-4" />Potentiels</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="mr-1 h-4 w-4" />Paramètres</TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button><Plus className="mr-2 h-4 w-4" />Ajouter un utilisateur</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-4 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-bold text-primary">
                      {user.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{roleLabels[user.role]}</Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
                Définissez le CA annuel potentiel par type de véhicule. Ces valeurs sont utilisées pour calculer le potentiel de chaque client.
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
    </div>
  );
}
