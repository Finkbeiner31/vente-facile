import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Search, Plus, Mic, MicOff } from 'lucide-react';

const OUTCOMES = [
  { value: 'productive', label: 'Productif' },
  { value: 'no_contact', label: 'Absent / pas de contact' },
  { value: 'not_interested', label: 'Pas intéressé' },
  { value: 'followup', label: 'À relancer' },
];

const ACTION_TYPES = [
  { value: 'devis', label: 'Faire un devis' },
  { value: 'rappeler', label: 'Rappeler' },
  { value: 'prix', label: 'Revoir un prix' },
  { value: 'documentation', label: 'Envoyer documentation' },
  { value: 'repasser', label: 'Repasser' },
  { value: 'autre', label: 'Autre' },
];

interface NewReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function NewReportSheet({ open, onOpenChange, onSaved }: NewReportSheetProps) {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [isNewProspect, setIsNewProspect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Form fields
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [contactMet, setContactMet] = useState('');
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [taskType, setTaskType] = useState('');

  // New prospect fields
  const [prospectName, setProspectName] = useState('');
  const [prospectCity, setProspectCity] = useState('');
  const [prospectPhone, setProspectPhone] = useState('');

  useEffect(() => {
    if (open && user) {
      loadCustomers();
      resetForm();
    }
  }, [open, user]);

  const resetForm = () => {
    setSelectedCustomerId('');
    setIsNewProspect(false);
    setVisitDate(new Date().toISOString().split('T')[0]);
    setContactMet('');
    setOutcome('');
    setNotes('');
    setNextAction('');
    setNextActionDate('');
    setCreateTask(false);
    setTaskType('');
    setProspectName('');
    setProspectCity('');
    setProspectPhone('');
    setSearchQuery('');
  };

  const loadCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, company_name, city')
      .order('company_name');
    if (data) setCustomers(data);
  };

  const filteredCustomers = customers.filter(c =>
    c.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.city && c.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Dictée vocale non supportée');
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      setNotes(prev => prev ? `${prev} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
    };
    recognition.start();
  };

  const setQuickDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setNextActionDate(d.toISOString().split('T')[0]);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!isNewProspect && !selectedCustomerId) {
      toast.error('Sélectionnez un client');
      return;
    }
    if (!outcome) {
      toast.error('Sélectionnez un résultat');
      return;
    }

    setSaving(true);
    try {
      let customerId = selectedCustomerId;

      // Create prospect if needed
      if (isNewProspect) {
        if (!prospectName.trim()) {
          toast.error('Nom du prospect requis');
          setSaving(false);
          return;
        }
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({
            company_name: prospectName.trim(),
            city: prospectCity || null,
            phone: prospectPhone || null,
            customer_type: 'prospect',
            assigned_rep_id: user.id,
            last_visit_date: visitDate,
          })
          .select('id')
          .single();
        if (custErr) throw custErr;
        customerId = newCustomer.id;
      }

      // Create visit report
      const { data: report, error: repErr } = await supabase
        .from('visit_reports')
        .insert({
          customer_id: customerId,
          rep_id: user.id,
          visit_date: visitDate,
          visit_status: 'completed',
          quick_outcome: outcome,
          contact_met: contactMet || null,
          summary: notes || null,
          next_actions: nextAction || null,
          follow_up_date: nextActionDate || null,
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (repErr) throw repErr;

      // Update customer last_visit_date
      await supabase
        .from('customers')
        .update({ last_visit_date: visitDate, next_action_date: nextActionDate || null, next_action_description: nextAction || null })
        .eq('id', customerId);

      // Create task if requested
      if (createTask && taskType && nextActionDate) {
        await supabase.from('tasks').insert({
          title: ACTION_TYPES.find(a => a.value === taskType)?.label || taskType,
          description: nextAction || null,
          assigned_to: user.id,
          created_by: user.id,
          customer_id: customerId,
          visit_report_id: report.id,
          due_date: nextActionDate,
          priority: 'medium',
        });
      }

      toast.success('Rapport enregistré');
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] overflow-y-auto rounded-t-2xl p-4">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg">Nouveau rapport de visite</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Customer selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Client</Label>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setIsNewProspect(!isNewProspect)}>
                <Plus className="h-3 w-3 mr-1" />
                {isNewProspect ? 'Client existant' : 'Nouveau prospect'}
              </Button>
            </div>

            {isNewProspect ? (
              <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
                <Input placeholder="Nom de l'entreprise *" value={prospectName} onChange={e => setProspectName(e.target.value)} className="h-11" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Ville" value={prospectCity} onChange={e => setProspectCity(e.target.value)} className="h-11" />
                  <Input placeholder="Téléphone" value={prospectPhone} onChange={e => setProspectPhone(e.target.value)} className="h-11" />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Rechercher un client..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-11" />
                </div>
                {searchQuery && (
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-background">
                    {filteredCustomers.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Aucun résultat</p>
                    ) : (
                      filteredCustomers.slice(0, 8).map(c => (
                        <button key={c.id} onClick={() => { setSelectedCustomerId(c.id); setSearchQuery(c.company_name); }}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors ${selectedCustomerId === c.id ? 'bg-primary/10 font-medium' : ''}`}>
                          {c.company_name} {c.city && <span className="text-muted-foreground">— {c.city}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <Label className="text-sm font-medium">Date de visite</Label>
            <Input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="mt-1 h-11" />
          </div>

          {/* Contact */}
          <div>
            <Label className="text-sm font-medium">Contact rencontré</Label>
            <Input placeholder="Nom du contact" value={contactMet} onChange={e => setContactMet(e.target.value)} className="mt-1 h-11" />
          </div>

          {/* Outcome */}
          <div>
            <Label className="text-sm font-medium">Résultat *</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {OUTCOMES.map(o => (
                <button key={o.value} onClick={() => setOutcome(o.value)}
                  className={`rounded-xl border p-3 text-sm font-medium transition-all ${
                    outcome === o.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-muted-foreground/40'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Notes</Label>
              <Button variant="ghost" size="sm" onClick={handleVoice} className={`h-7 text-xs ${isListening ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`}>
                {isListening ? <MicOff className="h-3.5 w-3.5 mr-1" /> : <Mic className="h-3.5 w-3.5 mr-1" />}
                {isListening ? 'Stop' : 'Dicter'}
              </Button>
            </div>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes rapides..." rows={2} className="mt-1" />
          </div>

          {/* Next action */}
          <div>
            <Label className="text-sm font-medium">Prochaine action</Label>
            <Input placeholder="Ex: Envoyer devis, Rappeler..." value={nextAction} onChange={e => setNextAction(e.target.value)} className="mt-1 h-11" />
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => setQuickDate(1)}>Demain</Button>
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => setQuickDate(7)}>1 sem.</Button>
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => setQuickDate(14)}>2 sem.</Button>
            </div>
            <Input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} className="mt-2 h-11" />
          </div>

          {/* Create task toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label className="text-sm font-medium">Créer un rappel</Label>
            <Switch checked={createTask} onCheckedChange={setCreateTask} />
          </div>
          {createTask && (
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Type d'action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map(a => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Save */}
          <Button onClick={handleSave} disabled={saving || !outcome} className="w-full h-12 text-base font-semibold">
            {saving ? 'Enregistrement...' : 'Enregistrer le rapport'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
