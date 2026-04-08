import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Bell, Save } from 'lucide-react';

const ACTION_TYPES = [
  { value: 'devis', label: 'Faire un devis' },
  { value: 'rappeler', label: 'Rappeler' },
  { value: 'prix', label: 'Revoir un prix' },
  { value: 'documentation', label: 'Envoyer doc.' },
  { value: 'repasser', label: 'Repasser' },
  { value: 'autre', label: 'Autre' },
];

const PRIORITIES = [
  { value: 'high', label: 'Haute', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  { value: 'medium', label: 'Moyenne', color: 'bg-warning/10 text-warning border-warning/30' },
  { value: 'low', label: 'Basse', color: 'bg-muted text-muted-foreground border-border' },
];

interface QuickReminderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  onSubmit: (data: { actionType: string; dueDate: string; priority: string; comment: string }) => void;
}

export function QuickReminderSheet({ open, onOpenChange, clientName, onSubmit }: QuickReminderSheetProps) {
  const [actionType, setActionType] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [comment, setComment] = useState('');

  const setQuickDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDueDate(d.toISOString().split('T')[0]);
  };

  const handleSubmit = () => {
    onSubmit({ actionType, dueDate, priority, comment });
    setActionType('');
    setDueDate('');
    setPriority('medium');
    setComment('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl px-5 pb-8 overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <Bell className="h-5 w-5 text-warning" />
            Créer un rappel
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">Lié à : {clientName}</p>
        </SheetHeader>

        <div className="space-y-4">
          {/* Action type */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Type d'action</p>
            <div className="flex flex-wrap gap-1.5">
              {ACTION_TYPES.map(a => (
                <button key={a.value}
                  onClick={() => setActionType(a.value)}
                  className={`rounded-xl px-3.5 py-2.5 text-sm font-medium border transition-all ${
                    actionType === a.value
                      ? 'bg-primary/10 border-primary/30 text-primary border-2'
                      : 'border-border text-muted-foreground'
                  }`}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Échéance</p>
            <div className="flex gap-1.5 mb-1.5">
              {[
                { label: 'Demain', d: 1 },
                { label: '1 sem', d: 7 },
                { label: '2 sem', d: 14 },
              ].map(q => (
                <Button key={q.d} variant="outline" size="sm" className="flex-1 h-10 text-xs"
                  onClick={() => setQuickDate(q.d)}>
                  {q.label}
                </Button>
              ))}
            </div>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-10" />
          </div>

          {/* Priority */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Priorité</p>
            <div className="flex gap-2">
              {PRIORITIES.map(p => (
                <button key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                    priority === p.value ? p.color + ' border-2' : 'border-border text-muted-foreground'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Commentaire (optionnel)</p>
            <Textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Détail rapide..." rows={2} />
          </div>

          <Button onClick={handleSubmit} disabled={!actionType}
            className="w-full h-14 text-base font-bold">
            <Save className="h-5 w-5 mr-2" />
            Enregistrer le rappel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
