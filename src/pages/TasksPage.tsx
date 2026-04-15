import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  CheckSquare, Plus, Clock, AlertTriangle, CheckCircle, Building2,
  CalendarClock, Bell, CalendarDays, History, Loader2,
} from 'lucide-react';
import { PostponeTaskSheet } from '@/components/PostponeTaskSheet';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const isOverdue = (dateStr: string) => {
  return new Date(dateStr + 'T00:00:00') < new Date(new Date().toDateString());
};

const formatDate = (raw: string) => {
  const d = new Date(raw);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

export default function TasksPage() {
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('active');
  const [postponeTask, setPostponeTask] = useState<any>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDue, setNewDue] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');

  const invalidateKeys = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks-page', activeUserId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-urgent-tasks', activeUserId] });
  };

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks-page', activeUserId],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('*, customers(company_name)')
        .eq('assigned_to', activeUserId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['tasks-customers', activeUserId],
    queryFn: async () => {
      if (!activeUserId) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name');
      return data || [];
    },
    enabled: !!activeUserId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeUserId || !newTitle.trim()) throw new Error('Missing data');
      const { error } = await supabase.from('tasks').insert({
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        priority: newPriority,
        due_date: newDue || null,
        customer_id: newCustomerId || null,
        assigned_to: activeUserId,
        created_by: activeUserId,
        status: 'todo',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys();
      setNewOpen(false);
      setNewTitle('');
      setNewDesc('');
      setNewPriority('medium');
      setNewDue('');
      setNewCustomerId('');
      toast.success('Tâche créée');
    },
    onError: () => toast.error('Erreur lors de la création'),
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').update({
        status: 'done',
        completed_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys();
      toast.success('Tâche terminée !');
    },
  });

  const handlePostpone = async (data: {
    newDueDate: string;
    newDueTime: string;
    reason: string;
    reminderMode: string;
    reminderDate: string;
    reminderTime: string;
    reminderNote: string;
  }) => {
    if (!postponeTask) return;
    const { error } = await supabase.from('tasks').update({
      due_date: data.newDueDate,
    }).eq('id', postponeTask.id);
    if (error) {
      toast.error('Erreur lors du report');
      return;
    }
    invalidateKeys();
    setPostponeTask(null);
    toast.info('Tâche reportée');
  };

  const active = tasks.filter((t: any) => t.status !== 'done');
  const done = tasks.filter((t: any) => t.status === 'done');
  const overdue = active.filter((t: any) => t.due_date && isOverdue(t.due_date));
  const filtered = tab === 'done' ? done : tab === 'overdue' ? overdue : active;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl md:text-2xl font-bold">Tâches</h1>
          <p className="text-xs text-muted-foreground">
            {active.length} actives{overdue.length > 0 && (
              <> · <span className="text-destructive font-semibold">{overdue.length} en retard</span></>
            )}
          </p>
        </div>
        <Button size="sm" className="h-10 px-4 font-semibold" onClick={() => setNewOpen(true)}>
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
        {filtered.map((task: any) => {
          const taskOverdue = task.due_date && isOverdue(task.due_date) && task.status !== 'done';
          const clientName = task.customers?.company_name;
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
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                    )}
                    {clientName && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {clientName}
                      </div>
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
          <Button size="sm" className="mt-2 h-10 px-5 font-semibold" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nouvelle tâche
          </Button>
        </div>
      )}

      {/* New task sheet */}
      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nouvelle tâche</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Titre *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Envoyer le devis" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Détails optionnels..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priorité</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Échéance</Label>
                <Input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Client lié</Label>
              <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun</SelectItem>
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full h-12 font-semibold" disabled={!newTitle.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Créer la tâche
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <PostponeTaskSheet
        open={!!postponeTask}
        onOpenChange={open => !open && setPostponeTask(null)}
        taskTitle={postponeTask?.title ?? ''}
        onSubmit={handlePostpone}
      />
    </div>
  );
}
