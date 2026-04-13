import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Calendar, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { NewReportSheet } from '@/components/NewReportSheet';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const OUTCOME_LABELS: Record<string, string> = {
  productive: 'Productif',
  no_contact: 'Absent',
  not_interested: 'Pas intéressé',
  followup: 'À relancer',
  positive: 'Positif',
  neutral: 'Neutre',
  negative: 'Négatif',
};

export default function ReportsPage() {
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const loadReports = async () => {
    if (!activeUserId) return;
    setLoading(true);
    const { data } = await supabase
      .from('visit_reports')
      .select('*, customers(company_name, city)')
      .eq('rep_id', activeUserId)
      .order('visit_date', { ascending: false })
      .limit(50);
    setReports(data || []);
    setLoading(false);
  };

  useEffect(() => { loadReports(); }, [activeUserId]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Rapports de visite</h1>
          <p className="text-sm text-muted-foreground">{reports.length} rapports</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau rapport
        </Button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Chargement...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Aucun rapport. Créez votre premier rapport !</p>
        ) : (
          reports.map((report) => (
            <Card key={report.id} className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{report.customers?.company_name || 'Client inconnu'}</p>
                    <p className="text-sm text-muted-foreground">{report.visit_purpose || OUTCOME_LABELS[report.quick_outcome || ''] || '—'}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(report.visit_date), 'dd MMM yyyy', { locale: fr })}
                      </span>
                      {report.quick_outcome && (
                        <Badge variant="secondary" className="text-[10px] h-5">{OUTCOME_LABELS[report.quick_outcome] || report.quick_outcome}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                {report.summary && (
                  <p className="mt-3 text-sm text-muted-foreground border-t pt-3 line-clamp-2">{report.summary}</p>
                )}
                {report.next_actions && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <Badge variant="secondary">Prochaine action</Badge>
                    <span className="text-muted-foreground truncate">{report.next_actions}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <NewReportSheet open={showNew} onOpenChange={setShowNew} onSaved={loadReports} />
    </div>
  );
}
