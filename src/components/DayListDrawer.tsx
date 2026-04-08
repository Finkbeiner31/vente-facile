import { useState } from 'react';
import { formatMonthly, getRevenueTier, getRevenueTierColor } from '@/lib/revenueUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  MapPin, TrendingUp, Plus, CheckCircle, Clock, SkipForward, Play,
} from 'lucide-react';
import { SortableRouteList } from './SortableRouteList';
import type { TourStop } from './TourMode';

type StopStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

interface DayListDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stops: TourStop[];
  statuses: Record<number, StopStatus>;
  currentIndex: number;
  onGoToStop: (index: number) => void;
  onReorder: (stops: TourStop[]) => void;
  onAddUnplanned: () => void;
}

const statusConfig: Record<StopStatus, { label: string; icon: typeof CheckCircle; className: string }> = {
  planned: { label: 'Prévu', icon: Clock, className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'En cours', icon: Play, className: 'bg-primary/15 text-primary' },
  completed: { label: 'Fait', icon: CheckCircle, className: 'bg-success/15 text-success' },
  skipped: { label: 'Passé', icon: SkipForward, className: 'bg-warning/15 text-warning' },
};

export function DayListDrawer({
  open, onOpenChange, stops, statuses, currentIndex,
  onGoToStop, onReorder, onAddUnplanned,
}: DayListDrawerProps) {
  const [reorderMode, setReorderMode] = useState(false);

  const completedCount = Object.values(statuses).filter(s => s === 'completed').length;

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setReorderMode(false); }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl px-0 pb-0 flex flex-col">
        <SheetHeader className="px-5 pb-2 shrink-0">
          <SheetTitle className="font-heading text-lg text-left">
            Liste du jour
          </SheetTitle>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {completedCount} / {stops.length} visites complétées
            </p>
            <div className="flex gap-1.5">
              <Button
                variant={reorderMode ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setReorderMode(!reorderMode)}
              >
                {reorderMode ? 'Terminé' : 'Réordonner'}
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {reorderMode ? (
            <SortableRouteList
              stops={stops.map(s => ({ customer: s.customer, priority: s.priority, dayIndex: 0 }))}
              onReorder={(newStops) => {
                onReorder(newStops.map(s => ({ customer: s.customer, priority: s.priority })));
              }}
              compact
            />
          ) : (
            <div className="space-y-1.5">
              {stops.map((stop, i) => {
                const status = statuses[i] || 'planned';
                const config = statusConfig[status];
                const StatusIcon = config.icon;
                const isCurrent = i === currentIndex;

                return (
                  <button
                    key={`${stop.customer.id}-${i}`}
                    onClick={() => { onGoToStop(i); onOpenChange(false); }}
                    className={`w-full text-left rounded-xl border p-3 transition-all active:scale-[0.98] ${
                      isCurrent ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'border-border'
                    } ${status === 'completed' || status === 'skipped' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{stop.customer.company_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {stop.customer.address && (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground truncate">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {stop.customer.city || stop.customer.address}
                            </span>
                          )}
                          {stop.customer.annual_revenue_potential > 0 && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-medium shrink-0 ${getRevenueTierColor(getRevenueTier(stop.customer.annual_revenue_potential))}`}>
                              <TrendingUp className="h-3 w-3" />
                              {formatMonthly(stop.customer.annual_revenue_potential)}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge className={`${config.className} text-[9px] h-5 shrink-0 gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Add unplanned button */}
        <div className="shrink-0 border-t px-4 py-3 bg-card" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)' }}>
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-semibold gap-2 border-dashed border-primary/30 text-primary"
            onClick={() => { onAddUnplanned(); onOpenChange(false); }}
          >
            <Plus className="h-4 w-4" />
            Ajouter une visite imprévue
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
