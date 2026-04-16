import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PostponeTaskSheet } from '@/components/PostponeTaskSheet';
import { toast } from 'sonner';
import {
  CheckSquare, Plus, Clock, AlertTriangle, CheckCircle, Building2,
  CalendarClock, Loader2,
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Task = Tables<'tasks'>;

const isOverdue = (dateStr: string | null) => {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
};

const formatDate = (raw: string) => {
  const d = new Date(raw);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export default function TasksPage() {
  const { role } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('active');
  const [postponeTask, setPostponeTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', effectiveUserId, role],
    queryFn: async () => {
      let query = supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false });
      if (role !== 'admin' && role !== 'manager') {
        query = query.or(`assigned_to.eq.${effectiveUserId},created_by.eq.${effectiveUserId}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Task[];
    },
    enabled: !!effectiveUserId,
  });

  // Fetch customers for picker
  const { data: customers = [] } = useQuery({
    queryKey: ['customers-picker', effectiveUserId, role],
    queryFn: async () => {
      let query = supabase.from('customers').select('id, company_name').order('company_name');
      if (role !== 'admin' && role !== 'manager') {
        query = query.eq('assigned_rep_id', effectiveUserId!);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveUserId,
  });

  // Create task mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').insert({
        title: newTitle.trim(),
        priority: newPriority,
        due_date: newDueDate || null,
        customer_id: newCustomerId || null,
        description: newDescription.trim() || null,
        assigned_to: effectiveUserId!,
        created_by: effectiveUserId!,
        status: 'todo',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tâche créée');
      setShowNewTask(false);
      setNewTitle(''); setNewPriority('medium'); setNewDueDate(''); setNewCustomerId(''); setNewDescription('');
    },
    onError: () => toast.error('Erreur lors de la création'),
  });

  // Complete task mutation
  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').update({
        status: 'done',
        completed_at: new Date().toISOString(),
      }).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tâche terminée !');
    },
    onError: () => toast.error('Erreur'),
  });

  // Postpone task mutation
  const postponeMutation = useMutation({
    mutationFn: async ({ taskId, newDueDate }: { taskId: string; newDueDate: string }) => {
      const { error } = await supabase.from('tasks').update({
        due_date: newDueDate,
      }).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.info('Tâche reportée');
      setPostponeTask(null);
    },
    onError: () => toast.error('Erreur'),
  });

  const active = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');
  const overdue = active.filter(t => isOverdue(t.due_date));
  const filtered = tab === 'done' ? done : tab === 'overdue' ? overdue : active;

  const customerName = (id: string | null) => {
    if (!id) return null;
    return customers.find(c => c.id === id)?.company_name ?? null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl md:text-2xl font-bold">Tâches</h1>
          <p className="text-xs text-muted-foreground">
            {active.length} actives
            {overdue.length > 0 && (
              <> · <span className="text-destructive font-semibold">{overdue.length} en retard</span></>
            )}
          </p>
        </div>
        <Button size="sm" className="h-10 px-4 font-semibold" onClick={() => setShowNewTask(true)}>
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
          const taskOverdue = isOverdue(task.due_date) && task.status !== 'done';
          const client = customerName(task.customer_id);
          return (
            <Card key={task.id} className={`transition-all ${taskOverdue ? 'border-destructive/40 bg-destructive/5' : ''}`}>
              <CardContent className="p-3 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                    task.priority === 'high' ? 'bg-destructive' :
                    task.priority === 'medium' ? 'bg-warning' : 'bg-success'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                      {task.title}
                    </p>
                    {client && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {client}
                      </div>
                    )}
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pl-[22px]">
                  {task.due_date && (
                    <Badge
                      variant="secondary"
                      className={`text-[11px] h-6 gap-1 font-semibold ${taskOverdue ? 'bg-destructive/10 text-destructive' : ''}`}
                    >
                      <Clock className="h-3 w-3" />
                      {taskOverdue && <AlertTriangle className="h-3 w-3" />}
                      {formatDate(task.due_date)}
                      {taskOverdue && ' · En retard'}
                    </Badge>
                  )}

                  {task.status === 'done' && task.completed_at && (
                    <Badge variant="secondary" className="text-[11px] h-6 gap-1 bg-success/10 text-success font-medium">
                      <CheckCircle className="h-3 w-3" />
                      Terminée {formatDate(task.completed_at.split('T')[0])}
                    </Badge>
                  )}
                </div>

                {task.status !== 'done' && (
                  <div className="flex gap-2 pl-[22px]">
                    <Button size="sm" className="h-9 text-xs flex-1 font-semibold"
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(task.id)}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Terminer
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 text-xs flex-1"
                      onClick={() => setPostponeTask(task)}>
                      <CalendarClock className="h-3.5 w-3.5 mr-1" /> Reporter
                    </Button>
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
          <Button size="sm" className="mt-2 h-10 px-5 font-semibold" onClick={() => setShowNewTask(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle tâche
          </Button>
        </div>
      )}

      {/* New task sheet */}
      <Sheet open={showNewTask} onOpenChange={setShowNewTask}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nouvelle tâche</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">Titre *</label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Relancer devis pneus" />
            </div>
            <div>
              <label className="text-sm font-medium">Priorité</label>
              <Select value={newPriority} onValueChange={setNewPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="low">Basse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Échéance</label>
              <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Client lié</label>
              <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Détails optionnels…" rows={3} />
            </div>
            <Button className="w-full h-11 font-semibold" disabled={!newTitle.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Créer la tâche
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Postpone sheet */}
      <PostponeTaskSheet
        open={!!postponeTask}
        onOpenChange={open => !open && setPostponeTask(null)}
        taskTitle={postponeTask?.title ?? ''}
        onSubmit={(data) => {
          if (!postponeTask) return;
          postponeMutation.mutate({ taskId: postponeTask.id, newDueDate: data.newDueDate });
        }}
      />
    </div>
  );
}
