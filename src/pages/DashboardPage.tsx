import { useState, useMemo } from 'react';
import { formatMonthly, formatAnnual, getRevenueTier, getRevenueTierColor } from '@/lib/revenueUtils';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import { TourMode } from '@/components/TourMode';
import {
  Play, Square, Phone, Navigation, AlertTriangle, ArrowRight,
  Sun, Flag, Target, TrendingUp, Eye, Calendar, RotateCcw, DollarSign, Sparkles,
  Inbox,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTourSession } from '@/contexts/TourSessionContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllCustomerRevenues } from '@/hooks/useCustomerPerformance';
import { analyzeCustomerPerformance, getStatusConfig, formatCompactRevenue, type PerformanceStatus } from '@/lib/performanceUtils';
import { computeVisitPriority, PRIORITY_CONFIGS } from '@/lib/priorityEngine';
import RouteOptimizerSheet from '@/components/RouteOptimizerSheet';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { profile, user, loading: authLoading } = useAuth();

  const [reportOpen, setReportOpen] = useState(false);
  const [activeClient, setActiveClient] = useState('');
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
  const { data: todayRoute } = useQuery({
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
      const routeId = routes[0].id;
      const { data: stops } = await supabase
        .from('route_stops')
        .select('id, customer_id, stop_order, status, notes')
        .eq('route_id', routeId)
        .order('stop_order', { ascending: true });
      return stops || [];
    },
    enabled: !authLoading && !!user,
  });

  // Map stop customer_ids to customer data
  const todayStops = useMemo(() => {
    if (!todayRoute || todayRoute.length === 0) return [];
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));
    return todayRoute
      .map(stop => {
        const customer = customerMap.get(stop.customer_id);
        if (!customer) return null;
        return { ...stop, customer };
      })
      .filter(Boolean) as Array<{
        id: string;
        customer_id: string;
        stop_order: number;
        status: string;
        notes: string | null;
        customer: typeof allCustomers[0];
      }>;
  }, [todayRoute, allCustomers]);

  // ─── Real urgent tasks ───
  const { data: realTasks = [] } = useQuery({
    queryKey: ['dashboard-urgent-tasks', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status, customer_id')
        .in('status', ['todo', 'in_progress'])
        .in('priority', ['high', 'urgent'])
        .order('due_date', { ascending: true })
        .limit(5);
      return data || [];
    },
    enabled: !authLoading && !!user,
  });

  const urgentTasksDisplay = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return realTasks.map(t => {
      let dueLabel = '';
      if (!t.due_date) {
        dueLabel = 'Sans date';
      } else {
        const d = new Date(t.due_date + 'T00:00:00');
        const diff = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) dueLabel = 'En retard';
        else if (diff === 0) dueLabel = "Aujourd'hui";
        else if (diff === 1) dueLabel = 'Demain';
        else dueLabel = format(d, 'dd/MM');
      }
      return { ...t, dueLabel };
    });
  }, [realTasks]);

  // ─── CA KPIs ───
  const caKpis = useMemo(() => {
    const clients = allCustomers.filter(c => c.customer_type !== 'prospect');
    let totalPotential = 0;
    let totalRealM1 = 0;
    let clientsWithData = 0;
    const statusCounts: Record<PerformanceStatus, number> = { optimise: 0, a_developper: 0, sous_exploite: 0, no_data: 0 };

    clients.forEach(c => {
      const revenue = Number(c.annual_revenue_potential || 0);
      const history = revenueMap?.get(c.id) || [];
      const perf = analyzeCustomerPerformance(revenue, history);
      totalPotential += perf.monthlyPotential;
      if (perf.caM1 !== null) {
        totalRealM1 += perf.caM1;
        clientsWithData++;
      }
      statusCounts[perf.status]++;
    });

    const avgCoverage = totalPotential > 0 ? (totalRealM1 / totalPotential) * 100 : 0;
    return { totalPotential, totalRealM1, avgCoverage, statusCounts, clientsWithData };
  }, [allCustomers, revenueMap]);

  // ─── Top priority clients ───
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
  const completedCount = todayStops.filter(s => s.status === 'completed').length;
  const targetMin = 8;
  const targetMax = 12;
  const overdueCount = urgentTasksDisplay.filter(t => t.dueLabel === 'En retard').length;

  const handleLaunchTour = () => {
    if (!session?.active && todayStops.length > 0) {
      const stops = todayStops.map(s => ({
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
      id: c.id,
      company_name: c.company_name,
      address: c.address || '',
      city: c.city || '',
      phone: c.phone || '',
      visit_frequency: c.visit_frequency || 'monthly',
      number_of_vehicles: c.number_of_vehicles || 0,
      annual_revenue_potential: Number(c.annual_revenue_potential || 0),
      latitude: c.latitude,
      longitude: c.longitude,
      sales_potential: c.sales_potential || 'C',
    }));
    return (
      <TourMode
        onExit={() => setTourMode(false)}
        allCustomers={tourCustomers}
      />
    );
  }

  const sessionCompletedCount = session ? Object.values(session.statuses).filter(s => s === 'completed').length : 0;
  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k€` : `${Math.round(v)}€`;

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">Bonjour, {firstName} 👋</h1>
        <p className="text-xs text-muted-foreground">
          {completedCount}/{todayStops.length} visites aujourd'hui · Objectif {targetMin}-{targetMax}
        </p>
      </div>

      {/* Active tour resume banner */}
      {session?.active && !tourMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Tournée en cours</p>
                <p className="text-xs text-muted-foreground">
                  {sessionCompletedCount} / {session.stops.length} visites complétées
                </p>
              </div>
              <Button size="sm" className="h-10 px-4 font-semibold shrink-0 gap-1.5" onClick={() => setTourMode(true)}>
                <RotateCcw className="h-4 w-4" />
                Reprendre
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CA Performance KPIs */}
      {caKpis.clientsWithData > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="font-heading text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Performance CA
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">CA potentiel</p>
                <p className="font-heading text-lg font-bold">{fmtK(caKpis.totalPotential)}</p>
                <p className="text-[10px] text-muted-foreground">/mois</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">CA réel M-1</p>
                <p className="font-heading text-lg font-bold">{fmtK(caKpis.totalRealM1)}</p>
                <p className="text-[10px] text-muted-foreground">/mois</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Couverture</p>
                <p className={`font-heading text-lg font-bold ${
                  caKpis.avgCoverage >= 80 ? 'text-accent' : caKpis.avgCoverage >= 40 ? 'text-warning' : 'text-destructive'
                }`}>{Math.round(caKpis.avgCoverage)}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                {caKpis.statusCounts.optimise} optimisés
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-warning inline-block" />
                {caKpis.statusCounts.a_developper} à développer
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
                {caKpis.statusCounts.sous_exploite} sous-exploités
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`font-heading text-2xl font-bold ${
              completedCount >= targetMin ? 'text-success' : completedCount > 0 ? 'text-primary' : 'text-muted-foreground'
            }`}>{completedCount}</p>
            <p className="text-[10px] text-muted-foreground">Visites</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="font-heading text-2xl font-bold text-warning">{overdueCount}</p>
            <p className="text-[10px] text-muted-foreground">En retard</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="font-heading text-2xl font-bold text-destructive">{caKpis.statusCounts.sous_exploite}</p>
            <p className="text-[10px] text-muted-foreground">Sous-exploités</p>
          </CardContent>
        </Card>
      </div>

      {/* Day control */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Progression du jour</span>
            </div>
            <span className="text-xs text-muted-foreground">{completedCount}/{todayStops.length}</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-3">
            <div className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${todayStops.length > 0 ? (completedCount / todayStops.length) * 100 : 0}%` }} />
          </div>
          {todayStops.length > 0 ? (
            !session?.active ? (
              <Button className="w-full h-14 font-bold text-base" onClick={handleLaunchTour}>
                <Sun className="h-5 w-5 mr-2" /> Lancer la tournée
              </Button>
            ) : (
              <Button className="w-full h-14 font-bold text-base gap-2" onClick={() => setTourMode(true)}>
                <RotateCcw className="h-5 w-5" /> Reprendre la tournée
              </Button>
            )
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground">Aucune tournée planifiée aujourd'hui</p>
              <Link to="/tournees">
                <Button variant="outline" size="sm" className="mt-2 text-xs">Planifier une tournée</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's visits */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm">Visites du jour</CardTitle>
          <Link to="/tournees">
            <Button variant="ghost" size="sm" className="text-xs h-8">
              Tournée <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          {todayStops.length === 0 ? (
            <div className="flex flex-col items-center py-4 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Aucune visite prévue aujourd'hui</p>
            </div>
          ) : (
            <>
              {todayStops.slice(0, 6).map((stop, i) => (
                <Link key={stop.id} to={`/clients/${stop.customer.id}`} className="block">
                  <div className={`flex items-center gap-2.5 rounded-lg p-2 transition-all hover:bg-accent/5 ${
                    stop.status === 'in_progress' ? 'bg-primary/5 border border-primary/20' : ''
                  }`}>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      stop.status === 'completed' ? 'bg-success/10 text-success' :
                      stop.status === 'in_progress' ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>{stop.status === 'completed' ? '✓' : i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{stop.customer.company_name}</p>
                      {Number(stop.customer.annual_revenue_potential || 0) > 0 && (
                        <p className={`text-[10px] font-medium ${getRevenueTierColor(getRevenueTier(Number(stop.customer.annual_revenue_potential)))}`}>
                          {formatMonthly(Number(stop.customer.annual_revenue_potential))}
                          <span className="font-normal text-muted-foreground ml-1">CA pot.</span>
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {todayStops.length > 6 && (
                <Link to="/tournees">
                  <p className="text-xs text-primary font-medium text-center py-1">
                    +{todayStops.length - 6} autres visites →
                  </p>
                </Link>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Top Priority Clients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-destructive" />
            Clients prioritaires
          </CardTitle>
          {topPriority.length > 0 && (
            <Button variant="default" size="sm" className="text-xs h-8 gap-1" onClick={() => setOptimizerOpen(true)}>
              <Sparkles className="h-3 w-3" /> Tournée intelligente
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          {topPriority.length === 0 ? (
            <div className="flex flex-col items-center py-4 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Aucun client prioritaire pour le moment</p>
            </div>
          ) : (
            topPriority.map(c => {
              const pc = PRIORITY_CONFIGS[c.priority.level];
              const effectiveCA = c.perf.caM1 ?? c.perf.latestKnownCA;
              return (
                <Link key={c.id} to={`/clients/${c.id}`} className="block">
                  <div className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-accent/5 transition-colors cursor-pointer">
                    <Badge className={`text-[9px] h-5 shrink-0 ${pc.bgColor} ${pc.color}`}>
                      {pc.emoji} {c.priority.score}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.company_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.city || ''} · CA pot. {fmtK(c.revenue / 12)}/mois
                        {effectiveCA !== null && effectiveCA > 0 && ` · Réel ${fmtK(effectiveCA)}`}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Urgent Tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Tâches urgentes
          </CardTitle>
          <Link to="/taches">
            <Button variant="ghost" size="sm" className="text-xs h-8">
              Tout <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          {urgentTasksDisplay.length === 0 ? (
            <div className="flex flex-col items-center py-4 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Aucune tâche urgente</p>
            </div>
          ) : (
            urgentTasksDisplay.map(task => (
              <div key={task.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  task.priority === 'urgent' ? 'bg-destructive' : 'bg-warning'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                </div>
                <Badge variant="secondary"
                  className={`text-[10px] shrink-0 ${task.dueLabel === 'En retard' ? 'bg-destructive/10 text-destructive' : ''}`}>
                  {task.dueLabel}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={activeClient} />
      <RouteOptimizerSheet open={optimizerOpen} onOpenChange={setOptimizerOpen} />
    </div>
  );
}
