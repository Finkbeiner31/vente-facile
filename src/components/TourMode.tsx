import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Phone, Navigation, Play, Square, SkipForward, X,
  MapPin, TrendingUp, AlertTriangle, FileText, UserPlus,
} from 'lucide-react';
import { TourReportSheet } from './TourReportSheet';
import { DaySummarySheet } from './DaySummarySheet';
import { LastReportCard } from './LastReportCard';
import { QuickProspectSheet } from './QuickProspectSheet';
import type { CustomerForRouting } from '@/lib/routeCycleEngine';

export interface TourStop {
  customer: CustomerForRouting;
  priority: number;
}

interface TourModeProps {
  stops: TourStop[];
  onExit: () => void;
}

type StopStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

// Demo last reports
const demoLastReports: Record<string, any> = {
  '1': { date: '25 mars 2026', contactMet: 'M. Martin', summary: 'Commande de 12 pneus passée', nextAction: 'Livraison à confirmer', notes: 'Client satisfait', outcome: 'productive' },
  '3': { date: '18 mars 2026', contactMet: 'Mme Dupont', summary: 'Présentation du nouveau catalogue', nextAction: 'Envoyer devis personnalisé', notes: 'Intéressé par les pneus hiver', outcome: 'followup' },
  '5': { date: '12 mars 2026', contactMet: 'M. Leclerc', summary: 'Discussion tarifs flotte', nextAction: 'Revoir les prix volume', notes: 'Flotte de 25 véhicules', outcome: 'productive' },
};

