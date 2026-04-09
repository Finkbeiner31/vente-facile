import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import { TourMode } from '@/components/TourMode';
import { SortableRouteList } from '@/components/SortableRouteList';
import {
  MapPin, Play, Square, Phone, Navigation, Sparkles,
  GripVertical, ChevronLeft, ChevronRight, Calendar, Target,
  Sun, Flag, ArrowUpDown, RotateCcw,
} from 'lucide-react';
import RouteOptimizerSheet from '@/components/RouteOptimizerSheet';
import {
  generateRouteCycle,
  getDayLabel,
  VISIT_FREQUENCY_OPTIONS,
  type CustomerForRouting,
  type PlannedVisit,
} from '@/lib/routeCycleEngine';
import { useTourSession } from '@/contexts/TourSessionContext';

const demoCustomers: CustomerForRouting[] = [
  { id: '1', company_name: 'Boulangerie Martin', address: '12 Rue de la Paix, Paris', city: 'Paris', phone: '01 42 33 44 55', visit_frequency: 'weekly', number_of_vehicles: 8, annual_revenue_potential: 28000, latitude: null, longitude: null, sales_potential: 'A' },
  { id: '2', company_name: 'Café du Commerce', address: '45 Av. des Champs, Lyon', city: 'Lyon', phone: '04 72 11 22 33', visit_frequency: 'weekly', number_of_vehicles: 5, annual_revenue_potential: 17500, latitude: null, longitude: null, sales_potential: 'B' },
  { id: '3', company_name: 'Restaurant Le Gourmet', address: '8 Pl. Bellecour, Lyon', city: 'Lyon', phone: '04 78 99 88 77', visit_frequency: 'biweekly', number_of_vehicles: 12, annual_revenue_potential: 42000, latitude: null, longitude: null, sales_potential: 'A' },
  { id: '4', company_name: 'Pharmacie du Centre', address: '22 Rue Nationale, Toulouse', city: 'Toulouse', phone: '05 61 77 88 99', visit_frequency: 'biweekly', number_of_vehicles: 3, annual_revenue_potential: 10500, latitude: null, longitude: null, sales_potential: 'B' },
  { id: '5', company_name: 'Garage Auto Plus', address: '8 Bd de la Prairie, Nantes', city: 'Nantes', phone: '02 40 11 22 33', visit_frequency: 'multiple_per_week', number_of_vehicles: 25, annual_revenue_potential: 87500, latitude: null, longitude: null, sales_potential: 'A' },
  { id: '6', company_name: 'Librairie Centrale', address: '15 Rue St-Ferréol, Marseille', city: 'Marseille', phone: '04 91 55 66 77', visit_frequency: 'monthly', number_of_vehicles: 2, annual_revenue_potential: 7000, latitude: null, longitude: null, sales_potential: 'C' },
  { id: '7', company_name: 'Fleuriste Rose & Lys', address: '3 Rue des Fleurs, Lyon', city: 'Lyon', phone: '04 78 11 22 33', visit_frequency: 'weekly', number_of_vehicles: 4, annual_revenue_potential: 14000, latitude: null, longitude: null, sales_potential: 'B' },
  { id: '8', company_name: 'SuperMarché Bio', address: '99 Av. de la République, Paris', city: 'Paris', phone: '01 55 66 77 88', visit_frequency: 'multiple_per_week', number_of_vehicles: 18, annual_revenue_potential: 63000, latitude: null, longitude: null, sales_potential: 'A' },
  { id: '9', company_name: 'Pressing Express', address: '7 Rue Pasteur, Lyon', city: 'Lyon', phone: '04 78 44 55 66', visit_frequency: 'monthly', number_of_vehicles: 1, annual_revenue_potential: 3500, latitude: null, longitude: null, sales_potential: 'C' },
  { id: '10', company_name: 'Opticien Vue Claire', address: '14 Pl. des Terreaux, Lyon', city: 'Lyon', phone: '04 78 77 88 99', visit_frequency: 'biweekly', number_of_vehicles: 6, annual_revenue_potential: 21000, latitude: null, longitude: null, sales_potential: 'B' },
];

type StopStatus = 'planned' | 'in_progress' | 'completed';

