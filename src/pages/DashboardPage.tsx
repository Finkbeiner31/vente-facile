import { useState, useMemo } from 'react';
import { formatMonthly, getRevenueTier, getRevenueTierColor } from '@/lib/revenueUtils';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TourMode } from '@/components/TourMode';
import {
  ArrowRight, Sun, Target, RotateCcw, DollarSign,
  Sparkles, Inbox, AlertTriangle, MapPin, Calendar,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTourSession } from '@/contexts/TourSessionContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllCustomerRevenues } from '@/hooks/useCustomerPerformance';
import { analyzeCustomerPerformance, type PerformanceStatus } from '@/lib/performanceUtils';
import { computeVisitPriority, PRIORITY_CONFIGS } from '@/lib/priorityEngine';
import RouteOptimizerSheet from '@/components/RouteOptimizerSheet';
import { format } from 'date-fns';

function EmptyBlock({ icon: Icon, message, action }: { icon: React.ElementType; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { profile, user, loading: authLoading } = useAuth();
  const [tourMode, setTourMode] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const { session, startSession } = useTourSession();

  // ─── Real customers ───
  const { data: allCustomers = [] } = useQuery({
    queryKey: ['dashboard-customers', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, company_name, annual_revenue_potential, customer_type, last_visit_date, visit_frequency, latitude, longitude, city, phone, address, number_of_vehicles, sales_potential');
      return data || [];
    },
    enabled: !authLoading && !!user,
  });

  const { data: revenueMap } = useAllCustomerRevenues();

  // ─── Real today's route ───
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: todayStops = [] } = useQuery({
    queryKey: ['dashboard-today-route', user?.id, todayStr],
    queryFn: async () => {
      const { data: routes } = await supabase
        .from('routes')
        .select('id')
        .eq('rep_id', user!.id)
        .eq('route_date', todayStr)
        .eq('status', 'planned')
        .limit(1);
      if (!routes || routes.length === 0) return [];
      const { data: stops } = await supabase
        .from('route_stops')
        .select('id, customer_id, stop_order, status')
        .eq('route_id', routes[0].id)
        .order('stop_order', { ascending: true });
      return stops || [];
    },
    enabled: !authLoading && !!user,
  });

  const todayVisits = useMemo(() => {
    if (!todayStops.length) return [];
    const map = new Map(allCustomers.map(c => [c.id, c]));
    return todayStops
      .map(s => ({ ...s, customer: map.get(s.customer_id) }))
      .filter(s => s.customer) as Array<typeof todayStops[0] & { customer: typeof allCustomers[0] }>;
  }, [todayStops, allCustomers]);

  // ─── Real urgent tasks ───
  const { data: urgentTasks = [] } = useQuery({
    queryKey: ['dashboard-urgent-tasks', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status')
        .in('status', ['todo', 'in_progress'])
        .in('priority', ['high', 'urgent'])
        .order('due_date', { ascending: true })
        .limit(5);
      return data || [];
    },
    enabled: !authLoading && !!user,
  });

  const tasksDisplay = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return urgentTasks.map(t => {
      if (!t.due_date) return { ...t, label: 'Sans date', overdue: false };
      const d = new Date(t.due_date + 'T00:00:00');
      const diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
      if (diff < 0) return { ...t, label: 'En retard', overdue: true };
      if (diff === 0) return { ...t, label: "Aujourd'hui", overdue: false };
      if (diff === 1) return { ...t, label: 'Demain', overdue: false };
      return { ...t, label: format(d, 'dd/MM'), overdue: false };
    });
  }, [urgentTasks]);

  // ─── CA KPIs ───
  const caKpis = useMemo(() => {
    const clients = allCustomers.filter(c => c.customer_type !== 'prospect' && c.customer_type !== 'prospect_qualifie');
    let totalPotential = 0;
    let totalRealM1 = 0;
    let clientsWithData = 0;

    clients.forEach(c => {
      const revenue = Number(c.annual_revenue_potential || 0);
      const history = revenueMap?.get(c.id) || [];
      const perf = analyzeCustomerPerformance(revenue, history);
      totalPotential += perf.monthlyPotential;
      if (perf.caM1 !== null) {
        totalRealM1 += perf.caM1;
        clientsWithData++;
      }
    });

    const coverage = totalPotential > 0 ? (totalRealM1 / totalPotential) * 100 : 0;
    return { totalPotential, totalRealM1, coverage, clientsWithData };
  }, [allCustomers, revenueMap]);

  // ─── Top 5 priority clients ───
  const topPriority = useMemo(() => {
    return allCustomers
      .map(c => {
        const revenue = Number(c.annual_revenue_potential || 0);
        const history = revenueMap?.get(c.id) || [];
        const perf = analyzeCustomerPerformance(revenue, history);
        const priority = computeVisitPriority(perf, c.last_visit_date, c.visit_frequency, null, null, c.latitude, c.longitude);
        return { ...c, perf, priority, revenue };
      })
      .sort((a, b) => b.priority.score - a.priority.score)
      .slice(0, 5);
  }, [allCustomers, revenueMap]);

  const firstName = profile?.full_name?.split(' ')[0] || 'Commercial';

  // ─── Tour mode ───
  const handleLaunchTour = () => {
    if (!session?.active && todayVisits.length > 0) {
      const stops = todayVisits.map(s => ({
        customer: {
          id: s.customer.id,
          company_name: s.customer.company_name,
          address: s.customer.address || '',
          city: s.customer.city || '',
          phone: s.customer.phone || '',
          visit_frequency: s.customer.visit_frequency || 'monthly',
          number_of_vehicles: s.customer.number_of_vehicles || 0,
          annual_revenue_potential: Number(s.customer.annual_revenue_potential || 0),
          latitude: s.customer.latitude,
          longitude: s.customer.longitude,
          sales_potential: s.customer.sales_potential || 'C',
        },
        priority: s.stop_order,
      }));
      startSession(0, stops);
    }
    setTourMode(true);
  };

  if (tourMode && session?.active) {
    const tourCustomers = allCustomers.map(c => ({
      id: c.id, company_name: c.company_name, address: c.address || '', city: c.city || '',
      phone: c.phone || '', visit_frequency: c.visit_frequency || 'monthly',
      number_of_vehicles: c.number_of_vehicles || 0,
      annual_revenue_potential: Number(c.annual_revenue_potential || 0),
      latitude: c.latitude, longitude: c.longitude, sales_potential: c.sales_potential || 'C',
    }));
    return <TourMode onExit={() => setTourMode(false)} allCustomers={tourCustomers} />;
  }

  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k€` : `${Math.round(v)}€`;
  const sessionCount = session ? Object.values(session.statuses).filter(s => s === 'completed').length : 0;

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">Bonjour, {firstName} 👋</h1>
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Resume tour banner */}
      {session?.active && !tourMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Tournée en cours</p>
              <p className="text-xs text-muted-foreground">{sessionCount}/{session.stops.length} visites</p>
            </div>
            <Button size="sm" className="h-9 px-4 font-semibold gap-1.5" onClick={() => setTourMode(true)}>
              <RotateCcw className="h-4 w-4" /> Reprendre
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ A. VISITES DU JOUR ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Visites du jour
          </CardTitle>
          <Link to="/tournees">
            <Button variant="ghost" size="sm" className="text-xs h-7">
              Tournée <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {todayVisits.length === 0 ? (
            <EmptyBlock
              icon={Inbox}
              message="Aucune visite prévue aujourd'hui"
              action={
                <Link to="/tournees">
                  <Button variant="outline" size="sm" className="text-xs">Planifier une tournée</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-1.5">
              {/* Start button */}
              {!session?.active && todayVisits.length > 0 && (
                <Button className="w-full h-12 font-bold text-sm mb-2" onClick={handleLaunchTour}>
                  <Sun className="h-4 w-4 mr-2" /> Démarrer la journée ({todayVisits.length} visites)
                </Button>
              )}
              {todayVisits.slice(0, 5).map((stop, i) => (
                <Link key={stop.id} to={`/clients/${stop.customer.id}`} className="block">
                  <div className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-accent/5 transition-colors">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      stop.status === 'completed' ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'
                    }`}>{stop.status === 'completed' ? '✓' : i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{stop.customer.company_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {stop.customer.city}
                        {Number(stop.customer.annual_revenue_potential || 0) > 0 &&
                          ` · ${formatMonthly(Number(stop.customer.annual_revenue_potential))}`}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  </div>
                </Link>
              ))}
              {todayVisits.length > 5 && (
                <Link to="/tournees">
                  <p className="text-xs text-primary font-medium text-center py-1">
                    +{todayVisits.length - 5} autres →
                  </p>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ B. CLIENTS PRIORITAIRES ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-destructive" />
            Clients prioritaires
          </CardTitle>
          <div className="flex gap-1.5">
            {topPriority.length > 0 && (
              <Button variant="default" size="sm" className="text-xs h-7 gap-1" onClick={() => setOptimizerOpen(true)}>
                <Sparkles className="h-3 w-3" /> Tournée intelligente
              </Button>
            )}
            <Link to="/clients">
              <Button variant="ghost" size="sm" className="text-xs h-7">
                Tous <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {topPriority.length === 0 ? (
            <EmptyBlock
              icon={Target}
              message="Aucun client prioritaire"
              action={
                <Link to="/clients">
                  <Button variant="outline" size="sm" className="text-xs">Importer des clients</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-1.5">
              {topPriority.map(c => {
                const pc = PRIORITY_CONFIGS[c.priority.level];
                return (
                  <Link key={c.id} to={`/clients/${c.id}`} className="block">
                    <div className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-accent/5 transition-colors">
                      <Badge className={`text-[9px] h-5 shrink-0 ${pc.bgColor} ${pc.color}`}>
                        {pc.emoji} {c.priority.score}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.company_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {c.city || '—'}
                          {c.revenue > 0 && ` · ${fmtK(c.revenue / 12)}/mois`}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ C. TÂCHES URGENTES ═══ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Tâches urgentes
          </CardTitle>
          <Link to="/taches">
            <Button variant="ghost" size="sm" className="text-xs h-7">
              Toutes <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {tasksDisplay.length === 0 ? (
            <EmptyBlock icon={Inbox} message="Aucune tâche urgente" />
          ) : (
            <div className="space-y-1.5">
              {tasksDisplay.map(t => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    t.overdue ? 'bg-destructive' : t.priority === 'urgent' ? 'bg-destructive' : 'bg-warning'
                  }`} />
                  <p className="text-sm font-medium truncate flex-1">{t.title}</p>
                  <Badge variant="secondary"
                    className={`text-[10px] shrink-0 ${t.overdue ? 'bg-destructive/10 text-destructive' : ''}`}>
                    {t.label}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ D. PERFORMANCE CA ═══ */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Performance CA
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {caKpis.totalPotential === 0 && caKpis.clientsWithData === 0 ? (
            <EmptyBlock
              icon={DollarSign}
              message="Aucun CA renseigné"
              action={
                <Link to="/ca-import">
                  <Button variant="outline" size="sm" className="text-xs">Importer l'historique CA</Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Potentiel</p>
                <p className="font-heading text-lg font-bold mt-1">{fmtK(caKpis.totalPotential)}</p>
                <p className="text-[10px] text-muted-foreground">/mois</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">CA M-1</p>
                <p className="font-heading text-lg font-bold mt-1">{fmtK(caKpis.totalRealM1)}</p>
                <p className="text-[10px] text-muted-foreground">/mois</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Couverture</p>
                <p className={`font-heading text-lg font-bold mt-1 ${
                  caKpis.coverage >= 80 ? 'text-accent' : caKpis.coverage >= 40 ? 'text-warning' : 'text-destructive'
                }`}>{Math.round(caKpis.coverage)}%</p>
                <p className="text-[10px] text-muted-foreground">réel / pot.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <RouteOptimizerSheet open={optimizerOpen} onOpenChange={setOptimizerOpen} />
    </div>
  );
}
