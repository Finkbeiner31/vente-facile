import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Phone, Navigation, Play, Square, SkipForward, X,
  MapPin, TrendingUp, AlertTriangle, FileText, UserPlus,
  Bell, ArrowUpDown, List, Plus,
} from 'lucide-react';
import { TourReportSheet } from './TourReportSheet';
import { DaySummarySheet } from './DaySummarySheet';
import { LastReportCard } from './LastReportCard';
import { QuickProspectSheet } from './QuickProspectSheet';
import { QuickReminderSheet } from './QuickReminderSheet';
import { SortableRouteList } from './SortableRouteList';
import { DayListDrawer } from './DayListDrawer';
import { AddUnplannedVisitSheet } from './AddUnplannedVisitSheet';
import { formatMonthly, formatAnnual, getRevenueTier, getRevenueTierColor, getRevenueTierBg } from '@/lib/revenueUtils';
import type { CustomerForRouting } from '@/lib/routeCycleEngine';

export interface TourStop {
  customer: CustomerForRouting;
  priority: number;
}

interface TourModeProps {
  stops: TourStop[];
  onExit: () => void;
  onReorder?: (stops: TourStop[]) => void;
  allCustomers?: CustomerForRouting[];
}

type StopStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

const demoLastReports: Record<string, any> = {
  '1': { date: '25 mars 2026', contactMet: 'M. Martin', summary: 'Commande de 12 pneus passée', nextAction: 'Livraison à confirmer', notes: 'Client satisfait', outcome: 'productive' },
  '3': { date: '18 mars 2026', contactMet: 'Mme Dupont', summary: 'Présentation du nouveau catalogue', nextAction: 'Envoyer devis personnalisé', notes: 'Intéressé par les pneus hiver', outcome: 'followup' },
  '5': { date: '12 mars 2026', contactMet: 'M. Leclerc', summary: 'Discussion tarifs flotte', nextAction: 'Revoir les prix volume', notes: 'Flotte de 25 véhicules', outcome: 'productive' },
};

