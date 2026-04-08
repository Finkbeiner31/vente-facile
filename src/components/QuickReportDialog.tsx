import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, Clock, Repeat, Mic, MicOff } from 'lucide-react';

const OUTCOMES = [
  { value: 'positive', label: 'Positif', icon: CheckCircle, color: 'bg-success/10 text-success border-success/30' },
  { value: 'neutral', label: 'Neutre', icon: Clock, color: 'bg-warning/10 text-warning border-warning/30' },
  { value: 'negative', label: 'Négatif', icon: XCircle, color: 'bg-destructive/10 text-destructive border-destructive/30' },
  { value: 'followup', label: 'À relancer', icon: Repeat, color: 'bg-primary/10 text-primary border-primary/30' },
];

interface QuickReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName?: string;
  onSubmit?: (data: { outcome: string; notes: string; nextActionDate: string }) => void;
}

export function QuickReportDialog({ open, onOpenChange, clientName, onSubmit }: QuickReportDialogProps) {
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setNotes(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.start();
  };

  const handleSubmit = () => {
    onSubmit?.({ outcome, notes, nextActionDate });
    setOutcome('');
    setNotes('');
    setNextActionDate('');
    onOpenChange(false);
  };

  // Quick date shortcuts
  const setQuickDate = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setNextActionDate(d.toISOString().split('T')[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            Rapport rapide{clientName ? ` — ${clientName}` : ''}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Complétez en moins de 30 secondes</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Outcome - big buttons */}
          <div>
            <p className="text-sm font-medium mb-2">Résultat de la visite</p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map(o => {
                const Icon = o.icon;
                return (
                  <button key={o.value} onClick={() => setOutcome(o.value)}
                    className={`flex items-center gap-2 rounded-xl border p-3.5 text-sm font-semibold transition-all ${
                      outcome === o.value ? o.color + ' border-2 scale-[1.02]' : 'border-border hover:border-muted-foreground/30'
                    }`}>
                    <Icon className="h-5 w-5" />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next action date - quick picks */}
          <div>
            <p className="text-sm font-medium mb-2">Prochaine action</p>
            <div className="flex gap-2 mb-2">
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => setQuickDate(1)}>Demain</Button>
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => setQuickDate(7)}>1 sem.</Button>
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => setQuickDate(14)}>2 sem.</Button>
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => setQuickDate(21)}>3 sem.</Button>
            </div>
            <Input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} className="h-10" />
          </div>

          {/* Notes with voice */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Notes (optionnel)</p>
              <Button variant="ghost" size="sm" onClick={handleVoiceInput}
                className={isListening ? 'text-destructive animate-pulse' : 'text-muted-foreground'}>
                {isListening ? <MicOff className="h-4 w-4 mr-1" /> : <Mic className="h-4 w-4 mr-1" />}
                {isListening ? 'Stop' : 'Dicter'}
              </Button>
            </div>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notes rapides..." rows={2} />
          </div>

          <Button onClick={handleSubmit} disabled={!outcome}
            className="w-full h-12 text-base font-semibold">
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
