import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, ArrowRight, AlertTriangle, Loader2, Check, Merge } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MergeAccountSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceCustomer: any;
}

type MergeStep = 'search' | 'review' | 'confirm';

const MERGE_FIELDS = [
  { key: 'phone', label: 'Téléphone' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Adresse' },
  { key: 'city', label: 'Ville' },
  { key: 'postal_code', label: 'Code postal' },
  { key: 'customer_type', label: 'Type de compte' },
  { key: 'relationship_type', label: 'Type de relation' },
  { key: 'equipment_type', label: 'Équipement principal' },
  { key: 'activity_type', label: "Type d'activité" },
  { key: 'website', label: 'Site web' },
  { key: 'notes', label: 'Notes' },
] as const;

const FLEET_FIELDS = [
  { key: 'fleet_pl', label: 'PL' },
  { key: 'fleet_vu', label: 'VU' },
  { key: 'fleet_remorque', label: 'Remorques' },
  { key: 'fleet_car_bus', label: 'Cars/Bus' },
] as const;

export function MergeAccountSheet({ open, onOpenChange, sourceCustomer }: MergeAccountSheetProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<MergeStep>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [fieldChoices, setFieldChoices] = useState<Record<string, 'source' | 'target'>>({});
  const [merging, setMerging] = useState(false);

  // Search for target accounts
  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['merge-search', searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, company_name, city, postal_code, customer_type, account_status')
        .neq('id', sourceCustomer.id)
        .neq('account_status', 'archived')
        .ilike('company_name', `%${searchQuery}%`)
        .limit(20);
      return data || [];
    },
    enabled: open && searchQuery.length >= 2,
  });

  // Load target customer details
  const { data: targetCustomer } = useQuery({
    queryKey: ['merge-target', targetId],
    queryFn: async () => {
      if (!targetId) return null;
      const { data } = await supabase.from('customers').select('*').eq('id', targetId).maybeSingle();
      return data;
    },
    enabled: !!targetId,
  });

  // Load linked data counts for summary
  const { data: sourceCounts } = useQuery({
    queryKey: ['merge-counts', sourceCustomer.id],
    queryFn: async () => {
      const [reports, tasks, opps, revs, contacts] = await Promise.all([
        supabase.from('visit_reports').select('id', { count: 'exact', head: true }).eq('customer_id', sourceCustomer.id),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('customer_id', sourceCustomer.id),
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('customer_id', sourceCustomer.id),
        supabase.from('monthly_revenues').select('id', { count: 'exact', head: true }).eq('customer_id', sourceCustomer.id),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('customer_id', sourceCustomer.id),
      ]);
      return {
        reports: reports.count || 0,
        tasks: tasks.count || 0,
        opportunities: opps.count || 0,
        revenues: revs.count || 0,
        contacts: contacts.count || 0,
      };
    },
    enabled: open,
  });

  // Initialize field choices when target is selected
  const resolvedFields = useMemo(() => {
    if (!targetCustomer) return [];
    return MERGE_FIELDS.map(f => {
      const sv = sourceCustomer[f.key];
      const tv = targetCustomer[f.key];
      const hasConflict = !!sv && !!tv && sv !== tv;
      const defaultChoice: 'source' | 'target' = tv ? 'target' : 'source';
      return { ...f, sourceVal: sv || '', targetVal: tv || '', hasConflict, defaultChoice };
    });
  }, [sourceCustomer, targetCustomer]);

  const getChoice = (key: string, defaultChoice: 'source' | 'target') =>
    fieldChoices[key] || defaultChoice;

  const selectTarget = (id: string) => {
    setTargetId(id);
    setFieldChoices({});
    setStep('review');
  };

  const executeMerge = async () => {
    if (!targetCustomer || !user) return;
    setMerging(true);
    try {
      // 1. Build field updates for target
      const updates: Record<string, any> = {};
      for (const f of resolvedFields) {
        const choice = getChoice(f.key, f.defaultChoice);
        if (choice === 'source' && f.sourceVal) {
          updates[f.key] = f.sourceVal;
        }
      }
      // Fleet: take higher values
      for (const ff of FLEET_FIELDS) {
        const sv = sourceCustomer[ff.key] || 0;
        const tv = targetCustomer[ff.key] || 0;
        if (sv > tv) updates[ff.key] = sv;
      }
      // Update number_of_vehicles
      const newFleet = FLEET_FIELDS.reduce((sum, ff) => sum + (updates[ff.key] ?? targetCustomer[ff.key] ?? 0), 0);
      updates.number_of_vehicles = newFleet;

      // 2. Transfer linked records
      const sourceId = sourceCustomer.id;
      const tId = targetCustomer.id;

      await Promise.all([
        supabase.from('visit_reports').update({ customer_id: tId } as any).eq('customer_id', sourceId),
        supabase.from('tasks').update({ customer_id: tId } as any).eq('customer_id', sourceId),
        supabase.from('opportunities').update({ customer_id: tId } as any).eq('customer_id', sourceId),
        supabase.from('monthly_revenues').update({ customer_id: tId } as any).eq('customer_id', sourceId),
        supabase.from('contacts').update({ customer_id: tId } as any).eq('customer_id', sourceId),
        supabase.from('route_stops').update({ customer_id: tId } as any).eq('customer_id', sourceId),
      ]);

      // 3. Update target with resolved fields
      if (Object.keys(updates).length > 0) {
        await (supabase as any).from('customers').update(updates).eq('id', tId);
      }

      // 4. Archive source
      await (supabase as any).from('customers').update({
        account_status: 'merged',
        notes: `[Fusionné vers ${targetCustomer.company_name}] ${sourceCustomer.notes || ''}`.trim(),
      }).eq('id', sourceId);

      // 5. Log
      await (supabase as any).from('activity_logs').insert({
        user_id: user.id,
        entity_type: 'customer',
        entity_id: sourceId,
        action: 'merged',
        details: {
          source_id: sourceId,
          source_name: sourceCustomer.company_name,
          target_id: tId,
          target_name: targetCustomer.company_name,
          transferred: sourceCounts,
        },
      });

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer'] });
      toast.success(`Compte fusionné avec ${targetCustomer.company_name}`);
      onOpenChange(false);
      window.location.href = `/clients/${tId}`;
    } catch (err) {
      console.error('Merge error:', err);
      toast.error('Erreur lors de la fusion');
    } finally {
      setMerging(false);
    }
  };

  const reset = () => {
    setStep('search');
    setSearchQuery('');
    setTargetId(null);
    setFieldChoices({});
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-primary" />
            Fusionner un compte
          </SheetTitle>
          <SheetDescription>
            Fusionner <strong>{sourceCustomer.company_name}</strong> vers un autre compte
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          {/* STEP 1: Search for target */}
          {step === 'search' && (
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Compte source (à supprimer)</Label>
                <div className="rounded-lg border bg-destructive/5 p-3">
                  <p className="font-medium text-sm">{sourceCustomer.company_name}</p>
                  <p className="text-xs text-muted-foreground">{sourceCustomer.city} {sourceCustomer.postal_code}</p>
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">Rechercher le compte cible (à conserver)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nom de l'entreprise..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              {searching && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}

              {searchResults.length > 0 && (
                <div className="space-y-1">
                  {searchResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => selectTarget(r.id)}
                      className="w-full text-left rounded-lg border p-3 hover:bg-accent/10 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{r.company_name}</p>
                          <p className="text-xs text-muted-foreground">{r.city} {r.postal_code}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{r.customer_type}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun compte trouvé</p>
              )}
            </div>
          )}

          {/* STEP 2: Review & field resolution */}
          {step === 'review' && targetCustomer && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-destructive/5 p-3">
                  <p className="text-[10px] uppercase font-semibold text-destructive mb-1">Source (supprimé)</p>
                  <p className="font-medium text-sm">{sourceCustomer.company_name}</p>
                  <p className="text-xs text-muted-foreground">{sourceCustomer.city}</p>
                </div>
                <div className="rounded-lg border bg-accent/10 p-3">
                  <p className="text-[10px] uppercase font-semibold text-accent mb-1">Cible (conservé)</p>
                  <p className="font-medium text-sm">{targetCustomer.company_name}</p>
                  <p className="text-xs text-muted-foreground">{(targetCustomer as any).city}</p>
                </div>
              </div>

              <ArrowRight className="mx-auto h-5 w-5 text-muted-foreground" />

              {/* Data transfer summary */}
              {sourceCounts && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold mb-2">Données transférées</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-muted-foreground">Rapports de visite</span><span className="font-medium">{sourceCounts.reports}</span>
                    <span className="text-muted-foreground">Tâches</span><span className="font-medium">{sourceCounts.tasks}</span>
                    <span className="text-muted-foreground">Opportunités</span><span className="font-medium">{sourceCounts.opportunities}</span>
                    <span className="text-muted-foreground">Historique CA</span><span className="font-medium">{sourceCounts.revenues}</span>
                    <span className="text-muted-foreground">Contacts</span><span className="font-medium">{sourceCounts.contacts}</span>
                  </div>
                </div>
              )}

              {/* Fleet resolution: take max */}
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold mb-2">Flotte (valeur max conservée)</p>
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <span></span>
                  <span className="text-muted-foreground text-center">Source</span>
                  <span className="text-muted-foreground text-center">Cible</span>
                  {FLEET_FIELDS.map(ff => (
                    <div key={ff.key} className="contents">
                      <span className="text-muted-foreground">{ff.label}</span>
                      <span className="text-center">{sourceCustomer[ff.key] || 0}</span>
                      <span className="text-center">{(targetCustomer as any)[ff.key] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Field conflicts */}
              {resolvedFields.filter(f => f.hasConflict).length > 0 && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-xs font-semibold">Conflits à résoudre</p>
                  {resolvedFields.filter(f => f.hasConflict).map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      <RadioGroup
                        value={getChoice(f.key, f.defaultChoice)}
                        onValueChange={v => setFieldChoices(prev => ({ ...prev, [f.key]: v as 'source' | 'target' }))}
                        className="flex flex-col gap-1"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="target" id={`${f.key}-target`} />
                          <label htmlFor={`${f.key}-target`} className="text-xs flex-1 cursor-pointer">
                            <span className="text-accent font-medium">Cible:</span> {f.targetVal}
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="source" id={`${f.key}-source`} />
                          <label htmlFor={`${f.key}-source`} className="text-xs flex-1 cursor-pointer">
                            <span className="text-destructive font-medium">Source:</span> {f.sourceVal}
                          </label>
                        </div>
                      </RadioGroup>
                    </div>
                  ))}
                </div>
              )}

              {/* Fields auto-filled from source */}
              {resolvedFields.filter(f => !f.hasConflict && f.sourceVal && !f.targetVal).length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold mb-2">Champs complétés depuis la source</p>
                  <div className="space-y-1">
                    {resolvedFields.filter(f => !f.hasConflict && f.sourceVal && !f.targetVal).map(f => (
                      <div key={f.key} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="font-medium">{f.sourceVal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setStep('search'); setTargetId(null); }}>
                  Retour
                </Button>
                <Button className="flex-1" onClick={() => setStep('confirm')}>
                  Continuer
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Final confirmation */}
          {step === 'confirm' && targetCustomer && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border-2 border-warning/50 bg-warning/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Confirmation de fusion</p>
                    <p className="text-xs text-muted-foreground">
                      Voulez-vous fusionner <strong>{sourceCustomer.company_name}</strong> avec{' '}
                      <strong>{targetCustomer.company_name}</strong> ?
                    </p>
                    <p className="text-xs text-muted-foreground">
                      L'historique sera conservé et le compte source sera supprimé de la liste active.
                    </p>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      <li>Tous les rapports, tâches, opportunités et CA seront transférés</li>
                      <li>Les contacts seront rattachés au compte cible</li>
                      <li>Le compte source sera marqué comme fusionné</li>
                      <li>Cette action est irréversible</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('review')}>
                  Retour
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={executeMerge}
                  disabled={merging}
                >
                  {merging ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                  Fusionner
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
