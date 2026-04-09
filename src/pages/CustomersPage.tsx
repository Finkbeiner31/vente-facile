import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, Phone, Navigation, Building2, Car, Loader2, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMonthly, getRevenueTier, getRevenueTierColor } from '@/lib/revenueUtils';
import { NewCustomerSheet, type NewCustomerFormData } from '@/components/NewCustomerSheet';
import { toast } from 'sonner';
import { useAllCustomerRevenues } from '@/hooks/useCustomerPerformance';
import { analyzeCustomerPerformance, getStatusConfig, formatCompactRevenue, type PerformanceStatus } from '@/lib/performanceUtils';
import { computeVisitPriority, PRIORITY_CONFIGS, type PriorityLevel } from '@/lib/priorityEngine';

type CustomerStatus = 'prospect' | 'client_actif' | 'client_inactif';

interface CustomerListItem {
  id: string;
  company_name: string;
  status: CustomerStatus;
  city: string;
  phone: string;
  potential: string;
  lastVisit: string;
  lastVisitDate: string | null;
  visitFrequency: string | null;
  nextAction: string | null;
  address: string;
  vehicles: number;
  revenue: number;
  latitude: number | null;
  longitude: number | null;
}

const statusConfig: Record<CustomerStatus, { label: string; class: string }> = {
  prospect: { label: 'Prospect', class: 'bg-warning/15 text-warning' },
  client_actif: { label: 'Client actif', class: 'bg-accent/15 text-accent' },
  client_inactif: { label: 'Inactif', class: 'bg-muted text-muted-foreground' },
};

const potentialColors: Record<string, string> = {
  A: 'bg-accent/15 text-accent',
  B: 'bg-warning/15 text-warning',
  C: 'bg-muted text-muted-foreground',
};

type FilterTab = 'tous' | 'clients' | 'prospects';
type PerfFilter = 'tous' | 'optimise' | 'a_developper' | 'sous_exploite';
type TrendFilter = 'tous' | 'up' | 'down' | 'stable';
type PriorityFilter = 'tous' | 'high' | 'medium' | 'low';
type SortMode = 'potential' | 'priority' | 'caM1';

const formatLastVisit = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

const getPotential = (revenue: number, savedPotential: string | null) => {
  if (savedPotential === 'A' || savedPotential === 'B' || savedPotential === 'C') return savedPotential;
  const monthly = revenue / 12;
  if (monthly >= 5000) return 'A';
  if (monthly >= 2000) return 'B';
  return 'C';
};