export function TourMode({ stops, onExit }: TourModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, StopStatus>>({});
  const [visitStartTime, setVisitStartTime] = useState<Date | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [lastReportOpen, setLastReportOpen] = useState(false);
  const [prospectOpen, setProspectOpen] = useState(false);

  const current = stops[currentIndex];
  const status = statuses[currentIndex] || 'planned';
  const completedCount = Object.values(statuses).filter(s => s === 'completed').length;
  const isVisitActive = status === 'in_progress';
  const allDone = currentIndex >= stops.length;

  const getPriorityColor = (p: number) => p >= 60 ? 'text-destructive' : p >= 30 ? 'text-accent' : 'text-muted-foreground';
  const getPriorityLabel = (p: number) => p >= 60 ? 'Haut potentiel' : p >= 30 ? 'Moyen' : 'Standard';
  const getPriorityBg = (p: number) => p >= 60 ? 'bg-destructive/10 border-destructive/30' : p >= 30 ? 'bg-accent/10 border-accent/30' : 'bg-muted/50 border-border';

  const handleStartVisit = () => {
    setStatuses(prev => ({ ...prev, [currentIndex]: 'in_progress' }));
    setVisitStartTime(new Date());
  };

  const handleEndVisit = () => setReportOpen(true);

  const handleSkip = () => {
    setStatuses(prev => ({ ...prev, [currentIndex]: 'skipped' }));
    moveToNext();
  };

  const handleReportSubmit = () => {
    setStatuses(prev => ({ ...prev, [currentIndex]: 'completed' }));
    setReportOpen(false);
    setVisitStartTime(null);
    moveToNext();
  };

  const moveToNext = useCallback(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= stops.length) setSummaryOpen(true);
    else setCurrentIndex(nextIdx);
  }, [currentIndex, stops.length]);

  const handleProspectSubmit = (data: any) => {
    setProspectOpen(false);
    // In real app: save to DB
  };

  // Show summary if all done
  if (allDone || summaryOpen) {
    const completedStops = stops.filter((_, i) => statuses[i] === 'completed');
    const skippedStops = stops.filter((_, i) => statuses[i] === 'skipped');
    const missedStops = stops.filter((_, i) => !statuses[i] || statuses[i] === 'planned');
    const potentialCovered = completedStops.reduce((sum, s) => sum + (s.customer.annual_revenue_potential || 0), 0);
    const potentialMissed = [...skippedStops, ...missedStops].reduce((sum, s) => sum + (s.customer.annual_revenue_potential || 0), 0);
    const highPotentialSkipped = skippedStops.filter(s => s.priority >= 60);

    return (
      <DaySummarySheet
        open={true}
        onClose={onExit}
        completed={completedStops.length}
        total={stops.length}
        skipped={skippedStops.length}
        missed={missedStops.length}
        potentialCovered={potentialCovered}
        potentialMissed={potentialMissed}
        highPotentialSkipped={highPotentialSkipped.map(s => s.customer.company_name)}
      />
    );
  }

  const lastReport = demoLastReports[current.customer.id] || null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onExit}>
            <X className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Mode Tournée</p>
            <p className="text-sm font-bold">{completedCount} / {stops.length} visites</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setProspectOpen(true)}>
            <UserPlus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setSummaryOpen(true)}>
            Fin
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted">
        <div className="h-full bg-primary transition-all duration-500"
          style={{ width: `${(completedCount / stops.length) * 100}%` }} />
      </div>

      {/* Skipped high-potential alert */}
      {(() => {
        const skippedHigh = stops.filter((s, i) => statuses[i] === 'skipped' && s.priority >= 60);
        if (skippedHigh.length === 0) return null;
        return (
          <div className="mx-4 mt-3 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive font-medium">
              {skippedHigh.length} client(s) haut potentiel ignoré(s)
            </p>
          </div>
        );
      })()}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-4">
        <p className="text-xs text-muted-foreground mb-2">
          Visite {currentIndex + 1} sur {stops.length}
        </p>

        <div className={`rounded-full px-4 py-1.5 border text-xs font-semibold mb-4 ${getPriorityBg(current.priority)}`}>
          <span className={getPriorityColor(current.priority)}>● {getPriorityLabel(current.priority)}</span>
        </div>

        <h1 className="font-heading text-2xl md:text-3xl font-bold text-center mb-2">
          {current.customer.company_name}
        </h1>

        <div className="flex items-center gap-1.5 text-muted-foreground mb-4">
          <MapPin className="h-4 w-4 shrink-0" />
          <p className="text-sm text-center">{current.customer.address || 'Adresse non renseignée'}</p>
        </div>

        {/* Info pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          {current.customer.annual_revenue_potential > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold text-accent">
                {(current.customer.annual_revenue_potential / 1000).toFixed(0)}k€/an
              </span>
            </div>
          )}
          {current.customer.number_of_vehicles > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {current.customer.number_of_vehicles} véhicules
              </span>
            </div>
          )}
        </div>

        {/* Last report button */}
        <Button variant="outline" size="sm" className="mb-6 text-xs h-9"
          onClick={() => setLastReportOpen(true)}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          Dernier rapport
        </Button>

        {/* Quick action buttons */}
        <div className="flex gap-3 mb-8 w-full max-w-xs">
          <a href={`tel:${current.customer.phone}`} className="flex-1">
            <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium">
              <Phone className="h-5 w-5 text-primary" />
              Appeler
            </Button>
          </a>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.customer.address || '')}`}
            target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium">
              <Navigation className="h-5 w-5 text-primary" />
              GPS
            </Button>
          </a>
        </div>
      </div>

      {/* Bottom action area */}
      <div className="px-4 pb-6 pt-2 border-t bg-card space-y-2 safe-area-bottom">
        {!isVisitActive ? (
          <div className="flex gap-2">
            <Button className="flex-1 h-14 text-base font-bold" onClick={handleStartVisit}>
              <Play className="h-5 w-5 mr-2" />
              Démarrer la visite
            </Button>
            <Button variant="outline" className="h-14 px-5 text-muted-foreground" onClick={handleSkip}>
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {visitStartTime && (
              <p className="text-xs text-center text-muted-foreground">
                Visite en cours depuis {Math.floor((Date.now() - visitStartTime.getTime()) / 60000)} min
              </p>
            )}
            <Button variant="destructive" className="w-full h-14 text-base font-bold" onClick={handleEndVisit}>
              <Square className="h-5 w-5 mr-2" />
              Terminer la visite
            </Button>
          </div>
        )}
      </div>

      {/* Sheets */}
      <TourReportSheet
        open={reportOpen}
        onOpenChange={setReportOpen}
        clientName={current.customer.company_name}
        onSubmit={handleReportSubmit}
        onAddProspect={() => { setReportOpen(false); setProspectOpen(true); }}
      />

      <LastReportCard
        open={lastReportOpen}
        onOpenChange={setLastReportOpen}
        clientName={current.customer.company_name}
        report={lastReport}
      />

      <QuickProspectSheet
        open={prospectOpen}
        onOpenChange={setProspectOpen}
        onSubmit={handleProspectSubmit}
      />
    </div>
  );
}
