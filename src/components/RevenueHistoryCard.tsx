import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, Minus, Target, Lightbulb, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { useCustomerPerformance } from '@/hooks/useCustomerPerformance';
import { getStatusConfig, getActionSuggestions, type RevenueData } from '@/lib/performanceUtils';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Cell } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const MONTH_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

interface Props {
  customerId: string;
  annualRevenuePotential: number;
}

export function RevenueHistoryCard({ customerId, annualRevenuePotential }: Props) {
  const perf = useCustomerPerformance(customerId, annualRevenuePotential);
  const sc = getStatusConfig(perf.status);
  const actions = getActionSuggestions(perf.status);

  // Fetch ALL actual revenue rows for this customer (not just fixed M-1..M-6)
  const { data: allRevenues = [] } = useQuery({
    queryKey: ['customer-all-revenues', customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('monthly_revenues')
        .select('month, year, monthly_revenue')
        .eq('customer_id', customerId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(12);
      return (data || []) as RevenueData[];
    },
    enabled: !!customerId,
  });

  const TrendIcon = perf.trend === 'up' ? TrendingUp : perf.trend === 'down' ? TrendingDown : Minus;
  const trendColor = perf.trend === 'up' ? 'text-accent' : perf.trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

  // Chart data
  const chartData = perf.recentMonths.map(m => ({
    label: MONTH_SHORT[m.month - 1],
    ca: m.monthly_revenue,
  }));

  // Empty state: no revenue data AND no meaningful potential
  if (perf.status === 'no_data' && perf.monthlyPotential <= 0 && allRevenues.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-2">
          <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Aucun CA renseigné</p>
          <p className="text-xs text-muted-foreground/70">Importez le CA mensuel depuis l'administration</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Performance Status */}
      <Card className={`border-l-4 ${perf.status === 'optimise' ? 'border-l-accent' : perf.status === 'a_developper' ? 'border-l-warning' : perf.status === 'sous_exploite' ? 'border-l-destructive' : 'border-l-muted'}`}>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Performance commerciale
            </span>
            <Badge className={`text-[10px] ${sc.bgColor} ${sc.color}`}>
              {sc.emoji} {sc.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CA potentiel</p>
              <p className="font-heading text-lg font-bold">{Math.round(perf.monthlyPotential).toLocaleString('fr-FR')}€</p>
              <p className="text-[10px] text-muted-foreground">/mois</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CA M-1</p>
              <div className="flex items-center gap-1.5">
                <p className="font-heading text-lg font-bold">
                  {perf.caM1 !== null ? `${perf.caM1.toLocaleString('fr-FR')}€` : '—'}
                </p>
                {perf.caM1 !== null && <TrendIcon className={`h-4 w-4 ${trendColor}`} />}
              </div>
            </div>
          </div>

          {/* Coverage + Gap */}
          {perf.caM1 !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Taux de couverture</span>
                <Badge className={`text-xs ${sc.bgColor} ${sc.color}`}>{Math.round(perf.coverageRate)}%</Badge>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${perf.coverageRate >= 80 ? 'bg-accent' : perf.coverageRate >= 40 ? 'bg-warning' : 'bg-destructive'}`}
                  style={{ width: `${Math.min(perf.coverageRate, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Écart vs potentiel</span>
                <span className={`font-medium ${perf.gap <= 0 ? 'text-accent' : 'text-destructive'}`}>
                  {perf.gap <= 0 ? '+' : '-'}{Math.abs(Math.round(perf.gap)).toLocaleString('fr-FR')}€
                </span>
              </div>
            </div>
          )}

          {/* M-2 M-3 */}
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">M-2: </span>
              <span className="font-medium">{perf.caM2 !== null ? `${perf.caM2.toLocaleString('fr-FR')}€` : '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">M-3: </span>
              <span className="font-medium">{perf.caM3 !== null ? `${perf.caM3.toLocaleString('fr-FR')}€` : '—'}</span>
            </div>
          </div>

          {/* Mini chart (last 6 months) */}
          {chartData.some(d => d.ca > 0) && (
            <div className="h-24 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="20%">
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, 'auto']} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toLocaleString('fr-FR')}€`, 'CA']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                  />
                  {perf.monthlyPotential > 0 && (
                    <ReferenceLine y={perf.monthlyPotential} stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={1} />
                  )}
                  <Bar dataKey="ca" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.ca >= perf.monthlyPotential ? 'hsl(var(--accent))' : entry.ca >= perf.monthlyPotential * 0.4 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))'}
                        opacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue History Table */}
      {allRevenues.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="font-heading text-sm flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Historique CA ({allRevenues.length} mois)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs h-8 px-2">Mois</TableHead>
                  <TableHead className="text-xs h-8 px-2 text-right">CA réel</TableHead>
                  <TableHead className="text-xs h-8 px-2 text-right">vs Potentiel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allRevenues.map((r, i) => {
                  const coverage = perf.monthlyPotential > 0 
                    ? Math.round((Number(r.monthly_revenue) / perf.monthlyPotential) * 100) 
                    : 0;
                  const gap = perf.monthlyPotential - Number(r.monthly_revenue);
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs py-2 px-2 font-medium">
                        {MONTH_FULL[r.month - 1]} {r.year}
                      </TableCell>
                      <TableCell className="text-xs py-2 px-2 text-right font-semibold">
                        {Number(r.monthly_revenue).toLocaleString('fr-FR')}€
                      </TableCell>
                      <TableCell className={`text-xs py-2 px-2 text-right ${coverage >= 80 ? 'text-accent' : coverage >= 40 ? 'text-warning' : 'text-destructive'}`}>
                        {coverage}%
                        {gap > 0 && <span className="text-muted-foreground ml-1">(-{Math.round(gap).toLocaleString('fr-FR')}€)</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* No data empty state */}
      {allRevenues.length === 0 && perf.status === 'no_data' && (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Aucun CA renseigné</p>
            <p className="text-xs text-muted-foreground/70">Importez le CA mensuel depuis l'administration</p>
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {perf.alerts.length > 0 && (
        <div className="space-y-1.5">
          {perf.alerts.map((alert, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-medium ${
              alert.level === 'danger' ? 'bg-destructive/10 text-destructive' :
              alert.level === 'warning' ? 'bg-warning/10 text-warning' :
              'bg-accent/10 text-accent'
            }`}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {alert.label}
            </div>
          ))}
        </div>
      )}

      {/* Action suggestions */}
      {actions.length > 0 && perf.status !== 'no_data' && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="font-heading text-xs flex items-center gap-1.5 text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5" />
              Actions recommandées
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b last:border-0">
                <span className="font-medium">{a.label}</span>
                <span className="text-muted-foreground">— {a.description}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
