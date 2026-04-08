import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { CheckCircle, XCircle, TrendingUp, TrendingDown, AlertTriangle, Trophy } from 'lucide-react';

interface DaySummarySheetProps {
  open: boolean;
  onClose: () => void;
  completed: number;
  total: number;
  skipped: number;
  missed: number;
  potentialCovered: number;
  potentialMissed: number;
  highPotentialSkipped: string[];
}

export function DaySummarySheet({
  open, onClose, completed, total, skipped, missed,
  potentialCovered, potentialMissed, highPotentialSkipped,
}: DaySummarySheetProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isGood = pct >= 80;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Trophy or warning */}
        <div className={`h-20 w-20 rounded-full flex items-center justify-center mb-4 ${
          isGood ? 'bg-success/10' : 'bg-warning/10'
        }`}>
          {isGood ? (
            <Trophy className="h-10 w-10 text-success" />
          ) : (
            <AlertTriangle className="h-10 w-10 text-warning" />
          )}
        </div>

        <h1 className="font-heading text-2xl font-bold mb-1">
          {isGood ? 'Bravo ! 🎉' : 'Journée terminée'}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {completed} visite{completed > 1 ? 's' : ''} sur {total} réalisée{completed > 1 ? 's' : ''}
        </p>

        {/* Big progress ring */}
        <div className="relative h-32 w-32 mb-6">
          <svg className="h-32 w-32 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none"
              stroke={isGood ? 'hsl(var(--success))' : 'hsl(var(--warning))'}
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${pct * 2.64} 264`} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-heading text-3xl font-bold">{pct}%</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="text-lg font-bold">{completed}</p>
                <p className="text-[10px] text-muted-foreground">Réalisées</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-lg font-bold">{skipped + missed}</p>
                <p className="text-[10px] text-muted-foreground">Manquées</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-accent shrink-0" />
              <div>
                <p className="text-lg font-bold">{(potentialCovered / 1000).toFixed(0)}k€</p>
                <p className="text-[10px] text-muted-foreground">CA couvert</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <TrendingDown className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-lg font-bold">{(potentialMissed / 1000).toFixed(0)}k€</p>
                <p className="text-[10px] text-muted-foreground">CA manqué</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* High-potential warnings */}
        {highPotentialSkipped.length > 0 && (
          <div className="mt-4 w-full max-w-sm rounded-xl bg-destructive/10 border border-destructive/20 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <p className="text-xs font-semibold text-destructive">Clients haut potentiel non visités</p>
            </div>
            {highPotentialSkipped.map((name, i) => (
              <p key={i} className="text-xs text-destructive/80 ml-6">• {name}</p>
            ))}
          </div>
        )}
      </div>

      {/* Bottom button */}
      <div className="px-6 pb-6 safe-area-bottom">
        <Button className="w-full h-14 text-base font-bold" onClick={onClose}>
          Terminer
        </Button>
      </div>
    </div>
  );
}
