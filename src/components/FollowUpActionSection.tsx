import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';

const ACTION_TYPES = [
  { value: 'devis', label: 'Faire un devis' },
  { value: 'rappeler', label: 'Rappeler' },
  { value: 'prix', label: 'Revoir un prix' },
  { value: 'documentation', label: 'Envoyer documentation' },
  { value: 'repasser', label: 'Repasser' },
  { value: 'autre', label: 'Autre' },
];

const PRIORITIES = [
  { value: 'high', label: 'Haute', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  { value: 'medium', label: 'Moyenne', color: 'bg-warning/10 text-warning border-warning/30' },
  { value: 'low', label: 'Basse', color: 'bg-muted text-muted-foreground border-border' },
];

export interface FollowUpAction {
  actionType: string;
  dueDate: string;
  priority: string;
  comment: string;
}

interface FollowUpActionSectionProps {
  onActionChange: (action: FollowUpAction | null) => void;
}

export function FollowUpActionSection({ onActionChange }: FollowUpActionSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionType, setActionType] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [comment, setComment] = useState('');

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (!next) onActionChange(null);
  };

  const updateParent = (type: string, date: string, prio: string, com: string) => {
    if (type) {
      onActionChange({ actionType: type, dueDate: date, priority: prio, comment: com });
    }
  };

  const setQuickDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const val = d.toISOString().split('T')[0];
    setDueDate(val);
    updateParent(actionType, val, priority, comment);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5">
      <button onClick={toggleExpanded}
        className="w-full flex items-center justify-between p-3 text-left">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Action à effectuer</span>
          {actionType && <Badge variant="secondary" className="text-[10px]">1</Badge>}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Action type buttons */}
          <div className="flex flex-wrap gap-1.5">
            {ACTION_TYPES.map(a => (
              <button key={a.value}
                onClick={() => { setActionType(a.value); updateParent(a.value, dueDate, priority, comment); }}
                className={`rounded-lg px-3 py-2 text-xs font-medium border transition-all ${
                  actionType === a.value
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border text-muted-foreground'
                }`}>
                {a.label}
              </button>
            ))}
          </div>

          {/* Due date */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Échéance</p>
            <div className="flex gap-1.5 mb-1.5">
              {[
                { label: 'Demain', d: 1 },
                { label: '1 sem', d: 7 },
                { label: '2 sem', d: 14 },
              ].map(q => (
                <Button key={q.d} variant="outline" size="sm" className="flex-1 h-9 text-xs"
                  onClick={() => setQuickDate(q.d)}>
                  {q.label}
                </Button>
              ))}
            </div>
            <Input type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); updateParent(actionType, e.target.value, priority, comment); }}
              className="h-10" />
          </div>

          {/* Priority */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Priorité</p>
            <div className="flex gap-1.5">
              {PRIORITIES.map(p => (
                <button key={p.value}
                  onClick={() => { setPriority(p.value); updateParent(actionType, dueDate, p.value, comment); }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                    priority === p.value ? p.color + ' border-2' : 'border-border text-muted-foreground'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Commentaire</p>
            <Textarea value={comment} onChange={e => { setComment(e.target.value); updateParent(actionType, dueDate, priority, e.target.value); }}
              placeholder="Détail rapide..." rows={2} />
          </div>
        </div>
      )}
    </div>
  );
}
