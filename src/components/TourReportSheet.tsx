import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { CheckCircle, XCircle, Clock, Repeat, Mic, MicOff, ArrowRight, UserPlus, Tag } from 'lucide-react';
import { FollowUpActionSection, type FollowUpAction } from './FollowUpActionSection';
import { PromotionPickerSheet } from './PromotionPickerSheet';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { Promotion } from '@/pages/PromotionsPage';

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
  onSubmit: (data: {
    outcome: string;
    notes: string;
    nextActionDate: string;
    followUpAction: FollowUpAction | null;
    promotionPresented: boolean;
    promotionId: string | null;
  }) => Promise<void> | void;
  onAddProspect?: () => void;
}

export function TourReportSheet({ open, onOpenChange, clientName, onSubmit, onAddProspect }: TourReportSheetProps) {
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [followUpAction, setFollowUpAction] = useState<FollowUpAction | null>(null);
  const [promotionPresented, setPromotionPresented] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);
  const [promoComment, setPromoComment] = useState('');

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
    onSubmit({ outcome, notes, nextActionDate, followUpAction });
    setOutcome('');
    setNotes('');
    setNextActionDate('');
    setFollowUpAction(null);
    setPromotionPresented(false);
    setSelectedPromotion(null);
    setPromoComment('');
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-2xl px-5 pb-8 overflow-y-auto">
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

          {/* Promotion */}
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Tag className="h-4 w-4 text-chart-4" />
                Promotion présentée
              </Label>
              <Switch checked={promotionPresented} onCheckedChange={(checked) => {
                setPromotionPresented(checked);
                if (!checked) { setSelectedPromotion(null); setPromoComment(''); }
              }} />
            </div>
            {promotionPresented && (
              <div className="space-y-2 pl-1">
                {selectedPromotion ? (
                  <div className="flex items-center gap-2 rounded-lg bg-chart-4/10 border border-chart-4/20 p-2.5">
                    <Tag className="h-4 w-4 text-chart-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{selectedPromotion.title}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPromoPickerOpen(true)}>Changer</Button>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full h-10 text-xs gap-2" onClick={() => setPromoPickerOpen(true)}>
                    <Tag className="h-4 w-4" /> Choisir une promotion
                  </Button>
                )}
                <Input placeholder="Commentaire (optionnel)" value={promoComment} onChange={e => setPromoComment(e.target.value)} className="h-10" />
              </div>
            )}
          </div>

          {/* Follow-up action */}
          <FollowUpActionSection onActionChange={setFollowUpAction} />

          {/* Add prospect button */}
          {onAddProspect && (
            <button
              onClick={onAddProspect}
              className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-primary/30 p-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors">
              <UserPlus className="h-4 w-4" />
              Ajouter un prospect rencontré
            </button>
          )}

          {/* Submit */}
          <Button onClick={handleSubmit} disabled={!outcome}
            className="w-full h-14 text-base font-bold">
            Enregistrer & Suivant
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    <PromotionPickerSheet
      open={promoPickerOpen}
      onOpenChange={setPromoPickerOpen}
      mode="select"
      onSelect={(promo) => setSelectedPromotion(promo)}
    />
    </>
  );
}
