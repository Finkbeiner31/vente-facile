import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { FileText, Calendar, User, MessageSquare, ArrowRight } from 'lucide-react';

interface LastReport {
  date: string;
  contactMet: string;
  summary: string;
  nextAction: string;
  notes: string;
  outcome: string;
}

interface LastReportCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  report: LastReport | null;
}

const outcomeLabels: Record<string, string> = {
  productive: 'Productif',
  no_contact: 'Absent',
  not_interested: 'Pas intéressé',
  followup: 'À relancer',
};

export function LastReportCard({ open, onOpenChange, clientName, report }: LastReportCardProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-2xl px-5 pb-8">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Dernier rapport — {clientName}
          </SheetTitle>
        </SheetHeader>

        {!report ? (
          <div className="text-center py-8">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">Aucun rapport précédent</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="text-sm font-semibold">{report.date}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Contact rencontré</p>
                <p className="text-sm font-semibold">{report.contactMet || 'Non renseigné'}</p>
              </div>
            </div>

            {report.outcome && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Résultat</p>
                <p className="text-sm font-semibold text-primary">
                  {outcomeLabels[report.outcome] || report.outcome}
                </p>
              </div>
            )}

            {report.summary && (
              <div className="rounded-xl bg-muted/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Résumé</p>
                </div>
                <p className="text-sm">{report.summary}</p>
              </div>
            )}

            {report.nextAction && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowRight className="h-3.5 w-3.5 text-accent" />
                  <p className="text-xs text-muted-foreground">Prochaine action</p>
                </div>
                <p className="text-sm font-medium text-accent">{report.nextAction}</p>
              </div>
            )}

            {report.notes && (
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm">{report.notes}</p>
              </div>
            )}
          </div>
        )}

        <Button variant="outline" className="w-full h-12 mt-4 font-semibold" onClick={() => onOpenChange(false)}>
          Fermer
        </Button>
      </SheetContent>
    </Sheet>
  );
}