export function TourMode({ stops: initialStops, onExit, onReorder, allCustomers = [] }: TourModeProps) {
  const [stops, setStops] = useState(initialStops);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, StopStatus>>({});
  const [visitStartTime, setVisitStartTime] = useState<Date | null>(null);

  // Sheet states
  const [reportOpen, setReportOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [lastReportOpen, setLastReportOpen] = useState(false);
  const [prospectOpen, setProspectOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [dayListOpen, setDayListOpen] = useState(false);
  const [addUnplannedOpen, setAddUnplannedOpen] = useState(false);

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

  const handleGoToStop = (index: number) => {
    if (index >= 0 && index < stops.length) {
      setCurrentIndex(index);
      setVisitStartTime(null);
    }
  };

  const handleStopsReorder = (newStops: TourStop[]) => {
    setStops(newStops);
    onReorder?.(newStops);
  };

  // Filter out customers already in today's route
  const stopIds = new Set(stops.map(s => s.customer.id));
  const availableCustomers = allCustomers.filter(c => !stopIds.has(c.id));

  const insertStop = (stop: TourStop, position: 'next' | 'end' | 'manual') => {
    const newStops = [...stops];
    const insertAt = position === 'next' ? currentIndex + 1 : newStops.length;
    newStops.splice(insertAt, 0, stop);
    setStops(newStops);
    onReorder?.(newStops);
  };

  const handleAddProspect = (data: any, position: 'next' | 'end' | 'manual') => {
    const prospectCustomer: CustomerForRouting = {
      id: `prospect-${Date.now()}`,
      company_name: data.company_name,
      address: data.address || null,
      city: data.city,
      phone: data.contact_name ? data.phone : null,
      visit_frequency: null,
      number_of_vehicles: data.number_of_vehicles || 0,
      annual_revenue_potential: (data.number_of_vehicles || 0) * 3500,
      latitude: null,
      longitude: null,
      sales_potential: null,
    };
    insertStop({ customer: prospectCustomer, priority: 30 }, position);
  };

  const handleAddExistingCustomer = (customer: CustomerForRouting, position: 'next' | 'end' | 'manual') => {
    const priority = customer.annual_revenue_potential >= 50000 ? 60 : customer.annual_revenue_potential >= 20000 ? 30 : 10;
    insertStop({ customer, priority }, position);
  };

  if (allDone || summaryOpen) {
    const completedStops = stops.filter((_, i) => statuses[i] === 'completed');
    const skippedStops = stops.filter((_, i) => statuses[i] === 'skipped');
    const missedStops = stops.filter((_, i) => !statuses[i] || statuses[i] === 'planned');
    const potentialCovered = completedStops.reduce((sum, s) => sum + (s.customer.annual_revenue_potential || 0), 0);
    const potentialMissed = [...skippedStops, ...missedStops].reduce((sum, s) => sum + (s.customer.annual_revenue_potential || 0), 0);
    const highPotentialSkipped = skippedStops.filter(s => s.priority >= 60);

    return (
      <DaySummarySheet
        open={true} onClose={onExit}
        completed={completedStops.length} total={stops.length}
        skipped={skippedStops.length} missed={missedStops.length}
        potentialCovered={potentialCovered} potentialMissed={potentialMissed}
        highPotentialSkipped={highPotentialSkipped.map(s => s.customer.company_name)}
      />
    );
  }

  const lastReport = demoLastReports[current.customer.id] || null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onExit}>
            <X className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground leading-tight">Mode Tournée</p>
            <p className="text-sm font-bold leading-tight">{completedCount} / {stops.length} visites</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setDayListOpen(true)}>
            <List className="h-3.5 w-3.5" />
            Jour
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setReorderOpen(true)}>
            <ArrowUpDown className="h-3.5 w-3.5" />
            Ordre
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSummaryOpen(true)}>
            Fin
          </Button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="h-1 bg-muted shrink-0">
        <div className="h-full bg-primary transition-all duration-500"
          style={{ width: `${(completedCount / stops.length) * 100}%` }} />
      </div>

      {/* ── Skipped high-potential alert ── */}
      {(() => {
        const skippedHigh = stops.filter((s, i) => statuses[i] === 'skipped' && s.priority >= 60);
        if (skippedHigh.length === 0) return null;
        return (
          <div className="mx-4 mt-2 rounded-lg bg-destructive/10 border border-destructive/20 p-2 flex items-center gap-2 shrink-0">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive font-medium">
              {skippedHigh.length} client(s) haut potentiel ignoré(s)
            </p>
          </div>
        );
      })()}

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-5 py-4 min-h-0">
        <p className="text-[11px] text-muted-foreground mb-1.5">
          Visite {currentIndex + 1} sur {stops.length}
        </p>

        <div className={`rounded-full px-3.5 py-1 border text-xs font-semibold mb-3 ${getPriorityBg(current.priority)}`}>
          <span className={getPriorityColor(current.priority)}>● {getPriorityLabel(current.priority)}</span>
        </div>

        <h1 className="font-heading text-2xl md:text-3xl font-bold text-center mb-1.5 leading-tight">
          {current.customer.company_name}
        </h1>

        <div className="flex items-center gap-1.5 text-muted-foreground mb-3">
          <MapPin className="h-4 w-4 shrink-0" />
          <p className="text-sm text-center leading-tight">{current.customer.address || 'Adresse non renseignée'}</p>
        </div>

        {/* Info pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-5">
          {current.customer.annual_revenue_potential > 0 && (() => {
            const tier = getRevenueTier(current.customer.annual_revenue_potential);
            return (
              <div className={`flex items-center gap-1.5 rounded-full ${getRevenueTierBg(tier)} px-3 py-1.5`}>
                <TrendingUp className={`h-3.5 w-3.5 ${getRevenueTierColor(tier)}`} />
                <span className={`text-xs font-bold ${getRevenueTierColor(tier)}`}>
                  {formatMonthly(current.customer.annual_revenue_potential)}
                </span>
                <span className="text-[10px] text-muted-foreground ml-1">
                  ({formatAnnual(current.customer.annual_revenue_potential)})
                </span>
              </div>
            );
          })()}
          {current.customer.number_of_vehicles > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {current.customer.number_of_vehicles} véhicules
              </span>
            </div>
          )}
        </div>

        {/* Call + GPS row */}
        <div className="flex gap-3 w-full max-w-xs mb-2">
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

      {/* ── Visit state action (Start / End) ── */}
      <div className="px-4 pt-2 bg-card border-t shrink-0">
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
          <div>
            {visitStartTime && (
              <p className="text-[11px] text-center text-muted-foreground mb-1.5">
                En cours depuis {Math.floor((Date.now() - visitStartTime.getTime()) / 60000)} min
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky bottom action bar ── */}
      <div className="shrink-0 bg-card border-t px-4 sm:px-6" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)' }}>
        <div className="flex justify-around items-start gap-2 py-2.5 max-w-md mx-auto">
        {[
            { icon: FileText, label: 'Dernier\nrapport', color: 'text-primary', bg: 'bg-primary/10', onClick: () => setLastReportOpen(true) },
            ...(!isVisitActive ? [{ icon: Plus, label: 'Visite\nimprévue', color: 'text-accent', bg: 'bg-accent/10', onClick: () => setAddUnplannedOpen(true) }] : []),
            { icon: Bell, label: 'Rappel', color: 'text-warning', bg: 'bg-warning/10', onClick: () => setReminderOpen(true) },
            {
              icon: isVisitActive ? Square : Play,
              label: isVisitActive ? 'Terminer\nvisite' : 'Démarrer\nvisite',
              color: isVisitActive ? 'text-destructive' : 'text-success',
              bg: isVisitActive ? 'bg-destructive/10' : 'bg-success/10',
              onClick: isVisitActive ? handleEndVisit : handleStartVisit,
            },
          ].map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className="flex flex-col items-center gap-1.5 rounded-xl py-2 px-2 min-w-[60px] max-w-[72px] flex-1 active:bg-muted/80 transition-colors"
            >
              <div className={`h-11 w-11 rounded-full ${item.bg} flex items-center justify-center shrink-0`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <span className={`text-[10px] font-semibold leading-tight text-center whitespace-pre-line ${
                item.color.includes('destructive') || item.color.includes('success') ? item.color : 'text-muted-foreground'
              }`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Reorder overlay ── */}
      {reorderOpen && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card shrink-0">
            <h2 className="text-sm font-bold">Modifier l'ordre des visites</h2>
            <Button variant="default" size="sm" className="h-8 text-xs font-semibold" onClick={() => setReorderOpen(false)}>
              Terminé
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <SortableRouteList
              stops={stops.map((s) => ({ customer: s.customer, priority: s.priority, dayIndex: 0 }))}
              onReorder={(newStops) => {
                const reordered = newStops.map(s => ({ customer: s.customer, priority: s.priority }));
                handleStopsReorder(reordered);
              }}
              compact
            />
          </div>
        </div>
      )}

      {/* ── Day list drawer ── */}
      <DayListDrawer
        open={dayListOpen}
        onOpenChange={setDayListOpen}
        stops={stops}
        statuses={statuses}
        currentIndex={currentIndex}
        onGoToStop={handleGoToStop}
        onReorder={handleStopsReorder}
        onAddUnplanned={() => setAddUnplannedOpen(true)}
      />

      {/* ── Add unplanned visit ── */}
      <AddUnplannedVisitSheet
        open={addUnplannedOpen}
        onOpenChange={setAddUnplannedOpen}
        existingCustomers={availableCustomers}
        currentIndex={currentIndex}
        totalStops={stops.length}
        onAddProspect={handleAddProspect}
        onAddExistingCustomer={handleAddExistingCustomer}
      />

      {/* ── Sheets ── */}
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
        onSubmit={() => setProspectOpen(false)}
      />

      <QuickReminderSheet
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        clientName={current.customer.company_name}
        onSubmit={() => setReminderOpen(false)}
      />
    </div>
  );
}