export default function RoutesPage() {
  const baseCycle = useMemo(() => generateRouteCycle(demoCustomers), []);
  const [dayOverrides, setDayOverrides] = useState<Record<number, PlannedVisit[]>>({});
  const [selectedDay, setSelectedDay] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, StopStatus>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [activeClient, setActiveClient] = useState('');
  const [dayStarted, setDayStarted] = useState(false);
  const [tourMode, setTourMode] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const { session, startSession } = useTourSession();

  const todayStops = dayOverrides[selectedDay] || baseCycle[selectedDay] || [];

  const handleReorder = useCallback((newStops: PlannedVisit[]) => {
    setDayOverrides(prev => ({ ...prev, [selectedDay]: newStops }));
  }, [selectedDay]);

  const handleStartTour = () => {
    const stops = todayStops.map(s => ({ customer: s.customer, priority: s.priority }));
    startSession(selectedDay, stops);
    setTourMode(true);
  };

  const handleResumeTour = () => {
    setTourMode(true);
  };

  if (tourMode && session?.active) {
    return (
      <TourMode
        onExit={() => setTourMode(false)}
        allCustomers={demoCustomers}
      />
    );
  }

  const completedCount = todayStops.filter(s => statuses[`${selectedDay}-${s.customer.id}`] === 'completed').length;
  const inProgressStop = todayStops.find(s => statuses[`${selectedDay}-${s.customer.id}`] === 'in_progress');

  const handleStart = (customerId: string) => {
    setStatuses(prev => ({ ...prev, [`${selectedDay}-${customerId}`]: 'in_progress' }));
    if (!dayStarted) setDayStarted(true);
  };

  const handleEnd = (customerId: string, clientName: string) => {
    setStatuses(prev => ({ ...prev, [`${selectedDay}-${customerId}`]: 'completed' }));
    setActiveClient(clientName);
    setReportOpen(true);
  };

  const handleNextVisit = () => {
    const next = todayStops.find(s => {
      const key = `${selectedDay}-${s.customer.id}`;
      return !statuses[key] || statuses[key] === 'planned';
    });
    if (next) handleStart(next.customer.id);
  };

  const handleEndDay = () => {
    setDayStarted(false);
  };

  const getStatus = (customerId: string): StopStatus => {
    return statuses[`${selectedDay}-${customerId}`] || 'planned';
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 60) return <Badge className="bg-accent/15 text-accent text-[9px] h-4 shrink-0">★ Top</Badge>;
    if (priority >= 30) return <Badge className="bg-warning/15 text-warning text-[9px] h-4 shrink-0">● Moyen</Badge>;
    return null;
  };

  // Session progress for resume banner
  const sessionCompletedCount = session ? Object.values(session.statuses).filter(s => s === 'completed').length : 0;

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* Active tour resume banner */}
      {session?.active && !tourMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Tournée en cours</p>
                <p className="text-xs text-muted-foreground">
                  {sessionCompletedCount} / {session.stops.length} visites complétées
                </p>
              </div>
              <Button size="sm" className="h-10 px-4 font-semibold shrink-0 gap-1.5" onClick={handleResumeTour}>
                <RotateCcw className="h-4 w-4" />
                Reprendre
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl md:text-2xl font-bold">Tournée</h1>
          <p className="text-xs text-muted-foreground">
            Cycle 4 semaines · {getDayLabel(selectedDay)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5 text-xs font-semibold"
            onClick={() => setOptimizerOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
            Optimiser
          </Button>
          <Button
            variant={reorderMode ? 'default' : 'outline'}
            size="sm"
            className="h-9 gap-1.5 text-xs font-semibold"
            onClick={() => setReorderMode(!reorderMode)}
          >
            <ArrowUpDown className="h-4 w-4" />
            {reorderMode ? 'Terminé' : 'Modifier l\'ordre'}
          </Button>
        </div>
      </div>

      {/* Day selector */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => setSelectedDay(d => Math.max(0, d - 1))} disabled={selectedDay === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1">
            {Array.from({ length: 20 }, (_, i) => {
              const dayStops = dayOverrides[i] || baseCycle[i] || [];
              return (
                <button key={i} onClick={() => setSelectedDay(i)}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                    i === selectedDay
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border hover:border-primary/30'
                  }`}>
                  <span className="block text-[10px] opacity-70">S{Math.floor(i / 5) + 1}</span>
                  <span>{['L', 'M', 'Me', 'J', 'V'][i % 5]}</span>
                  <span className="block text-[9px] mt-0.5">{dayStops.length}v</span>
                </button>
              );
            })}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => setSelectedDay(d => Math.min(19, d + 1))} disabled={selectedDay === 19}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Reorder mode */}
      {reorderMode ? (
        <SortableRouteList stops={todayStops} onReorder={handleReorder} />
      ) : (
        <>
          {/* Progress & Day Actions */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{completedCount}/{todayStops.length} visites</span>
                </div>
                <span className="text-xs text-muted-foreground">Objectif 8-12</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-3">
                <div className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${todayStops.length > 0 ? (completedCount / todayStops.length) * 100 : 0}%` }} />
              </div>
              <div className="flex gap-2">
                {!session?.active ? (
                  <Button className="flex-1 h-12 font-semibold" onClick={handleStartTour}>
                    <Sun className="h-4 w-4 mr-2" />
                    Démarrer la journée
                  </Button>
                ) : (
                  <Button className="flex-1 h-12 font-semibold gap-1.5" onClick={handleResumeTour}>
                    <RotateCcw className="h-4 w-4" />
                    Reprendre la tournée
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* In-progress banner */}
          {inProgressStop && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{inProgressStop.customer.company_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{inProgressStop.customer.address}</p>
                  </div>
                  <Button size="sm" variant="destructive" className="h-10 px-4 font-semibold shrink-0"
                    onClick={() => handleEnd(inProgressStop.customer.id, inProgressStop.customer.company_name)}>
                    <Square className="h-4 w-4 mr-1" />
                    Terminer
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stop list */}
          <div className="space-y-2">
            {todayStops.map((stop, i) => {
              const status = getStatus(stop.customer.id);
              const isActive = status === 'in_progress';
              return (
                <div key={`${stop.customer.id}-${i}`}
                  className={`rounded-xl border p-3 transition-all ${
                    isActive ? 'border-primary/40 bg-primary/5 shadow-sm' :
                    status === 'completed' ? 'opacity-60' : ''
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      status === 'completed' ? 'bg-success/10 text-success' :
                      isActive ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {status === 'completed' ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">{stop.customer.company_name}</p>
                        {getPriorityBadge(stop.priority)}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{stop.customer.address}</p>
                      {stop.customer.annual_revenue_potential > 0 && (
                        <p className="text-[10px] text-accent font-medium">
                          {stop.customer.number_of_vehicles} véh. · {(stop.customer.annual_revenue_potential / 1000).toFixed(0)}k€/an
                        </p>
                      )}
                    </div>
                  </div>
                  {status !== 'completed' && (
                    <div className="flex items-center gap-2 mt-2.5">
                      {status === 'planned' && (
                        <Button size="sm" className="h-10 flex-1 font-semibold text-xs" onClick={() => handleStart(stop.customer.id)}>
                          <Play className="h-3.5 w-3.5 mr-1" /> Démarrer
                        </Button>
                      )}
                      {isActive && (
                        <Button size="sm" variant="destructive" className="h-10 flex-1 font-semibold text-xs"
                          onClick={() => handleEnd(stop.customer.id, stop.customer.company_name)}>
                          <Square className="h-3.5 w-3.5 mr-1" /> Terminer
                        </Button>
                      )}
                      <a href={`tel:${stop.customer.phone}`} className="shrink-0">
                        <Button variant="outline" size="icon" className="h-10 w-10">
                          <Phone className="h-4 w-4" />
                        </Button>
                      </a>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.customer.address || '')}`}
                        target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <Button variant="outline" size="icon" className="h-10 w-10">
                          <Navigation className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {todayStops.length === 0 && (
            <div className="py-12 text-center">
              <Calendar className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">Aucune visite planifiée ce jour</p>
            </div>
          )}
        </>
      )}

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={activeClient} />
      <RouteOptimizerSheet
        open={optimizerOpen}
        onOpenChange={setOptimizerOpen}
      />
    </div>
  );
}
