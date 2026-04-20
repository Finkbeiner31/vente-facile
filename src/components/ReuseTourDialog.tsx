import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { TourHistoryEntry } from '@/hooks/useTourHistory';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const WEEK_LABELS = ['S1', 'S2', 'S3', 'S4'];

export interface ReuseTarget {
  weekNumber: number;
  dayOfWeek: number;
  /** Stops that survived the freshness check. */
  validStops: TourHistoryEntry['stops'];
  warnings: { type: 'missing' | 'recent'; customer: string }[];
  replaceExisting: boolean;
}

interface Props {
  entry: TourHistoryEntry | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultWeek: number;
  defaultDay: number;
  /** Returns true if the target day already has a non-empty tournée. */
  isDayFilled: (week: number, day: number) => boolean;
  onConfirm: (target: ReuseTarget) => void;
}

export function ReuseTourDialog({
  entry, open, onOpenChange, defaultWeek, defaultDay, isDayFilled, onConfirm,
}: Props) {
  const [week, setWeek] = useState(defaultWeek);
  const [day, setDay] = useState(defaultDay);

  useEffect(() => {
    if (open) {
      setWeek(defaultWeek);
      setDay(defaultDay);
    }
  }, [open, defaultWeek, defaultDay]);

  const customerIds = useMemo(() => entry?.stops.map(s => s.customer_id) ?? [], [entry]);

  // Re-check the customers in the snapshot against current data:
  // existence + last_visit_date freshness (visited in the last 7 days).
  const { data: freshness } = useQuery({
    queryKey: ['reuse-tour-freshness', entry?.id],
    enabled: !!entry && open && customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, company_name, account_status, last_visit_date')
        .in('id', customerIds);
      if (error) throw error;
      return data || [];
    },
  });

  const { validStops, warnings } = useMemo(() => {
    if (!entry) return { validStops: [], warnings: [] as ReuseTarget['warnings'] };
    if (!freshness) return { validStops: entry.stops, warnings: [] as ReuseTarget['warnings'] };
    const byId = new Map(freshness.map(c => [c.id, c]));
    const w: ReuseTarget['warnings'] = [];
    const valid: TourHistoryEntry['stops'] = [];
    const recentMs = 7 * 86400000;
    const now = Date.now();
    for (const s of entry.stops) {
      const cur = byId.get(s.customer_id);
      if (!cur || cur.account_status !== 'active') {
        w.push({ type: 'missing', customer: s.company_name });
        continue;
      }
      if (cur.last_visit_date) {
        const days = now - new Date(cur.last_visit_date).getTime();
        if (days < recentMs) {
          w.push({ type: 'recent', customer: s.company_name });
        }
      }
      valid.push(s);
    }
    return { validStops: valid, warnings: w };
  }, [entry, freshness]);

  if (!entry) return null;

  const dayConflict = isDayFilled(week, day);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            Réutiliser cette tournée
          </DialogTitle>
          <DialogDescription>
            Choisissez le jour cible. Toutes les métriques (distance, durées, carte) seront
            recalculées à partir des données actuelles.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Semaine</label>
            <Select value={String(week)} onValueChange={v => setWeek(Number(v))}>
              <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEK_LABELS.map((l, i) => (
                  <SelectItem key={i} value={String(i)}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Jour</label>
            <Select value={String(day)} onValueChange={v => setDay(Number(v))}>
              <SelectTrigger className="h-10 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((n, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Freshness summary */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span><b>{validStops.length}</b> étape(s) reprise(s) sur {entry.stops.length}</span>
          </div>
          {warnings.length > 0 && (
            <Alert variant="default" className="border-warning/40">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle className="text-sm">Vérifications</AlertTitle>
              <AlertDescription className="text-xs space-y-1 mt-1">
                {warnings.slice(0, 6).map((w, i) => (
                  <div key={i}>
                    {w.type === 'missing' ? (
                      <span><XCircle className="inline h-3 w-3 mr-1 text-destructive" />{w.customer} n'est plus actif/disponible — exclu</span>
                    ) : (
                      <span><AlertTriangle className="inline h-3 w-3 mr-1 text-warning" />{w.customer} visité récemment</span>
                    )}
                  </div>
                ))}
                {warnings.length > 6 && (
                  <div className="text-muted-foreground">… +{warnings.length - 6} autre(s)</div>
                )}
              </AlertDescription>
            </Alert>
          )}
          {dayConflict && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">Tournée existante</AlertTitle>
              <AlertDescription className="text-xs">
                Une tournée est déjà préparée pour {DAY_NAMES[day - 1]} ({WEEK_LABELS[week]}).
                La confirmation ci-dessous la remplacera.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            disabled={validStops.length === 0}
            onClick={() => onConfirm({
              weekNumber: week,
              dayOfWeek: day,
              validStops,
              warnings,
              replaceExisting: dayConflict,
            })}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            {dayConflict ? 'Remplacer et réutiliser' : 'Réutiliser'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
