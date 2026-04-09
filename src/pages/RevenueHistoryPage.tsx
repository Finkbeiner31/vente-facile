import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, DollarSign, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const MONTH_LABELS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function RevenueHistoryPage() {
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const { data: revenues = [], isLoading } = useQuery({
    queryKey: ['revenue-history', selectedYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('monthly_revenues')
        .select('*, customers!inner(company_name, city, annual_revenue_potential)')
        .eq('year', parseInt(selectedYear))
        .order('month', { ascending: false });
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (!search) return revenues;
    const q = search.toLowerCase();
    return revenues.filter((r: any) =>
      r.customers?.company_name?.toLowerCase().includes(q) ||
      r.customers?.city?.toLowerCase().includes(q)
    );
  }, [revenues, search]);

  if (role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-bold mb-2">Accès refusé</h2>
            <p className="text-sm text-muted-foreground">Réservé aux administrateurs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="font-heading text-2xl font-bold">Historique CA clients</h1>
        <p className="text-sm text-muted-foreground">Chiffres d'affaires mensuels importés</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-10" />
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <DollarSign className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Aucune donnée CA pour {selectedYear}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Mois</TableHead>
                <TableHead>CA mensuel</TableHead>
                <TableHead>CA potentiel</TableHead>
                <TableHead>Couverture</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rev: any) => {
                const potential = (rev.customers?.annual_revenue_potential || 0) / 12;
                const coverage = potential > 0 ? (Number(rev.monthly_revenue) / potential) * 100 : 0;
                return (
                  <TableRow key={rev.id}>
                    <TableCell className="font-medium text-sm">{rev.customers?.company_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{rev.customers?.city || '—'}</TableCell>
                    <TableCell className="text-sm">{MONTH_LABELS[(rev.month || 1) - 1]} {rev.year}</TableCell>
                    <TableCell className="text-sm font-semibold">{Number(rev.monthly_revenue).toLocaleString('fr-FR')}€</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{potential > 0 ? `${Math.round(potential).toLocaleString('fr-FR')}€` : '—'}</TableCell>
                    <TableCell>
                      {potential > 0 ? (
                        <Badge className={`text-[10px] ${coverage >= 80 ? 'bg-accent/15 text-accent' : coverage >= 50 ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive'}`}>
                          {Math.round(coverage)}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
