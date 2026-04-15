import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Plus, TrendingUp, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const STAGES = [
  { value: 'prospection', label: 'Prospection', color: 'bg-info/10 text-info border-info/20' },
  { value: 'qualification', label: 'Qualification', color: 'bg-primary/10 text-primary border-primary/20' },
  { value: 'proposition', label: 'Proposition', color: 'bg-warning/10 text-warning border-warning/20' },
  { value: 'negociation', label: 'Négociation', color: 'bg-accent/10 text-accent border-accent/20' },
  { value: 'gagne', label: 'Gagné', color: 'bg-success/10 text-success border-success/20' },
  { value: 'perdu', label: 'Perdu', color: 'bg-destructive/10 text-destructive border-destructive/20' },
];

const getStageConfig = (stage: string) => STAGES.find(s => s.value === stage) || STAGES[0];

export default function OpportunitiesPage() {
  const { user, role } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();

  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newStage, setNewStage] = useState('prospection');
  const [newAmount, setNewAmount] = useState('');
  const [newProba, setNewProba] = useState('');
  const [newCloseDate, setNewCloseDate] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const { data: opportunities = [], isLoading } = useQuery({
    queryKey: ['opportunities', activeUserId],
    queryFn: async () => {
      if (!activeUserId) return [];
      let query = supabase
        .from('opportunities')
        .select('*, customers(company_name, city)')
        .order('created_at', { ascending: false });
      if (role !== 'admin' && role !== 'manager') {
        query = query.eq('rep_id', activeUserId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['opp-customers', activeUserId],
    queryFn: async () => {
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
      if (!activeUserId || !newTitle.trim() || !newCustomerId) throw new Error('Missing');
      const { error } = await supabase.from('opportunities').insert({
        title: newTitle.trim(),
        customer_id: newCustomerId,
        rep_id: activeUserId,
        stage: newStage,
        estimated_amount: newAmount ? Number(newAmount) : null,
        probability: newProba ? Number(newProba) : 0,
        expected_close_date: newCloseDate || null,
        notes: newNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities', activeUserId] });
      setNewOpen(false);
      setNewTitle('');
      setNewCustomerId('');
      setNewStage('prospection');
      setNewAmount('');
      setNewProba('');
      setNewCloseDate('');
      setNewNotes('');
      toast.success('Opportunité créée');
    },
    onError: () => toast.error('Erreur lors de la création'),
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from('opportunities').update({ stage }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities', activeUserId] });
    },
  });

  const totalPipeline = opportunities.reduce((sum: number, o: any) => sum + (o.estimated_amount || 0), 0);
  const weightedPipeline = opportunities.reduce((sum: number, o: any) => sum + ((o.estimated_amount || 0) * (o.probability || 0) / 100), 0);
  const activeOpps = opportunities.filter((o: any) => o.stage !== 'perdu');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Opportunités</h1>
          <p className="text-sm text-muted-foreground">{opportunities.length} opportunités en cours</p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle opportunité
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Pipeline total</p>
            <p className="font-heading text-2xl font-bold">{totalPipeline.toLocaleString('fr-FR')} €</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Pipeline pondéré</p>
            <p className="font-heading text-2xl font-bold">{weightedPipeline.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Nombre d'opportunités</p>
            <p className="font-heading text-2xl font-bold">{opportunities.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Kanban — desktop */}
      <div className="hidden lg:grid lg:grid-cols-6 gap-4">
        {STAGES.map((stage) => {
          const stageOpps = opportunities.filter((o: any) => o.stage === stage.value);
          return (
            <div key={stage.value} className="space-y-3">
              <div className={`rounded-lg border p-3 ${stage.color}`}>
                <p className="text-sm font-medium">{stage.label}</p>
                <p className="text-xs">{stageOpps.length} · {stageOpps.reduce((s: number, o: any) => s + (o.estimated_amount || 0), 0).toLocaleString('fr-FR')} €</p>
              </div>
              {stageOpps.map((opp: any) => (
                <Card key={opp.id} className="cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium">{opp.title}</p>
                    <p className="text-xs text-muted-foreground">{opp.customers?.company_name}</p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-medium">{(opp.estimated_amount || 0).toLocaleString('fr-FR')} €</span>
                      <Badge variant="secondary" className="text-[10px]">{opp.probability || 0}%</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })}
      </div>

      {/* Mobile list */}
      <div className="lg:hidden space-y-3">
        {opportunities.map((opp: any) => {
          const stageConf = getStageConfig(opp.stage);
          return (
            <Card key={opp.id} className="cursor-pointer hover:shadow-sm transition-all">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{opp.title}</p>
                    <p className="text-xs text-muted-foreground">{opp.customers?.company_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">{(opp.estimated_amount || 0).toLocaleString('fr-FR')} €</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={opp.stage}
                    onValueChange={(val) => updateStageMutation.mutate({ id: opp.id, stage: val })}
                  >
                    <SelectTrigger className="h-7 text-xs w-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="secondary" className="text-[10px]">{opp.probability || 0}%</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {opportunities.length === 0 && (
        <div className="py-16 text-center space-y-3">
          <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/20" />
          <p className="text-base font-semibold text-muted-foreground">Aucune opportunité</p>
          <Button size="sm" className="mt-2" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Créer une opportunité
          </Button>
        </div>
      )}

      {/* New opportunity sheet */}
      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nouvelle opportunité</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Titre *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Contrat flotte 2026" />
            </div>
            <div>
              <Label>Client *</Label>
              <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Étape</Label>
              <Select value={newStage} onValueChange={setNewStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Montant estimé (€)</Label>
                <Input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label>Probabilité (%)</Label>
                <Input type="number" min="0" max="100" value={newProba} onChange={e => setNewProba(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Date de clôture prévue</Label>
              <Input type="date" value={newCloseDate} onChange={e => setNewCloseDate(e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2} placeholder="Notes optionnelles..." />
            </div>
            <Button
              className="w-full h-12 font-semibold"
              disabled={!newTitle.trim() || !newCustomerId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Créer l'opportunité
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
