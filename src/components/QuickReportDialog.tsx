import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Repeat, Mic, MicOff } from 'lucide-react';

const VISIT_PURPOSES = [
  'Présentation produits',
  'Suivi commande',
  'Négociation',
  'Prospection',
  'Réclamation',
  'Livraison',
  'Autre',
];

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
  onSubmit?: (data: { purpose: string; outcome: string; notes: string }) => void;
}

export function QuickReportDialog({ open, onOpenChange, clientName, onSubmit }: QuickReportDialogProps) {
  const [purpose, setPurpose] = useState('');
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return;
    }
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
    onSubmit?.({ purpose, outcome, notes });
    setPurpose('');
    setOutcome('');
    setNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            Rapport rapide{clientName ? ` — ${clientName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Purpose */}
          <div>
            <p className="text-sm font-medium mb-2">Objet de la visite</p>
            <div className="flex flex-wrap gap-2">
              {VISIT_PURPOSES.map(p => (
                <Button
                  key={p}
                  variant={purpose === p ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => setPurpose(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>

          {/* Outcome */}
          <div>
            <p className="text-sm font-medium mb-2">Résultat</p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map(o => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.value}
                    onClick={() => setOutcome(o.value)}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all ${
                      outcome === o.value ? o.color + ' border-2' : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes with voice */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Notes (optionnel)</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleVoiceInput}
                className={isListening ? 'text-destructive animate-pulse' : 'text-muted-foreground'}
              >
                {isListening ? <MicOff className="h-4 w-4 mr-1" /> : <Mic className="h-4 w-4 mr-1" />}
                {isListening ? 'Arrêter' : 'Dicter'}
              </Button>
            </div>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ajouter des notes..."
              rows={3}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!purpose || !outcome}
            className="w-full h-12 text-base font-semibold"
          >
            Enregistrer le rapport
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
