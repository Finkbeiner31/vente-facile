import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Navigation, Clock, Briefcase, Hourglass, MapPin, RotateCcw } from 'lucide-react';
import { formatDuration } from '@/lib/tourneeOptimizer';
import type { TourHistoryEntry } from '@/hooks/useTourHistory';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  optimized: { label: 'Optimisée', tone: 'bg-primary/10 text-primary' },
  manual: { label: 'Modifiée manuellement', tone: 'bg-accent/10 text-accent' },
  completed: { label: 'Réalisée', tone: 'bg-emerald-500/10 text-emerald-600' },
  prepared: { label: 'Préparée', tone: 'bg-muted text-muted-foreground' },
};

interface Props {
  entry: TourHistoryEntry | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onReuse?: (entry: TourHistoryEntry) => void;
}

export function TourHistoryDetailDialog({ entry, open, onOpenChange, onReuse }: Props) {
  if (!entry) return null;

  const status = STATUS_LABEL[entry.status] || STATUS_LABEL.prepared;
  const dateLabel = format(parseISO(entry.tour_date), 'EEEE d MMMM yyyy', { locale: fr });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="capitalize">{dateLabel}</span>
            <Badge className={status.tone}>{status.label}</Badge>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            {entry.zone_name && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.zone_color || '#888' }} />
                {entry.zone_name}
              </span>
            )}
            {entry.day_of_week && (
              <span className="text-xs text-muted-foreground">
                · S{(entry.week_number ?? 0) + 1} · {DAY_NAMES[entry.day_of_week - 1] || ''}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric icon={Navigation} label="Distance" value={`${entry.total_distance_km ?? 0} km`} />
          <Metric icon={Clock} label="Conduite" value={formatDuration(entry.total_travel_min ?? 0)} />
          <Metric icon={Briefcase} label="Visites" value={formatDuration(entry.total_visit_min ?? 0)} />
          <Metric icon={Hourglass} label="Total estimé" value={formatDuration(entry.estimated_duration_min ?? 0)} primary />
        </div>

        {/* Stops list */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2 py-2">
            {entry.departure && (
              <Endpoint label="Départ" type="A" name={entry.departure.label} />
            )}
            {entry.stops.map(s => (
              <div key={s.customer_id + s.order} className="flex items-start gap-3 rounded-lg border p-2.5">
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                  {s.order}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.company_name}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[s.address, s.city].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                {s.visit_duration_minutes != null && (
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {s.visit_duration_minutes} min
                  </span>
                )}
              </div>
            ))}
            {entry.arrival && (
              <Endpoint label="Arrivée" type="B" name={entry.arrival.label} />
            )}
            {entry.stops.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune étape archivée.</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          {onReuse && (
            <Button onClick={() => onReuse(entry)} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Réutiliser cette tournée
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  icon: Icon, label, value, primary,
}: { icon: any; label: string; value: string; primary?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 ${primary ? 'bg-primary/10' : 'bg-muted/50'}`}>
      <div className={`flex items-center gap-1.5 text-[11px] ${primary ? 'text-primary' : 'text-muted-foreground'}`}>
        <Icon className="h-3 w-3" />{label}
      </div>
      <p className={`text-base font-bold mt-0.5 ${primary ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}

function Endpoint({ label, type, name }: { label: string; type: 'A' | 'B'; name: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-2.5 bg-muted/30">
      <div className="h-7 w-7 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center shrink-0">
        {type}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm font-medium truncate">{name}</p>
      </div>
    </div>
  );
}
