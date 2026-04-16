import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, FileText, Calendar, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { NewReportSheet } from '@/components/NewReportSheet';
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const OUTCOME_LABELS: Record<string, string> = {
  productive: 'Productif',
  no_contact: 'Absent',
  not_interested: 'Pas intéressé',
  followup: 'À relancer',
  positive: 'Positif',
  neutral: 'Neutre',
  negative: 'Négatif',
};

type PeriodFilter = 'all' | 'week' | 'month' | '30d' | '90d';
type OutcomeFilter = 'all' | 'productive' | 'no_contact' | 'not_interested' | 'followup';

export default function ReportsPage() {
  const { user, role } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');

  const effectiveRole = role;
  const isGlobalScope = effectiveRole === 'admin' || effectiveRole === 'manager';

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['visit-reports', activeUserId, isGlobalScope],
    queryFn: async () => {
      let query = supabase
        .from('visit_reports')
        .select('*, customers(company_name, city)')
        .order('visit_date', { ascending: false })
        .limit(200);

      if (!isGlobalScope) {
        query = query.eq('rep_id', activeUserId!);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: !!activeUserId,
  });

  const hasActiveFilters = search !== '' || period !== 'all' || outcome !== 'all';

  const filtered = useMemo(() => {
    let list = reports;

    // Text search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.customers?.company_name || '').toLowerCase().includes(q) ||
        (r.customers?.city || '').toLowerCase().includes(q) ||
        (r.summary || '').toLowerCase().includes(q)
      );
    }

    // Period
    if (period !== 'all') {
      const now = new Date();
      let cutoff: Date;
      switch (period) {
        case 'week': cutoff = startOfWeek(now, { weekStartsOn: 1 }); break;
        case 'month': cutoff = startOfMonth(now); break;
        case '30d': cutoff = subDays(now, 30); break;
        case '90d': cutoff = subDays(now, 90); break;
      }
      list = list.filter(r => new Date(r.visit_date) >= cutoff);
    }

    // Outcome
    if (outcome !== 'all') {
      list = list.filter(r => r.quick_outcome === outcome);
    }

    return list;
  }, [reports, search, period, outcome]);

  const clearFilters = () => {
    setSearch('');
    setPeriod('all');
    setOutcome('all');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Rapports de visite</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} rapports{hasActiveFilters ? ` (sur ${reports.length})` : ''}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau rapport
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Rechercher client, ville, résumé…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={period} onValueChange={v => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="w-full sm:w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les périodes</SelectItem>
              <SelectItem value="week">Cette semaine</SelectItem>
              <SelectItem value="month">Ce mois</SelectItem>
              <SelectItem value="30d">30 derniers jours</SelectItem>
              <SelectItem value="90d">90 derniers jours</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outcome} onValueChange={v => setOutcome(v as OutcomeFilter)}>
            <SelectTrigger className="w-full sm:w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les résultats</SelectItem>
              <SelectItem value="productive">Productif</SelectItem>
              <SelectItem value="no_contact">Absent</SelectItem>
              <SelectItem value="not_interested">Pas intéressé</SelectItem>
              <SelectItem value="followup">À relancer</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 px-2 shrink-0" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" /> Effacer
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Chargement...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {hasActiveFilters ? 'Aucun rapport ne correspond aux filtres.' : 'Aucun rapport. Créez votre premier rapport !'}
          </p>
        ) : (
          filtered.map((report) => (
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