const splitContactName = (fullName: string) => {
  const trimmed = fullName.trim();
  if (!trimmed) return { first_name: '', last_name: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
};

export default function CustomersPage() {
  const { user, loading } = useAuth();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('tous');
  const [perfFilter, setPerfFilter] = useState<PerfFilter>('tous');
  const [trendFilter, setTrendFilter] = useState<TrendFilter>('tous');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('tous');
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [sheetOpen, setSheetOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: revenueMap } = useAllCustomerRevenues();

  const { data: customers = [], isLoading, isError } = useQuery({
    queryKey: ['customers', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('annual_revenue_potential', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((customer): CustomerListItem => {
        const revenue = Number(customer.annual_revenue_potential || 0);
        return {
          id: customer.id,
          company_name: customer.company_name,
          status: (customer.customer_type || 'prospect') as CustomerStatus,
          city: customer.city || 'Ville non renseignée',
          phone: customer.phone || '',
          potential: getPotential(revenue, customer.sales_potential),
          lastVisit: formatLastVisit(customer.last_visit_date),
          lastVisitDate: customer.last_visit_date,
          visitFrequency: customer.visit_frequency,
          nextAction: customer.next_action_description,
          address: [customer.address, customer.city].filter(Boolean).join(', '),
          vehicles: customer.number_of_vehicles || 0,
          revenue,
          latitude: customer.latitude,
          longitude: customer.longitude,
        };
      });
    },
    enabled: !loading && !!user,
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (data: NewCustomerFormData) => {
      if (!user) throw new Error('Vous devez être connecté pour créer un compte.');
      const primaryContact = data.contacts.find(c => c.isPrimary) || data.contacts[0];
      const { data: createdCustomer, error: createError } = await supabase
        .from('customers')
        .insert({
          company_name: data.company_name.trim(),
          city: data.city.trim(),
          address: data.address.trim() || null,
          postal_code: data.postal_code?.trim() || null,
          latitude: data.latitude,
          longitude: data.longitude,
          phone: primaryContact?.phone?.trim() || null,
          email: primaryContact?.email?.trim() || null,
          notes: data.notes.trim() || null,
          customer_type: data.customer_type,
          number_of_vehicles: data.number_of_vehicles,
          assigned_rep_id: user.id,
          sales_potential: getPotential(data.number_of_vehicles * 3500, null),
        })
        .select('*')
        .single();
      if (createError) throw createError;
      if (!createdCustomer?.id) throw new Error('Le compte n\'a pas pu être créé correctement.');
      if (data.contacts.length > 0) {
        const contactRows = data.contacts.map(c => {
          const { first_name, last_name } = splitContactName(c.name);
          return {
            customer_id: createdCustomer.id,
            first_name, last_name,
            phone: c.phone.trim() || null,
            email: c.email.trim() || null,
            role: c.role.trim() || null,
            is_primary: c.isPrimary,
          };
        });
        const { error: contactError } = await supabase.from('contacts').insert(contactRows);
        if (contactError) throw contactError;
      }
      const { data: verifiedCustomer, error: verifyError } = await supabase
        .from('customers')
        .select('id, company_name, customer_type')
        .eq('id', createdCustomer.id)
        .maybeSingle();
      if (verifyError || !verifiedCustomer) throw new Error('Le compte a été enregistré mais ne peut pas être rechargé immédiatement.');
      return createdCustomer;
    },
    onSuccess: async (createdCustomer) => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`${createdCustomer.company_name} enregistré avec succès.`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Échec de l'enregistrement du compte.");
    },
  });

  // Enrich customers with performance data
  const enriched = useMemo(() => {
    return customers.map(c => {
      const history = revenueMap?.get(c.id) || [];
      const perf = analyzeCustomerPerformance(c.revenue, history);
      return { ...c, perf };
    });
  }, [customers, revenueMap]);

  const filtered = useMemo(() => enriched
    .filter(c => {
      if (tab === 'clients') return c.status === 'client_actif' || c.status === 'client_inactif';
      if (tab === 'prospects') return c.status === 'prospect';
      return true;
    })
    .filter(c => {
      if (perfFilter !== 'tous' && c.perf.status !== perfFilter) return false;
      if (trendFilter !== 'tous' && c.perf.trend !== trendFilter) return false;
      return true;
    })
    .filter(c =>
      c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase())
    ), [enriched, search, tab, perfFilter, trendFilter]);

  const counts = {
    tous: customers.length,
    clients: customers.filter(c => c.status === 'client_actif' || c.status === 'client_inactif').length,
    prospects: customers.filter(c => c.status === 'prospect').length,
  };

  const handleCreate = async (data: NewCustomerFormData) => {
    await createCustomerMutation.mutateAsync(data);
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up') return <TrendingUp className="h-3 w-3 text-accent" />;
    if (trend === 'down') return <TrendingDown className="h-3 w-3 text-destructive" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl md:text-2xl font-bold">
            {tab === 'prospects' ? 'Prospects' : tab === 'clients' ? 'Clients' : 'Clients et prospects'}
          </h1>
          <p className="text-xs text-muted-foreground">{filtered.length} comptes · trié par potentiel</p>
        </div>
        <Button size="sm" className="h-10 px-4 font-semibold" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Nouveau
        </Button>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as FilterTab)}>
        <TabsList className="w-full">
          <TabsTrigger value="tous" className="flex-1 text-xs">Tous ({counts.tous})</TabsTrigger>
          <TabsTrigger value="clients" className="flex-1 text-xs">Clients ({counts.clients})</TabsTrigger>
          <TabsTrigger value="prospects" className="flex-1 text-xs">Prospects ({counts.prospects})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11" />
        </div>
        <Select value={perfFilter} onValueChange={v => setPerfFilter(v as PerfFilter)}>
          <SelectTrigger className="w-[150px] h-11 text-xs"><SelectValue placeholder="Performance" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Toute perf.</SelectItem>
            <SelectItem value="optimise">🟢 Optimisé</SelectItem>
            <SelectItem value="a_developper">🟡 À développer</SelectItem>
            <SelectItem value="sous_exploite">🔴 Sous-exploité</SelectItem>
          </SelectContent>
        </Select>
        <Select value={trendFilter} onValueChange={v => setTrendFilter(v as TrendFilter)}>
          <SelectTrigger className="w-[130px] h-11 text-xs"><SelectValue placeholder="Tendance" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Toute tendance</SelectItem>
            <SelectItem value="up">📈 En hausse</SelectItem>
            <SelectItem value="down">📉 En baisse</SelectItem>
            <SelectItem value="stable">➡️ Stable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement des comptes...
        </div>
      )}

      {isError && !isLoading && (
        <div className="py-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium">Impossible de charger les comptes</p>
          <p className="mt-1 text-xs text-muted-foreground">Vérifiez votre session puis réessayez.</p>
        </div>
      )}

      {!isLoading && !isError && (
      <div className="space-y-2">
        {filtered.map(customer => {
          const sc = statusConfig[customer.status];
          const perfSc = getStatusConfig(customer.perf.status);
          return (
            <Link key={customer.id} to={`/clients/${customer.id}`} className="block">
              <Card className={`transition-all hover:border-primary/30 cursor-pointer ${
                customer.perf.status === 'sous_exploite' ? 'border-l-2 border-l-destructive' :
                customer.perf.status === 'a_developper' ? 'border-l-2 border-l-warning' :
                customer.perf.status === 'optimise' ? 'border-l-2 border-l-accent' :
                customer.potential === 'A' ? 'border-l-2 border-l-accent' : ''
              }`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{customer.company_name}</p>
                        {customer.perf.status !== 'no_data' ? (
                          <Badge className={`text-[9px] h-4 ${perfSc.bgColor} ${perfSc.color}`}>
                            {perfSc.emoji} {Math.round(customer.perf.coverageRate)}%
                          </Badge>
                        ) : customer.revenue > 0 && customer.perf.latestKnownCA === null ? (
                          <Badge className="text-[9px] h-4 bg-destructive/15 text-destructive">🔴 À travailler</Badge>
                        ) : customer.revenue <= 0 ? (
                          <Badge className="text-[9px] h-4 bg-muted text-muted-foreground">⚪ À qualifier</Badge>
                        ) : null}
                        <Badge className={`text-[9px] h-4 ${sc.class}`}>{sc.label}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{customer.city}</span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Car className="h-2.5 w-2.5" /> {customer.vehicles}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] mt-0.5 flex-wrap">
                        {/* CA potentiel */}
                        {customer.revenue > 0 ? (
                          <span className="text-muted-foreground">
                            CA pot. <span className={`font-semibold ${getRevenueTierColor(getRevenueTier(customer.revenue))}`}>{formatMonthly(customer.revenue)}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70 italic text-[10px]">CA pot. non renseigné</span>
                        )}

                        {/* M-1 or fallback */}
                        {customer.perf.caM1 !== null && customer.perf.caM1 > 0 ? (
                          <>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="font-semibold text-foreground flex items-center gap-0.5">
                              M-1 {formatCompactRevenue(customer.perf.caM1)}
                              <TrendIcon trend={customer.perf.trend} />
                            </span>
                          </>
                        ) : customer.perf.latestKnownCA !== null ? (
                          <>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="font-medium text-foreground/80 flex items-center gap-0.5">
                              Dernier CA {formatCompactRevenue(customer.perf.latestKnownCA)}
                              <span className="text-[9px] text-muted-foreground font-normal">({customer.perf.latestKnownLabel})</span>
                            </span>
                          </>
                        ) : null}

                        {/* N-1 only if available */}
                        {customer.perf.caN1 !== null && customer.perf.caN1 > 0 && (
                          <>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-muted-foreground">
                              N-1 <span className="font-medium">{formatCompactRevenue(customer.perf.caN1)}</span>
                              {customer.perf.yoyDelta !== null && (
                                <span className={`ml-0.5 ${customer.perf.yoyTrend === 'up' ? 'text-accent' : customer.perf.yoyTrend === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {customer.perf.yoyDelta >= 0 ? '↑' : '↓'}
                                </span>
                              )}
                            </span>
                          </>
                        )}

                        {/* Projection only if meaningful */}
                        {customer.perf.projectionAnnual !== null && customer.perf.projectionAnnual > 0 && (
                          <>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-muted-foreground text-[10px]">
                              Proj. <span className="font-medium">{formatCompactRevenue(customer.perf.projectionAnnual)}/an</span>
                            </span>
                          </>
                        )}
                      </div>
                      {customer.nextAction && (
                        <p className="text-[10px] text-primary font-medium mt-0.5 truncate">→ {customer.nextAction}</p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0" onClick={e => e.preventDefault()}>
                      <a href={`tel:${customer.phone}`} onClick={e => e.stopPropagation()}>
                        <Button variant="outline" size="icon" className="h-9 w-9">
                          <Phone className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
                        target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                        <Button variant="outline" size="icon" className="h-9 w-9">
                          <Navigation className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="py-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            {customers.length === 0 ? 'Aucun compte enregistré' : 'Aucun résultat'}
          </p>
        </div>
      )}

      <NewCustomerSheet open={sheetOpen} onOpenChange={setSheetOpen} onSubmit={handleCreate} />
    </div>
  );
}
