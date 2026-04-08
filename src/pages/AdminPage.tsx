import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Shield, Settings as SettingsIcon, Database, Plus, Edit, Trash2 } from 'lucide-react';

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
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-2xl font-bold">Administration</h1>
        <p className="text-sm text-muted-foreground">Gérez les utilisateurs et les paramètres</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />Utilisateurs</TabsTrigger>
          <TabsTrigger value="roles"><Shield className="mr-1 h-4 w-4" />Rôles</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="mr-1 h-4 w-4" />Paramètres</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un utilisateur
            </Button>
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
