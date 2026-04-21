import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, TrendingUp, AlertTriangle, Target, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Synthesis {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative' | string;
  potential: 'low' | 'medium' | 'high' | string;
  opportunities: string | null;
  risks: string | null;
  next_actions: string | null;
  reports_count: number;
  latest_report_date: string | null;
  updated_at: string;
}

interface Props {
  customerId: string;
  /** Most recent visit_date among loaded reports — used to detect a new report and auto-refresh */
  latestReportDate: string | null;
  reportsCount: number;
}

const SENTIMENT_META: Record<string, { label: string; cls: string }> = {
  positive: { label: 'Positif', cls: 'bg-primary/10 text-primary border-primary/20' },
  neutral: { label: 'Neutre', cls: 'bg-muted text-muted-foreground border-border' },
  negative: { label: 'Négatif', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const POTENTIAL_META: Record<string, { label: string; cls: string }> = {
  high: { label: 'Potentiel élevé', cls: 'bg-accent/10 text-accent border-accent/20' },
  medium: { label: 'Potentiel moyen', cls: 'bg-chart-4/10 text-chart-4 border-chart-4/20' },
  low: { label: 'Potentiel faible', cls: 'bg-muted text-muted-foreground border-border' },
};

export function ClientReportSynthesis({ customerId, latestReportDate, reportsCount }: Props) {
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    loadCached();
  }, [customerId]);

  // Auto-refresh when a newer report exists than the cached synthesis
  useEffect(() => {
    if (!synthesis || !latestReportDate) return;
    if (reportsCount < 3) return;
    if (synthesis.latest_report_date && latestReportDate > synthesis.latest_report_date) {
      generate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthesis?.latest_report_date, latestReportDate, reportsCount]);

  const loadCached = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('client_report_syntheses')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();
      setSynthesis(data as Synthesis | null);
    } finally {
      setLoading(false);
    }
  };

  const generate = async (silent = false) => {
    if (generating) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('synthesize-client-reports', {
        body: { customerId, limit: 5 },
      });
      if (error) throw error;
      if (data?.error === 'insufficient_data') {
        if (!silent) toast.info(data.message);
        return;
      }
      if (data?.synthesis) {
        setSynthesis(data.synthesis);
        if (!silent) toast.success('Synthèse mise à jour');
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (e: any) {
      console.error('generate synthesis error:', e);
      if (!silent) toast.error(e?.message || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de la synthèse…
      </div>
    );
  }

  if (reportsCount < 3) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Synthèse IA</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Pas assez de données pour générer une synthèse fiable (minimum 3 rapports).
        </p>
      </div>
    );
  }

  if (!synthesis) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Synthèse des dernières visites</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Générez une synthèse IA des {Math.min(reportsCount, 5)} derniers rapports pour comprendre la situation en un clin d'œil.
        </p>
        <Button size="sm" onClick={() => generate()} disabled={generating} className="h-9">
          {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {generating ? 'Génération…' : 'Générer la synthèse'}
        </Button>
      </div>
    );
  }

  const sentiment = SENTIMENT_META[synthesis.sentiment] || SENTIMENT_META.neutral;
  const potential = POTENTIAL_META[synthesis.potential] || POTENTIAL_META.medium;

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-semibold truncate">🧠 Synthèse des dernières visites</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs shrink-0"
          onClick={() => generate()}
          disabled={generating}
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="ml-1 hidden sm:inline">Mettre à jour</span>
        </Button>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{synthesis.summary}</p>

      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${sentiment.cls}`}>
          Sentiment: {sentiment.label}
        </span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${potential.cls}`}>
          {potential.label}
        </span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border bg-card text-muted-foreground">
          Basée sur {synthesis.reports_count} rapports
        </span>
      </div>

      {synthesis.opportunities && synthesis.opportunities.trim() && (
        <div className="rounded-lg bg-card/60 border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold">Opportunités</p>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-line">{synthesis.opportunities}</p>
        </div>
      )}

      {synthesis.risks && synthesis.risks.trim() && (
        <div className="rounded-lg bg-card/60 border border-border p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            <p className="text-xs font-semibold">Risques / blocages</p>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-line">{synthesis.risks}</p>
        </div>
      )}

      {synthesis.next_actions && synthesis.next_actions.trim() && (
        <div className="rounded-lg bg-card/60 border border-accent/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3.5 w-3.5 text-accent" />
            <p className="text-xs font-semibold">Actions recommandées</p>
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-line">{synthesis.next_actions}</p>
        </div>
      )}
    </div>
  );
}
