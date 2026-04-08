import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { CalendarClock, Save } from 'lucide-react';

const REMINDER_MODES = [
  { value: 'notification', label: 'Notification app' },
  { value: 'simple', label: 'Rappel simple' },
  { value: 'agenda', label: 'RDV agenda' },
  { value: 'autre', label: 'Autre' },
];

interface PostponeTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  onSubmit: (data: {
    newDueDate: string;
    newDueTime: string;
    reason: string;
    reminderMode: string;
    reminderDate: string;
    reminderTime: string;
    reminderNote: string;
  }) => void;
}

export function PostponeTaskSheet({ open, onOpenChange, taskTitle, onSubmit }: PostponeTaskSheetProps) {
  const [newDueDate, setNewDueDate] = useState('');
  const [newDueTime, setNewDueTime] = useState('');
  const [reason, setReason] = useState('');
  const [reminderMode, setReminderMode] = useState('notification');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [reminderNote, setReminderNote] = useState('');

  const setQuickDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setNewDueDate(d.toISOString().split('T')[0]);
  };

  const handleSubmit = () => {
    onSubmit({ newDueDate, newDueTime, reason, reminderMode, reminderDate, reminderTime, reminderNote });
    setNewDueDate('');
    setNewDueTime('');
    setReason('');
    setReminderMode('notification');
    setReminderDate('');
    setReminderTime('');
    setReminderNote('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-2xl px-5 pb-8 overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-warning" />
            Reporter la tâche
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left truncate">{taskTitle}</p>
        </SheetHeader>

        <div className="space-y-4">
          {/* New due date */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Nouvelle échéance</p>
            <div className="flex gap-1.5 mb-1.5">
              {[
                { label: 'Demain', d: 1 },
                { label: '+3j', d: 3 },
                { label: '+1 sem', d: 7 },
              ].map(q => (
                <Button key={q.d} variant="outline" size="sm" className="flex-1 h-10 text-xs"
                  onClick={() => setQuickDate(q.d)}>
                  {q.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="h-10 flex-1" />
              <Input type="time" value={newDueTime} onChange={e => setNewDueTime(e.target.value)} className="h-10 w-28" />
            </div>
          </div>

          {/* Reason */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Raison (optionnel)</p>
            <Textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Pourquoi reporter..." rows={2} />
          </div>

          {/* Reminder mode */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Mode de rappel</p>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_MODES.map(m => (
                <button key={m.value}
                  onClick={() => setReminderMode(m.value)}
                  className={`rounded-xl px-3 py-2 text-xs font-medium border transition-all ${
                    reminderMode === m.value
                      ? 'bg-primary/10 border-primary/30 text-primary border-2'
                      : 'border-border text-muted-foreground'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reminder date/time */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Date & heure du rappel</p>
            <div className="flex gap-2">
              <Input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className="h-10 flex-1" />
              <Input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} className="h-10 w-28" />
            </div>
          </div>

          {/* Reminder note */}
          {(reminderMode === 'agenda' || reminderMode === 'autre') && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Note rappel</p>
              <Input value={reminderNote} onChange={e => setReminderNote(e.target.value)}
                placeholder="Détail du rappel..." className="h-10" />
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!newDueDate}
            className="w-full h-14 text-base font-bold">
            <Save className="h-5 w-5 mr-2" />
            Confirmer le report
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
