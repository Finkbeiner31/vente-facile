import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckSquare, Plus, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const tasks = [
  { id: '1', title: 'Envoyer devis Boulangerie Martin', client: 'Boulangerie Martin', due: '12 Avr 2026', status: 'todo', priority: 'high' },
  { id: '2', title: 'Relancer Café du Commerce', client: 'Café du Commerce', due: '10 Avr 2026', status: 'todo', priority: 'medium' },
  { id: '3', title: 'Préparer présentation nouveau produit', client: '—', due: '15 Avr 2026', status: 'in_progress', priority: 'high' },
  { id: '4', title: 'Mettre à jour fiche Restaurant Le Gourmet', client: 'Restaurant Le Gourmet', due: '16 Avr 2026', status: 'todo', priority: 'low' },
  { id: '5', title: 'Envoyer documentation Pharmacie du Centre', client: 'Pharmacie du Centre', due: '09 Avr 2026', status: 'in_progress', priority: 'medium' },
  { id: '6', title: 'Confirmer RDV Librairie Centrale', client: 'Librairie Centrale', due: '07 Avr 2026', status: 'done', priority: 'medium' },
  { id: '7', title: 'Planifier visite Q2 Garage Auto Plus', client: 'Garage Auto Plus', due: '20 Avr 2026', status: 'todo', priority: 'low' },
];

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  todo: { label: 'À faire', icon: Clock, className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'En cours', icon: AlertTriangle, className: 'bg-warning/10 text-warning' },
  done: { label: 'Terminé', icon: CheckCircle, className: 'bg-success/10 text-success' },
  cancelled: { label: 'Annulé', icon: XCircle, className: 'bg-destructive/10 text-destructive' },
};

const priorityDot: Record<string, string> = {
  high: 'bg-destructive',
  medium: 'bg-warning',
  low: 'bg-success',
};

export default function TasksPage() {
  const [tab, setTab] = useState('all');

  const filtered = tab === 'all' ? tasks : tasks.filter(t => t.status === tab);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Tâches</h1>
          <p className="text-sm text-muted-foreground">{tasks.filter(t => t.status !== 'done').length} tâches en cours</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle tâche
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Toutes ({tasks.length})</TabsTrigger>
          <TabsTrigger value="todo">À faire ({tasks.filter(t => t.status === 'todo').length})</TabsTrigger>
          <TabsTrigger value="in_progress">En cours ({tasks.filter(t => t.status === 'in_progress').length})</TabsTrigger>
          <TabsTrigger value="done">Terminées ({tasks.filter(t => t.status === 'done').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {filtered.map((task) => {
          const config = statusConfig[task.status];
          const Icon = config.icon;
          return (
            <Card key={task.id} className="cursor-pointer transition-all hover:shadow-sm hover:border-primary/30">
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${priorityDot[task.priority]}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{task.client}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:inline">{task.due}</span>
                  <Badge className={`text-[10px] ${config.className}`}>
                    {config.label}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
