import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { CheckCircle, XCircle, Clock, Repeat, Mic, MicOff, ArrowRight } from 'lucide-react';

const OUTCOMES = [
  { value: 'productive', label: 'Productif', icon: CheckCircle, color: 'bg-success/10 text-success border-success/30' },
  { value: 'no_contact', label: 'Absent', icon: XCircle, color: 'bg-muted text-muted-foreground border-border' },
  { value: 'not_interested', label: 'Pas intéressé', icon: Clock, color: 'bg-destructive/10 text-destructive border-destructive/30' },
  { value: 'followup', label: 'À relancer', icon: Repeat, color: 'bg-primary/10 text-primary border-primary/30' },
];

interface TourReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  onSubmit: (data: { outcome: string; notes: string; nextActionDate: string }) => void;
}

export function TourReportSheet({ open, onOpenChange, clientName, onSubmit }: TourReportSheetProps) {
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onresult = (e: any) => {
      setNotes(prev => prev ? `${prev} ${e.results[0][0].transcript}` : e.results[0][0].transcript);
    };
    rec.start();
  };

  const setQuickDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setNextActionDate(d.toISOString().split('T')[0]);
  };

  const handleSubmit = () => {
    onSubmit({ outcome, notes, nextActionDate });
    setOutcome('');
    setNotes('');
    setNextActionDate('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl px-5 pb-8">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left">
            {clientName}
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">Rapport rapide — moins de 30s</p>
        </SheetHeader>

        <div className="space-y-4">
          {/* Outcome */}
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map(o => {
              const Icon = o.icon;
              return (
                <button key={o.value} onClick={() => setOutcome(o.value)}
                  className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-sm font-semibold transition-all ${
                    outcome === o.value ? o.color + ' border-2 scale-[1.02]' : 'border-border'
                  }`}>
                  <Icon className="h-5 w-5 shrink-0" />
                  {o.label}
                </button>
              );
            })}
          </div>

          {/* Next action date */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Prochaine action</p>
            <div className="flex gap-1.5 mb-1.5">
              {[
                { label: 'Demain', d: 1 },
                { label: '1 sem', d: 7 },
                { label: '2 sem', d: 14 },
                { label: '3 sem', d: 21 },
              ].map(q => (
                <Button key={q.d} variant="outline" size="sm"
                  className={`flex-1 h-9 text-xs ${nextActionDate === (() => { const x = new Date(); x.setDate(x.getDate() + q.d); return x.toISOString().split('T')[0]; })() ? 'bg-primary/10 border-primary/30' : ''}`}
                  onClick={() => setQuickDate(q.d)}>
                  {q.label}
                </Button>
              ))}
            </div>
            <Input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} className="h-10" />
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-muted-foreground">Notes (optionnel)</p>
              <Button variant="ghost" size="sm" className={`h-7 text-xs ${isListening ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`}
                onClick={handleVoice}>
                {isListening ? <MicOff className="h-3.5 w-3.5 mr-1" /> : <Mic className="h-3.5 w-3.5 mr-1" />}
                {isListening ? 'Stop' : 'Dicter'}
              </Button>
            </div>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes rapides..." rows={2} />
          </div>

          {/* Submit */}
          <Button onClick={handleSubmit} disabled={!outcome}
            className="w-full h-14 text-base font-bold">
            Enregistrer & Suivant
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
