import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, TrendingUp, Loader2 } from 'lucide-react';

const STAGES = [
  { value: 'prospection', label: 'Prospection', color: 'bg-info/10 text-info border-info/20' },
  { value: 'qualification', label: 'Qualification', color: 'bg-primary/10 text-primary border-primary/20' },
  { value: 'proposition', label: 'Proposition', color: 'bg-warning/10 text-warning border-warning/20' },
  { value: 'negotiation', label: 'Négociation', color: 'bg-accent/10 text-accent border-accent/20' },
  { value: 'won', label: 'Gagné', color: 'bg-success/10 text-success border-success/20' },
];

const stageLabel = (v: string) => STAGES.find(s => s.value === v)?.label ?? v;
const stageColor = (v: string) => STAGES.find(s => s.value === v)?.color ?? '';

export default function OpportunitiesPage() {
  const { role } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [stage, setStage] = useState('prospection');
  const [amount, setAmount] = useState('');
  const [probability, setProbability] = useState('50');
  const [closeDate, setCloseDate] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch opportunities with customer join
  const { data: opportunities = [], isLoading } = useQuery({
    queryKey: ['opportunities', effectiveUserId, role],
    queryFn: async () => {
      let query = supabase
        .from('opportunities')
        .select('*, customers(company_name, city)')
        .order('expected_close_date', { ascending: true, nullsFirst: false });
      if (role !== 'admin' && role !== 'manager') {
        query = query.eq('rep_id', effectiveUserId!);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveUserId,
  });

  // Customers picker
  const { data: customers = [] } = useQuery({
    queryKey: ['customers-picker-opp', effectiveUserId, role],
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

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('opportunities').insert({
        title: title.trim(),
        customer_id: customerId,
        rep_id: effectiveUserId!,
        stage,
        estimated_amount: amount ? Number(amount) : null,
        probability: probability ? Number(probability) : 0,
        expected_close_date: closeDate || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast.success('Opportunité créée');
      resetForm();
    },
    onError: () => toast.error('Erreur lors de la création'),
  });

  const resetForm = () => {
    setShowNew(false);
    setTitle(''); setCustomerId(''); setStage('prospection');
    setAmount(''); setProbability('50'); setCloseDate(''); setNotes('');
  };

  // KPIs
  const totalPipeline = opportunities.reduce((s, o) => s + (Number(o.estimated_amount) || 0), 0);
  const weightedPipeline = opportunities.reduce((s, o) => s + ((Number(o.estimated_amount) || 0) * (o.probability || 0) / 100), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Opportunités</h1>
          <p className="text-sm text-muted-foreground">{opportunities.length} opportunité{opportunities.length > 1 ? 's' : ''} en cours</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle opportunité
        </Button>
      </div>

      {/* KPIs */}
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

      {/* Kanban desktop */}
      <div className="hidden lg:grid lg:grid-cols-5 gap-4">
        {STAGES.map((s) => {
          const stageOpps = opportunities.filter(o => o.stage === s.value);
          const stageTotal = stageOpps.reduce((sum, o) => sum + (Number(o.estimated_amount) || 0), 0);
          return (
            <div key={s.value} className="space-y-3">
              <div className={`rounded-lg border p-3 ${s.color}`}>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs">{stageOpps.length} · {stageTotal.toLocaleString('fr-FR')} €</p>
              </div>
              {stageOpps.map((opp) => {
                const cust = opp.customers as any;
                return (
                  <Card key={opp.id} className="cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all">
                    <CardContent className="p-3">
                      <p className="text-sm font-medium">{opp.title}</p>
                      <p className="text-xs text-muted-foreground">{cust?.company_name ?? '—'}</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="font-medium">{(Number(opp.estimated_amount) || 0).toLocaleString('fr-FR')} €</span>
                        <Badge variant="secondary" className="text-[10px]">{opp.probability}%</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Mobile list */}
      <div className="lg:hidden space-y-3">
        {opportunities.map((opp) => {
          const cust = opp.customers as any;
          return (
            <Card key={opp.id} className="cursor-pointer hover:shadow-sm transition-all">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{opp.title}</p>
                  <p className="text-xs text-muted-foreground">{cust?.company_name ?? '—'}{cust?.city ? ` · ${cust.city}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">{(Number(opp.estimated_amount) || 0).toLocaleString('fr-FR')} €</p>
                  <Badge variant="secondary" className="text-[10px]">{stageLabel(opp.stage)}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {opportunities.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/20" />
            <p className="text-base font-semibold text-muted-foreground">Aucune opportunité</p>
            <Button size="sm" className="mt-2" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Nouvelle opportunité
            </Button>
          </div>
        )}
      </div>

      {/* New opportunity sheet */}
      <Sheet open={showNew} onOpenChange={o => !o && resetForm()}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nouvelle opportunité</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">Titre *</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Contrat pneus PL 2026" />
            </div>
            <div>
              <label className="text-sm font-medium">Client *</label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Étape</label>
              <Select value={stage} onValueChange={setStage}>
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
                <label className="text-sm font-medium">Montant estimé (€)</label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="text-sm font-medium">Probabilité (%)</label>
                <Input type="number" min="0" max="100" value={probability} onChange={e => setProbability(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Date de clôture prévue</label>
              <Input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexte, détails…" rows={3} />
            </div>
            <Button
              className="w-full h-11 font-semibold"
              disabled={!title.trim() || !customerId || createMutation.isPending}
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
