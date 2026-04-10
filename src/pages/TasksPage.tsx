import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckSquare, Plus, Clock, AlertTriangle, CheckCircle, Building2,
  CalendarClock, Bell, CalendarDays, History,
} from 'lucide-react';
import { PostponeTaskSheet } from '@/components/PostponeTaskSheet';
import { toast } from 'sonner';

interface TaskHistoryEntry {
  action: string;
  date: string;
  detail?: string;
}

interface Task {
  id: string;
  title: string;
  client: string;
  visitRef: string | null;
  due: string;
  dueRaw: string;
  status: string;
  priority: string;
  completedAt?: string;
  reminderMode?: string;
  reminderDate?: string;
  reminderTime?: string;
  history: TaskHistoryEntry[];
}

const initialTasks: Task[] = [];

const isOverdue = (dateStr: string) => new Date(dateStr) < new Date('2026-04-08');

const formatDate = (raw: string) => {
  const d = new Date(raw);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const REMINDER_LABELS: Record<string, string> = {
  notification: 'Notif. app',
  simple: 'Rappel',
  agenda: 'Agenda',
  autre: 'Autre',
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [tab, setTab] = useState('active');
  const [postponeTask, setPostponeTask] = useState<Task | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const active = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');
  const overdue = active.filter(t => isOverdue(t.dueRaw));
  const filtered = tab === 'done' ? done : tab === 'overdue' ? overdue : active;

  const completeTask = (id: string) => {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(t =>
      t.id === id ? {
        ...t,
        status: 'done',
        completedAt: now,
        history: [...t.history, { action: 'completed', date: now.split('T')[0] }],
      } : t
    ));
    toast.success('Tâche terminée !');
  };

  const handlePostpone = (data: {
    newDueDate: string;
    newDueTime: string;
    reason: string;
    reminderMode: string;
    reminderDate: string;
    reminderTime: string;
    reminderNote: string;
  }) => {
    if (!postponeTask) return;
    const now = new Date().toISOString().split('T')[0];
    setTasks(prev => prev.map(t =>
      t.id === postponeTask.id ? {
        ...t,
        dueRaw: data.newDueDate,
        due: formatDate(data.newDueDate),
        reminderMode: data.reminderMode,
        reminderDate: data.reminderDate || undefined,
        reminderTime: data.reminderTime || undefined,
        history: [...t.history, {
          action: 'postponed',
          date: now,
          detail: data.reason || `Reporté au ${formatDate(data.newDueDate)}`,
        }],
      } : t
    ));
    setPostponeTask(null);
    toast.info('Tâche reportée');
  };

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
          <TabsTrigger value="overdue" className="text-xs">En retard ({overdue.length})</TabsTrigger>
          <TabsTrigger value="done" className="text-xs">Terminées ({done.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {filtered.map(task => {
          const taskOverdue = isOverdue(task.dueRaw) && task.status !== 'done';
          const isExpanded = expandedHistory === task.id;
          return (
            <Card key={task.id} className={`transition-all ${taskOverdue ? 'border-destructive/40 bg-destructive/5' : ''}`}>
              <CardContent className="p-3 space-y-2.5">
                {/* Row 1: priority dot + title + client */}
                <div className="flex items-start gap-2.5">
                  <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                    task.priority === 'high' ? 'bg-destructive' :
                    task.priority === 'medium' ? 'bg-warning' : 'bg-success'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                      {task.title}
                    </p>
                    {task.client !== '—' && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {task.client}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Due date + reminder + visit ref — info strip */}
                <div className="flex items-center gap-2 flex-wrap pl-[22px]">
                  <Badge
                    variant="secondary"
                    className={`text-[11px] h-6 gap-1 font-semibold ${taskOverdue ? 'bg-destructive/10 text-destructive' : ''}`}
                  >
                    <Clock className="h-3 w-3" />
                    {taskOverdue && <AlertTriangle className="h-3 w-3" />}
                    {task.due}
                    {taskOverdue && ' · En retard'}
                  </Badge>

                  {task.reminderMode && (
                    <Badge variant="outline" className="text-[11px] h-6 gap-1 border-primary/30 text-primary font-medium">
                      {task.reminderMode === 'agenda' ? <CalendarDays className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                      {REMINDER_LABELS[task.reminderMode]}
                      {task.reminderDate && ` · ${formatDate(task.reminderDate)}`}
                    </Badge>
                  )}

                  {task.visitRef && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {task.visitRef}
                    </Badge>
                  )}

                  {task.status === 'done' && task.completedAt && (
                    <Badge variant="secondary" className="text-[11px] h-6 gap-1 bg-success/10 text-success font-medium">
                      <CheckCircle className="h-3 w-3" />
                      Terminée {formatDate(task.completedAt.split('T')[0])}
                    </Badge>
                  )}
                </div>

                {/* Row 3: Action buttons */}
                {task.status !== 'done' && (
                  <div className="flex gap-2 pl-[22px]">
                    <Button size="sm" className="h-9 text-xs flex-1 font-semibold"
                      onClick={() => completeTask(task.id)}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Terminer
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 text-xs flex-1"
                      onClick={() => setPostponeTask(task)}>
                      <CalendarClock className="h-3.5 w-3.5 mr-1" /> Reporter
                    </Button>
                  </div>
                )}

                {/* History toggle */}
                <button
                  onClick={() => setExpandedHistory(isExpanded ? null : task.id)}
                  className="flex items-center gap-1 pl-[22px] text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <History className="h-3 w-3" />
                  Historique ({task.history.length})
                </button>

                {isExpanded && (
                  <div className="ml-[22px] pl-3 border-l-2 border-border space-y-1">
                    {task.history.map((h, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground">
                        <span className="font-medium">
                          {h.action === 'created' ? 'Créée' : h.action === 'completed' ? 'Terminée' : 'Reportée'}
                        </span>
                        {' · '}
                        {formatDate(h.date)}
                        {h.detail && <span className="italic"> — {h.detail}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center space-y-3">
          <CheckSquare className="mx-auto h-12 w-12 text-muted-foreground/20" />
          <p className="text-base font-semibold text-muted-foreground">Aucune tâche</p>
          <p className="text-sm text-muted-foreground/70">Ajoutez vos premières tâches pour suivre vos actions commerciales</p>
          <Button size="sm" className="mt-2 h-10 px-5 font-semibold">
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle tâche
          </Button>
        </div>
      )}

      {/* Postpone sheet */}
      <PostponeTaskSheet
        open={!!postponeTask}
        onOpenChange={open => !open && setPostponeTask(null)}
        taskTitle={postponeTask?.title ?? ''}
        onSubmit={handlePostpone}
      />
    </div>
  );
}
