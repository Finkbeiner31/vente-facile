import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, User, ArrowRight, ChevronRight, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ClientReportSynthesis } from '@/components/ClientReportSynthesis';

interface Report {
  id: string;
  visit_date: string;
  summary: string | null;
  next_actions: string | null;
  quick_outcome: string | null;
  visit_purpose: string | null;
  follow_up_date: string | null;
  rep_id: string;
  rep_name?: string;
}

interface ReportHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  clientName: string;
}

const outcomeLabels: Record<string, { label: string; className: string }> = {
  productive: { label: 'Productif', className: 'bg-primary/10 text-primary border-primary/20' },
  no_contact: { label: 'Absent', className: 'bg-muted text-muted-foreground border-border' },
  not_interested: { label: 'Pas intéressé', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  followup: { label: 'À relancer', className: 'bg-accent/10 text-accent border-accent/20' },
  devis: { label: 'Devis', className: 'bg-chart-4/10 text-chart-4 border-chart-4/20' },
  sav: { label: 'SAV', className: 'bg-warning/10 text-warning border-warning/20' },
};

export function ReportHistorySheet({ open, onOpenChange, customerId, clientName }: ReportHistorySheetProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  useEffect(() => {
    if (!open || !customerId) return;
    setSelectedReport(null);
    loadReports();
  }, [open, customerId]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data: reportData } = await supabase
        .from('visit_reports')
        .select('id, visit_date, summary, next_actions, quick_outcome, visit_purpose, follow_up_date, rep_id')
        .eq('customer_id', customerId)
        .order('visit_date', { ascending: false })
        .limit(10);

      if (!reportData || reportData.length === 0) {
        setReports([]);
        setLoading(false);
        return;
      }

      const repIds = [...new Set(reportData.map(r => r.rep_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', repIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      setReports(reportData.map(r => ({
        ...r,
        rep_name: profileMap.get(r.rep_id) || 'Inconnu',
      })));
    } catch (e) {
      console.error('Error loading report history:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const hasAction = (r: Report) => !!r.next_actions || !!r.follow_up_date;

  // Detail view for a single report
  if (selectedReport) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-2xl px-5 pb-8">
          <SheetHeader className="pb-3">
            <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
              <button onClick={() => setSelectedReport(null)} className="text-muted-foreground hover:text-foreground">
                ←
              </button>
              Rapport du {formatDate(selectedReport.visit_date)}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-3 overflow-y-auto max-h-[55vh]">
            <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="text-sm font-semibold">{formatDate(selectedReport.visit_date)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Commercial</p>
                <p className="text-sm font-semibold">{selectedReport.rep_name}</p>
              </div>
            </div>

            {selectedReport.quick_outcome && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Résultat</p>
                <p className="text-sm font-semibold text-primary">
                  {outcomeLabels[selectedReport.quick_outcome]?.label || selectedReport.quick_outcome}
                </p>
              </div>
            )}

            {selectedReport.visit_purpose && (
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Objet de la visite</p>
                <p className="text-sm">{selectedReport.visit_purpose}</p>
              </div>
            )}

            {selectedReport.summary && (
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Résumé</p>
                <p className="text-sm">{selectedReport.summary}</p>
              </div>
            )}

            {selectedReport.next_actions && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ArrowRight className="h-3.5 w-3.5 text-accent" />
                  <p className="text-xs text-muted-foreground">Prochaine action</p>
                </div>
                <p className="text-sm font-medium text-accent">{selectedReport.next_actions}</p>
              </div>
            )}

            {selectedReport.follow_up_date && (
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Date de relance</p>
                <p className="text-sm font-semibold">{formatDate(selectedReport.follow_up_date)}</p>
              </div>
            )}
          </div>

          <Button variant="outline" className="w-full h-12 mt-4 font-semibold" onClick={() => setSelectedReport(null)}>
            Retour à la liste
          </Button>
        </SheetContent>
      </Sheet>
    );
  }

  // List view
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-2xl px-5 pb-8">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            10 derniers rapports — {clientName}
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">Aucun rapport disponible pour ce client</p>
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto max-h-[55vh]">
            <ClientReportSynthesis
              customerId={customerId}
              latestReportDate={reports[0]?.visit_date || null}
              reportsCount={reports.length}
            />
            {reports.map((report, idx) => {
              const outcome = report.quick_outcome ? outcomeLabels[report.quick_outcome] : null;
              return (
                <button
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className={`w-full text-left rounded-xl p-3 border transition-colors active:bg-muted/80 ${
                    idx === 0 ? 'border-primary/30 bg-primary/5' : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatDate(report.visit_date)}</span>
                      {idx === 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Dernier
                        </Badge>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>

                  <p className="text-xs text-muted-foreground mb-1.5">{report.rep_name}</p>

                  {report.summary && (
                    <p className="text-sm text-foreground line-clamp-2 mb-1.5">{report.summary}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {outcome && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${outcome.className}`}>
                        {outcome.label}
                      </span>
                    )}
                    {hasAction(report) && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-accent/20 bg-accent/10 text-accent flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Action en attente
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <Button variant="outline" className="w-full h-12 mt-4 font-semibold" onClick={() => onOpenChange(false)}>
          Fermer
        </Button>
      </SheetContent>
    </Sheet>
  );
}
