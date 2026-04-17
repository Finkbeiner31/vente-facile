import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useTourSession } from '@/contexts/TourSessionContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { TourMode } from '@/components/TourMode';
import { useDailyTour } from '@/hooks/useDailyTour';
import { isReadOnly, canPerformAction, getRoleLabel, type AppRole } from '@/lib/permissions';
import { getCurrentWeekNumber, getTodayDow } from '@/lib/weekCycleUtils';
import { useCycleStartDate } from '@/hooks/useCycleStartDate';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Play, RotateCcw, MapPin, CheckCircle2, Clock,
  AlertTriangle, ArrowRight, Plus, Flame,
  Eye, Calendar, RefreshCw, Loader2,
} from 'lucide-react';

import { computeVisitStatus } from '@/lib/visitFrequencyUtils';
import { formatZoneName, useCommercialZones } from '@/hooks/useCommercialZones';

/* ────────────────────────── helpers ────────────────────────── */

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { profile, user, loading: authLoading, role: authRole } = useAuth();
  const { effectiveUserId, isImpersonating, impersonatedUser, effectiveRole } = useImpersonation();
  const { session, startSession } = useTourSession();
  const [tourMode, setTourMode] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  
  const activeUserId = effectiveUserId || user?.id;
  const role = (isImpersonating ? effectiveRole : authRole) as AppRole | null;
  const readOnly = isReadOnly(role);
  const canRunTour = canPerformAction(role, 'run_tournee');

  /* ── Daily Tour (auto-generated from planning) ── */
  const { dailyTour, isLoading: dailyTourLoading, autoGenerate, regenerate, isRegenerating, isGenerating } = useDailyTour(activeUserId);

  // Auto-generate daily tour if none exists
  useEffect(() => {
    if (!dailyTourLoading && dailyTour === null && activeUserId) {
      autoGenerate();
    }
  }, [dailyTourLoading, dailyTour, activeUserId, autoGenerate]);

  /* ── Fallback: read directly from weekly_zone_planning if no daily_tour ── */
  const { data: cycleStart } = useCycleStartDate();
  const currentWeek = useMemo(() => getCurrentWeekNumber(cycleStart), [cycleStart]);
  const currentDow = useMemo(() => getTodayDow(), []);
  const { data: zones = [] } = useCommercialZones();
  const isWeekdayToday = currentDow <= 5;

  const { data: planningFallback } = useQuery({
    queryKey: ['dashboard-planning-fallback', activeUserId, currentWeek, currentDow],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('weekly_zone_planning')
        .select('zone_id')
        .eq('user_id', activeUserId!)
        .eq('week_number', currentWeek)
        .eq('day_of_week', currentDow)
        .limit(1);
      return data?.[0]?.zone_id || null;
    },
    enabled: !!activeUserId && isWeekdayToday && !dailyTourLoading && !dailyTour,
  });

  // Fallback zone customers (when daily_tour has no stops but planning has a zone)
  const { data: fallbackCustomers = [] } = useQuery({
    queryKey: ['dashboard-fallback-customers', planningFallback, activeUserId],
    queryFn: async () => {
      if (!planningFallback || !activeUserId) return [];
      const zone = zones.find(z => z.id === planningFallback);
      if (!zone) return [];

      const filters: string[] = [];
      filters.push(`zone.eq.${zone.system_name}`);
      if (zone.cities?.length > 0) filters.push(`city.in.(${zone.cities.join(',')})`);
      if (zone.postal_codes?.length > 0) filters.push(`postal_code.in.(${zone.postal_codes.join(',')})`);

      const { data } = await supabase
        .from('customers')
        .select('id, company_name, address, city, phone, visit_frequency, number_of_vehicles, annual_revenue_potential, latitude, longitude, sales_potential, customer_type, last_visit_date, assigned_rep_id, management_mode, exceptional_commercial_id, visit_duration_minutes')
        .in('customer_type', ['client_actif', 'prospect_qualifie', 'prospect'])
        .in('account_status', ['active'])
        .or(filters.join(','))
        .order('annual_revenue_potential', { ascending: false, nullsFirst: false });

      // Filter by operational owner
      const myCustomers = (data || []).filter((c: any) => {
        if (c.management_mode === 'exceptional') return c.exceptional_commercial_id === activeUserId;
        return c.assigned_rep_id === activeUserId;
      });

      // Score and pick top 12 (same logic as useDailyTour / RoutesPage)
      const now = new Date();
      const scored = myCustomers.map((c: any) => {
        let priority = 0;
        const rev = Number(c.annual_revenue_potential || 0);
        priority += Math.min(rev / 1000, 100);
        if (c.sales_potential === 'A') priority += 30;
        else if (c.sales_potential === 'B') priority += 15;
        if (c.last_visit_date) {
          const daysSince = Math.floor((now.getTime() - new Date(c.last_visit_date).getTime()) / 86400000);
          if (daysSince > 30) priority += 25;
          else if (daysSince > 14) priority += 10;
        } else {
          priority += 20;
        }
        if (c.customer_type === 'prospect_qualifie') priority += 10;
        return { ...c, priority };
      });

      scored.sort((a: any, b: any) => b.priority - a.priority);
      return scored.slice(0, 12);
    },
    enabled: !!planningFallback && zones.length > 0 && !!activeUserId && !dailyTour,
  });


  const todayZone = useMemo(() => {
    // Daily tour zone takes priority
    if (dailyTour?.zone_id) return zones.find(z => z.id === dailyTour.zone_id) || null;
    // Fallback to planning zone
    if (planningFallback) return zones.find(z => z.id === planningFallback) || null;
    return null;
  }, [dailyTour, zones, planningFallback]);

  /* ── Visits from daily tour OR fallback ── */
  const todayVisits = useMemo(() => {
    // If daily tour has stops, use those
    if (dailyTour?.stops?.length) {
      return dailyTour.stops
        .filter(s => s.customer)
        .map(s => ({
          id: s.id,
          customer_id: s.customer_id,
          stop_order: s.stop_order,
          status: s.status,
          visit_duration_minutes: s.visit_duration_minutes,
          customer: s.customer!,
        }));
    }
    // Fallback: use planning-based customers
    if (fallbackCustomers.length > 0) {
      return fallbackCustomers.map((c: any, i: number) => ({
        id: c.id,
        customer_id: c.id,
        stop_order: i + 1,
        status: 'planned',
        visit_duration_minutes: c.visit_duration_minutes || null,
        customer: {
          id: c.id,
          company_name: c.company_name,
          address: c.address,
          city: c.city,
          phone: c.phone,
          visit_frequency: c.visit_frequency,
          number_of_vehicles: c.number_of_vehicles,
          annual_revenue_potential: c.annual_revenue_potential,
          latitude: c.latitude,
          longitude: c.longitude,
          sales_potential: c.sales_potential,
          customer_type: c.customer_type,
          last_visit_date: c.last_visit_date,
        },
      }));
    }
    return [];
  }, [dailyTour, fallbackCustomers]);

  const completedCount = todayVisits.filter(v => v.status === 'completed').length;
  const totalPlanned = todayVisits.length;
  const progressPct = totalPlanned > 0 ? (completedCount / totalPlanned) * 100 : 0;

  /* ── Customers (for alerts) ── */
  const { data: allCustomers = [] } = useQuery({
    queryKey: ['dashboard-customers', activeUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, company_name, customer_type, last_visit_date, visit_frequency, latitude, longitude, city, phone, address, number_of_vehicles, annual_revenue_potential, sales_potential, zone')
        .eq('assigned_rep_id', activeUserId!);
      return data || [];
    },
    enabled: !!activeUserId,
  });

  /* ── Urgent tasks ── */
  const { data: urgentTasks = [] } = useQuery({
    queryKey: ['dashboard-urgent-tasks', activeUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status, customer_id')
        .eq('assigned_to', activeUserId!)
        .in('status', ['todo', 'in_progress'])
        .lte('due_date', format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'))
        .order('due_date', { ascending: true })
        .limit(6);
      return data || [];
    },
    enabled: !!activeUserId,
  });

  const tasksDisplay = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return urgentTasks.map(t => {
      if (!t.due_date) return { ...t, dateLabel: '—', overdue: false };
      const d = new Date(t.due_date + 'T00:00:00');
      const diff = Math.floor((d.getTime() - now.getTime()) / 86400000);
      if (diff < 0) return { ...t, dateLabel: `J${diff}`, overdue: true };
      if (diff === 0) return { ...t, dateLabel: "Aujourd'hui", overdue: false };
      return { ...t, dateLabel: 'Demain', overdue: false };
    });
  }, [urgentTasks]);

  /* ── Smart alerts ── */
  const alerts = useMemo(() => {
    const items: { icon: React.ElementType; text: string; color: string; link?: string }[] = [];

    const overdueClients = allCustomers.filter(c => {
      if (c.customer_type === 'prospect') return false;
      const vs = computeVisitStatus(c.visit_frequency, c.last_visit_date);
      return vs.status === 'en_retard';
    });
    if (overdueClients.length > 0) {
      items.push({
        icon: Flame,
        text: `${overdueClients.length} client${overdueClients.length > 1 ? 's' : ''} en retard de visite`,
        color: 'text-destructive',
        link: '/clients',
      });
    }

    if (totalPlanned === 0 && !dailyTourLoading && !isGenerating) {
      items.push({
        icon: Calendar,
        text: 'Aucune visite planifiée aujourd\'hui',
        color: 'text-muted-foreground',
        link: '/tournees',
      });
    }

    return items;
  }, [allCustomers, totalPlanned, dailyTourLoading, isGenerating]);

  /* ── Tour mode launch ── */
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

  /* ── Tour mode view ── */
  if (tourMode && session?.active) {
    const tourCustomers = todayVisits.map(s => ({
      id: s.customer.id, company_name: s.customer.company_name, address: s.customer.address || '', city: s.customer.city || '',
      phone: s.customer.phone || '', visit_frequency: s.customer.visit_frequency || 'monthly',
      number_of_vehicles: s.customer.number_of_vehicles || 0,
      annual_revenue_potential: Number(s.customer.annual_revenue_potential || 0),
      latitude: s.customer.latitude, longitude: s.customer.longitude, sales_potential: s.customer.sales_potential || 'C',
    }));
    return <TourMode onExit={() => setTourMode(false)} allCustomers={tourCustomers} />;
  }

  const effectiveName = isImpersonating ? impersonatedUser?.full_name : profile?.full_name;
  const firstName = effectiveName?.split(' ')[0] || 'Commercial';
  const sessionCompletedCount = session ? Object.values(session.statuses).filter(s => s === 'completed').length : 0;

  const handleRegenerate = async () => {
    setConfirmRegenerate(false);
    await regenerate();
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* ═══ GREETING ═══ */}
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">Bonjour, {firstName} 👋</h1>
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          {readOnly && <span className="ml-2 text-primary font-medium">({getRoleLabel(role)} — lecture seule)</span>}
        </p>
      </div>

      {/* ═══ ADMIN/MANAGER OVERVIEW SECTION ═══ */}
      {(role === 'admin' || role === 'manager') && (
        <AdminManagerOverview role={role} />
      )}

      {/* ═══ A. MA JOURNÉE ═══ */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 space-y-3">
          {/* Zone + stats row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold truncate">
                {dailyTourLoading || isGenerating ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
                  </span>
                ) : todayZone ? formatZoneName(todayZone) : 'Aucune zone assignée'}
              </span>
            </div>
            <Badge variant="secondary" className="text-xs font-bold shrink-0">
              {completedCount} / {totalPlanned} visites
            </Badge>
          </div>

          {/* Progress bar */}
          {totalPlanned > 0 && (
            <div className="space-y-1">
              <Progress value={progressPct} className="h-2" />
              <p className="text-[10px] text-muted-foreground text-right">
                {completedCount} réalisée{completedCount > 1 ? 's' : ''} sur {totalPlanned}
              </p>
            </div>
          )}

          {/* Main CTA */}
          {readOnly ? (
            <div className="text-center py-2">
              <p className="text-xs text-muted-foreground">Mode lecture seule — aucune action disponible</p>
            </div>
          ) : session?.active ? (
            <Button className="w-full h-12 font-bold text-sm gap-2" onClick={() => setTourMode(true)}>
              <RotateCcw className="h-4 w-4" />
              Reprendre ma tournée ({sessionCompletedCount}/{session.stops.length})
            </Button>
          ) : totalPlanned > 0 && canRunTour ? (
            <Button className="w-full h-12 font-bold text-sm gap-2" onClick={handleLaunchTour}>
              <Play className="h-4 w-4" />
              Démarrer ma tournée
            </Button>
          ) : canRunTour ? (
            <Link to="/tournees" className="block">
              <Button variant="outline" className="w-full h-12 font-bold text-sm gap-2">
                <Calendar className="h-4 w-4" />
                Planifier ma tournée
              </Button>
            </Link>
          ) : null}
        </CardContent>
      </Card>

      {/* ═══ B. VISITES DU JOUR ═══ */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading text-sm font-semibold">Visites du jour</h2>
          <div className="flex items-center gap-1">
            {dailyTour && (
              confirmRegenerate ? (
                <div className="flex items-center gap-1">
                  <Button variant="destructive" size="sm" className="text-xs h-7" onClick={handleRegenerate} disabled={isRegenerating}>
                    {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Confirmer
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setConfirmRegenerate(false)}>
                    Annuler
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-muted-foreground" onClick={() => setConfirmRegenerate(true)}>
                  <RefreshCw className="h-3 w-3" /> Regénérer
                </Button>
              )
            )}
            <Link to="/tournees">
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                Tournée <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>

        {(dailyTourLoading || isGenerating) ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Loader2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2 animate-spin" />
              <p className="text-sm text-muted-foreground">Génération de la tournée…</p>
            </CardContent>
          </Card>
        ) : todayVisits.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Aucune tournée prévue aujourd'hui</p>
              <Link to="/tournees">
                <Button variant="outline" size="sm" className="mt-3 text-xs">Planifier ma tournée</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {todayVisits.map((stop, i) => {
              const isDone = stop.status === 'completed';
              const isActive = stop.status === 'in_progress';
              return (
                <Link key={stop.id} to={`/clients/${stop.customer.id}`} className="block">
                  <Card className={`transition-colors hover:bg-accent/5 ${isDone ? 'opacity-60' : ''} ${isActive ? 'border-primary/40' : ''}`}>
                    <CardContent className="p-2.5 flex items-center gap-2.5">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isDone ? 'bg-accent/15 text-accent' : isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isDone ? 'line-through' : ''}`}>{stop.customer.company_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{stop.customer.city || '—'}</p>
                      </div>
                      <Badge variant="outline" className={`text-[9px] shrink-0 ${
                        isDone ? 'border-accent/30 text-accent' : isActive ? 'border-primary/30 text-primary' : 'border-muted'
                      }`}>
                        {isDone ? 'Terminé' : isActive ? 'En cours' : 'À faire'}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ C. TÂCHES URGENTES (hidden for observateur) ═══ */}
      {!readOnly && (
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading text-sm font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            Tâches urgentes
          </h2>
          <Link to="/taches">
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
              Toutes <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>

        {tasksDisplay.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="h-7 w-7 text-accent/40 mx-auto mb-1" />
              <p className="text-sm text-muted-foreground">Aucune tâche urgente</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {tasksDisplay.map(t => (
              <Card key={t.id} className={t.overdue ? 'border-destructive/30' : ''}>
                <CardContent className="p-2.5 flex items-center gap-2.5">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${
                    t.overdue ? 'bg-destructive' : t.priority === 'urgent' ? 'bg-destructive' : 'bg-warning'
                  }`} />
                  <p className="text-sm font-medium truncate flex-1">{t.title}</p>
                  <Badge variant="secondary" className={`text-[10px] shrink-0 ${
                    t.overdue ? 'bg-destructive/10 text-destructive' : ''
                  }`}>
                    {t.dateLabel}
                  </Badge>
                </CardContent>
              </Card>
            ))}
            {canPerformAction(role, 'create_task') && (
            <Link to="/taches" className="block">
              <Button variant="ghost" size="sm" className="w-full text-xs h-8 gap-1 text-muted-foreground">
                <Plus className="h-3 w-3" /> Ajouter une tâche
              </Button>
            </Link>
            )}
          </div>
        )}
      </section>
      )}

      {/* ═══ D. ALERTES INTELLIGENTES ═══ */}
      {alerts.length > 0 && (
        <section>
          <h2 className="font-heading text-sm font-semibold mb-2">Alertes</h2>
          <div className="space-y-1.5">
            {alerts.map((a, i) => (
              <Link key={i} to={a.link || '#'} className="block">
                <Card className="hover:bg-accent/5 transition-colors">
                  <CardContent className="p-2.5 flex items-center gap-2.5">
                    <a.icon className={`h-4 w-4 shrink-0 ${a.color}`} />
                    <p className="text-sm flex-1">{a.text}</p>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN / MANAGER OVERVIEW PANEL
   Shows team-level and management KPIs at the top of dashboard
   ═══════════════════════════════════════════════════════════════ */
function AdminManagerOverview({ role }: { role: AppRole }) {
  const { data: stats } = useQuery({
    queryKey: ['admin-overview-stats', role],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const [
        { count: totalCustomers },
        { count: totalProspects },
        { count: pendingConversions },
        { count: todayReports },
        { count: activeUsers },
      ] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('customer_type', 'client_actif').eq('account_status', 'active'),
        supabase.from('customers').select('*', { count: 'exact', head: true }).in('customer_type', ['prospect', 'prospect_qualifie']).eq('account_status', 'active'),
        supabase.from('conversion_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('visit_reports').select('*', { count: 'exact', head: true }).eq('visit_date', today),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      return {
        totalCustomers: totalCustomers || 0,
        totalProspects: totalProspects || 0,
        pendingConversions: pendingConversions || 0,
        todayReports: todayReports || 0,
        activeUsers: activeUsers || 0,
      };
    },
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-primary">{stats?.activeUsers ?? '–'}</p>
          <p className="text-[10px] text-muted-foreground">Utilisateurs actifs</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-lg font-bold">{stats?.totalCustomers ?? '–'}</p>
          <p className="text-[10px] text-muted-foreground">Clients actifs</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-lg font-bold">{stats?.totalProspects ?? '–'}</p>
          <p className="text-[10px] text-muted-foreground">Prospects</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-accent">{stats?.todayReports ?? '–'}</p>
          <p className="text-[10px] text-muted-foreground">Rapports aujourd'hui</p>
        </CardContent>
      </Card>
      {role === 'admin' && (
        <Card className={stats?.pendingConversions ? 'border-warning/40' : ''}>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-warning">{stats?.pendingConversions ?? '–'}</p>
            <p className="text-[10px] text-muted-foreground">Conversions en attente</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
