import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckSquare, Plus, Clock, AlertTriangle, CheckCircle, Building2 } from 'lucide-react';

const tasks = [
  { id: '1', title: 'Envoyer devis Boulangerie Martin', client: 'Boulangerie Martin', visitRef: 'Visite du 08 Avr', due: '12 Avr', dueRaw: '2026-04-12', status: 'todo', priority: 'high' },
  { id: '2', title: 'Relancer Café du Commerce', client: 'Café du Commerce', visitRef: 'Visite du 07 Avr', due: '10 Avr', dueRaw: '2026-04-10', status: 'todo', priority: 'medium' },
  { id: '3', title: 'Envoyer documentation Pharmacie', client: 'Pharmacie du Centre', visitRef: 'Visite du 03 Avr', due: '06 Avr', dueRaw: '2026-04-06', status: 'todo', priority: 'high' },
  { id: '4', title: 'Préparer présentation nouveau produit', client: '—', visitRef: null, due: '15 Avr', dueRaw: '2026-04-15', status: 'in_progress', priority: 'high' },
  { id: '5', title: 'Mettre à jour fiche Restaurant', client: 'Restaurant Le Gourmet', visitRef: null, due: '16 Avr', dueRaw: '2026-04-16', status: 'todo', priority: 'low' },
  { id: '6', title: 'Confirmer RDV Librairie Centrale', client: 'Librairie Centrale', visitRef: null, due: '07 Avr', dueRaw: '2026-04-07', status: 'done', priority: 'medium' },
];

const isOverdue = (dateStr: string) => new Date(dateStr) < new Date('2026-04-08');

export default function TasksPage() {
  const [tab, setTab] = useState('active');

  const active = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');
  const overdue = active.filter(t => isOverdue(t.dueRaw));
  const filtered = tab === 'done' ? done : tab === 'overdue' ? overdue : active;

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl md:text-2xl font-bold">Tâches</h1>
          <p className="text-xs text-muted-foreground">
            {active.length} actives · {overdue.length > 0 && (
              <span className="text-destructive font-semibold">{overdue.length} en retard</span>
            )}
          </p>
        </div>
        <Button size="sm" className="h-10 px-4 font-semibold">
          <Plus className="h-4 w-4 mr-1.5" />
          Nouvelle
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="active" className="text-xs">Actives ({active.length})</TabsTrigger>
          <TabsTrigger value="overdue" className="text-xs">
            En retard ({overdue.length})
          </TabsTrigger>
          <TabsTrigger value="done" className="text-xs">Terminées ({done.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {filtered.map(task => {
          const overdue = isOverdue(task.dueRaw) && task.status !== 'done';
          return (
            <Card key={task.id} className={`transition-all ${overdue ? 'border-destructive/40 bg-destructive/5' : ''}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${
                    task.priority === 'high' ? 'bg-destructive' :
                    task.priority === 'medium' ? 'bg-warning' : 'bg-success'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {task.client !== '—' && (
                        <Badge variant="secondary" className="text-[9px] h-5 gap-1">
                          <Building2 className="h-2.5 w-2.5" />
                          {task.client}
                        </Badge>
                      )}
                      {task.visitRef && (
                        <Badge variant="outline" className="text-[9px] h-5">
                          {task.visitRef}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${overdue ? 'bg-destructive/10 text-destructive' : ''}`}
                    >
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      {task.due}
                    </Badge>
                    {overdue && (
                      <span className="flex items-center gap-0.5 text-[10px] text-destructive font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        En retard
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick action */}
                {task.status !== 'done' && (
                  <div className="flex gap-2 mt-2.5">
                    <Button variant="outline" size="sm" className="h-8 text-xs flex-1">
                      <CheckCircle className="h-3 w-3 mr-1" /> Terminer
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center">
          <CheckSquare className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">Aucune tâche dans cette catégorie</p>
        </div>
      )}
    </div>
  );
}
