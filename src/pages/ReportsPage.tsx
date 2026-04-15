import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, FileText, Calendar, Search, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { NewReportSheet } from '@/components/NewReportSheet';
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';
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

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Toutes les périodes' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: '30', label: '30 derniers jours' },
  { value: '90', label: '90 derniers jours' },
];

const OUTCOME_OPTIONS = [
  { value: 'all', label: 'Tous les résultats' },
  { value: 'productive', label: 'Productif' },
  { value: 'no_contact', label: 'Absent' },
  { value: 'not_interested', label: 'Pas intéressé' },
  { value: 'followup', label: 'À relancer' },
];

function getDateFrom(period: string): string | null {
  const now = new Date();
  switch (period) {
    case 'week': return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    case 'month': return format(startOfMonth(now), 'yyyy-MM-dd');
    case '30': return format(subDays(now, 30), 'yyyy-MM-dd');
    case '90': return format(subDays(now, 90), 'yyyy-MM-dd');
    default: return null;
  }
}

export default function ReportsPage() {
  const { user, role } = useAuth();
  const { effectiveUserId, effectiveRole } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;
  const activeRole = effectiveRole || role;
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('all');
  const [outcome, setOutcome] = useState('all');

  const hasFilter = search || period !== 'all' || outcome !== 'all';

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['visit-reports', activeUserId, activeRole, period, outcome],
    queryFn: async () => {
      let query = supabase
        .from('visit_reports')
        .select('*, customers(company_name, city)')
        .order('visit_date', { ascending: false })
        .limit(100);

      // Scope: admin/manager see all, others see own
      if (activeRole !== 'admin' && activeRole !== 'manager') {
        query = query.eq('rep_id', activeUserId!);
      }

      const dateFrom = getDateFrom(period);
      if (dateFrom) {
        query = query.gte('visit_date', dateFrom);
      }

      if (outcome !== 'all') {
        query = query.eq('quick_outcome', outcome);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeUserId,
  });

  // Client-side text search
  const filtered = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter((r: any) => {
      const cust = r.customers as any;
      return (
        (cust?.company_name || '').toLowerCase().includes(q) ||
        (cust?.city || '').toLowerCase().includes(q) ||
        (r.summary || '').toLowerCase().includes(q)
      );
    });
  }, [reports, search]);

  const clearFilters = () => {
    setSearch('');
    setPeriod('all');
    setOutcome('all');
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Rapports de visite</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} rapport{filtered.length > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau rapport
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher client, ville, résumé…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full sm:w-[180px] h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger className="w-full sm:w-[180px] h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilter && (
          <Button variant="ghost" size="sm" className="h-10 px-3 text-xs shrink-0" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            Effacer
          </Button>
        )}
      </div>

      {/* List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {hasFilter ? 'Aucun rapport correspondant aux filtres.' : 'Aucun rapport. Créez votre premier rapport !'}
          </p>
        ) : (
          filtered.map((report: any) => (
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

      <NewReportSheet
        open={showNew}
        onOpenChange={setShowNew}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['visit-reports'] })}
      />
    </div>
  );
}
