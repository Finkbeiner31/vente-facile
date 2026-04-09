import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

interface Props {
  customerId: string;
  annualRevenuePotential: number;
}

export function RevenueHistoryCard({ customerId, annualRevenuePotential }: Props) {
  const { data: revenues = [] } = useQuery({
    queryKey: ['customer-revenues', customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('monthly_revenues')
        .select('month, year, monthly_revenue')
        .eq('customer_id', customerId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(12);
      return data || [];
    },
  });

  if (revenues.length === 0) return null;

  const monthlyPotential = annualRevenuePotential / 12;
  const latest = revenues[0];
  const prev = revenues[1];
  const latestRevenue = Number(latest.monthly_revenue);
  const prevRevenue = prev ? Number(prev.monthly_revenue) : null;
  const coverage = monthlyPotential > 0 ? (latestRevenue / monthlyPotential) * 100 : 0;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (prevRevenue !== null) {
    const diff = latestRevenue - prevRevenue;
    if (diff > prevRevenue * 0.05) trend = 'up';
    else if (diff < -prevRevenue * 0.05) trend = 'down';
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-accent' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

  // Show up to last 3 months
  const recent = revenues.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <CardTitle className="font-heading text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Historique CA
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Latest month highlight */}
        <div className="flex items-center gap-3 rounded-xl border p-3 bg-primary/5">
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              CA {MONTH_SHORT[(latest.month || 1) - 1]} {latest.year}
            </p>
            <div className="flex items-center gap-2">
              <p className="font-heading text-xl font-bold">
                {latestRevenue.toLocaleString('fr-FR')}€
              </p>
              <TrendIcon className={`h-4 w-4 ${trendColor}`} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Couverture</p>
            <Badge className={`text-xs ${coverage >= 80 ? 'bg-accent/15 text-accent' : coverage >= 50 ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive'}`}>
              {Math.round(coverage)}%
            </Badge>
          </div>
        </div>

        {/* Monthly potential comparison */}
        {monthlyPotential > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">CA potentiel mensuel</span>
            <span className="font-medium">{Math.round(monthlyPotential).toLocaleString('fr-FR')}€</span>
          </div>
        )}

        {/* Écart */}
        {monthlyPotential > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Écart vs potentiel</span>
            <span className={`font-medium ${latestRevenue >= monthlyPotential ? 'text-accent' : 'text-destructive'}`}>
              {latestRevenue >= monthlyPotential ? '+' : ''}{Math.round(latestRevenue - monthlyPotential).toLocaleString('fr-FR')}€
            </span>
          </div>
        )}

        {/* Recent months table */}
        {recent.length > 1 && (
          <div className="space-y-1 pt-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mois précédents</p>
            {recent.slice(1).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                <span className="text-muted-foreground">{MONTH_SHORT[(r.month || 1) - 1]} {r.year}</span>
                <span className="font-medium">{Number(r.monthly_revenue).toLocaleString('fr-FR')}€</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
