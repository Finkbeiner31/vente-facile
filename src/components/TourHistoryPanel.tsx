import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Eye, RotateCcw, Trash2, History, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useTourHistory, useDeleteTourHistory, type TourHistoryEntry } from '@/hooks/useTourHistory';
import { TourHistoryDetailDialog } from './TourHistoryDetailDialog';
import { formatDuration } from '@/lib/tourneeOptimizer';
import { toast } from 'sonner';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  optimized: { label: 'Optimisée', tone: 'bg-primary/10 text-primary border-primary/20' },
  manual: { label: 'Modifiée', tone: 'bg-accent/10 text-accent border-accent/20' },
  completed: { label: 'Réalisée', tone: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  prepared: { label: 'Préparée', tone: 'bg-muted text-muted-foreground' },
};

interface Props {
  /** Called when the user clicks "Réutiliser" — parent handles target picker + apply. */
  onReuse: (entry: TourHistoryEntry) => void;
}

export function TourHistoryPanel({ onReuse }: Props) {
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const userId = effectiveUserId || user?.id;
  const { data: history = [], isLoading } = useTourHistory(userId);
  const deleteMutation = useDeleteTourHistory();

  const [detail, setDetail] = useState<TourHistoryEntry | null>(null);

  const handleDelete = async (e: TourHistoryEntry) => {
    if (!userId) return;
    if (!confirm(`Supprimer la tournée du ${format(parseISO(e.tour_date), 'd MMM yyyy', { locale: fr })} de l'historique ?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: e.id, userId });
      toast.success('Tournée supprimée de l\'historique');
    } catch {
      toast.error('Suppression impossible');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <History className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-semibold">Aucune tournée archivée</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Vos tournées seront archivées automatiquement à la fin de la journée,
            ou manuellement via le bouton « Archiver cette tournée ».
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-center">Visites</TableHead>
                  <TableHead className="text-center">Distance</TableHead>
                  <TableHead className="text-center">Durée</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(h => {
                  const status = STATUS_LABEL[h.status] || STATUS_LABEL.prepared;
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">
                        {format(parseISO(h.tour_date), 'EEE d MMM', { locale: fr })}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: h.zone_color || '#888' }} />
                          {h.zone_name || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{h.stops_count}</TableCell>
                      <TableCell className="text-center">{h.total_distance_km ?? 0} km</TableCell>
                      <TableCell className="text-center">{formatDuration(h.estimated_duration_min ?? 0)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDetail(h)} title="Voir">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary" onClick={() => onReuse(h)} title="Réutiliser">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(h)} title="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y">
            {history.map(h => {
              const status = STATUS_LABEL[h.status] || STATUS_LABEL.prepared;
              return (
                <div key={h.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">
                        {format(parseISO(h.tour_date), 'EEE d MMM yyyy', { locale: fr })}
                      </p>
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mt-0.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: h.zone_color || '#888' }} />
                        {h.zone_name || '—'}
                      </p>
                    </div>
                    <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded bg-muted/50 p-1.5 text-center">
                      <p className="text-muted-foreground">Visites</p>
                      <p className="font-bold">{h.stops_count}</p>
                    </div>
                    <div className="rounded bg-muted/50 p-1.5 text-center">
                      <p className="text-muted-foreground">Distance</p>
                      <p className="font-bold">{h.total_distance_km ?? 0} km</p>
                    </div>
                    <div className="rounded bg-muted/50 p-1.5 text-center">
                      <p className="text-muted-foreground">Durée</p>
                      <p className="font-bold">{formatDuration(h.estimated_duration_min ?? 0)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => setDetail(h)}>
                      <Eye className="h-3.5 w-3.5" />Voir
                    </Button>
                    <Button size="sm" className="flex-1 gap-1.5" onClick={() => onReuse(h)}>
                      <RotateCcw className="h-3.5 w-3.5" />Réutiliser
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <TourHistoryDetailDialog
        entry={detail}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        onReuse={(e) => { setDetail(null); onReuse(e); }}
      />
    </>
  );
}
