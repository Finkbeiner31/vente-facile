import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTourSession } from '@/contexts/TourSessionContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { TourMode } from '@/components/TourMode';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Play, RotateCcw, MapPin, CheckCircle2, Clock,
  AlertTriangle, ArrowRight, Plus, Flame,
  Eye, Calendar,
} from 'lucide-react';

import { computeVisitStatus } from '@/lib/visitFrequencyUtils';
import { formatZoneName, useCommercialZones } from '@/hooks/useCommercialZones';

/* ────────────────────────── helpers ────────────────────────── */

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const todayDow = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }; // 0=Mon

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { profile, user, loading: authLoading } = useAuth();
  const { session, startSession } = useTourSession();
  const [tourMode, setTourMode] = useState(false);
  

  /* ── Zone du jour ── */
  const { data: zones = [] } = useCommercialZones();
  const { data: planning = [] } = useQuery({
    queryKey: ['dashboard-zone-planning', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('weekly_zone_planning')
        .select('day_of_week, zone_id')
        .eq('user_id', user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const todayZone = useMemo(() => {
    const dow = todayDow();
    const p = planning.find(p => p.day_of_week === dow);
    if (!p?.zone_id) return null;
    return zones.find(z => z.id === p.zone_id) || null;
  }, [planning, zones]);

  /* ── Customers ── */
  const { data: allCustomers = [] } = useQuery({
    queryKey: ['dashboard-customers', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, company_name, customer_type, last_visit_date, visit_frequency, latitude, longitude, city, phone, address, number_of_vehicles, annual_revenue_potential, sales_potential, zone');
      return data || [];
    },
    enabled: !!user,
  });

  /* ── Today's route stops ── */
  const { data: todayStops = [] } = useQuery({
    queryKey: ['dashboard-today-route', user?.id, todayStr()],
    queryFn: async () => {
      const { data: routes } = await supabase
        .from('routes')
        .select('id')
        .eq('rep_id', user!.id)
        .eq('route_date', todayStr())
        .eq('status', 'planned')
        .limit(1);
      if (!routes?.length) return [];
      const { data: stops } = await supabase
        .from('route_stops')
        .select('id, customer_id, stop_order, status')
        .eq('route_id', routes[0].id)
        .order('stop_order', { ascending: true });
      return stops || [];
    },
    enabled: !!user,
  });

  const todayVisits = useMemo(() => {
    if (!todayStops.length) return [];
    const map = new Map(allCustomers.map(c => [c.id, c]));
    return todayStops
      .map(s => ({ ...s, customer: map.get(s.customer_id) }))
      .filter(s => s.customer) as Array<typeof todayStops[0] & { customer: typeof allCustomers[0] }>;
  }, [todayStops, allCustomers]);

  const completedCount = todayVisits.filter(v => v.status === 'completed').length;
  const totalPlanned = todayVisits.length;
  const progressPct = totalPlanned > 0 ? (completedCount / totalPlanned) * 100 : 0;

  /* ── Urgent tasks ── */
  const { data: urgentTasks = [] } = useQuery({
    queryKey: ['dashboard-urgent-tasks', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status, customer_id')
        .in('status', ['todo', 'in_progress'])
        .lte('due_date', format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'))
        .order('due_date', { ascending: true })
        .limit(6);
      return data || [];
    },
    enabled: !!user,
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

    // Overdue clients across zones
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

    // Zones without visits this week
    const zonesWithVisits = new Set(todayVisits.map(v => v.customer?.zone).filter(Boolean));
    const unvisitedZones = zones.filter(z => !zonesWithVisits.has(z.system_name));
    if (unvisitedZones.length > 0 && zones.length > 0) {
      items.push({
        icon: Eye,
        text: `${unvisitedZones.length} zone${unvisitedZones.length > 1 ? 's' : ''} sans visite prévue`,
        color: 'text-warning',
        link: '/tournees',
      });
    }

    // No visits planned today
    if (totalPlanned === 0) {
      items.push({
        icon: Calendar,
        text: 'Aucune visite planifiée aujourd\'hui',
        color: 'text-muted-foreground',
        link: '/tournees',
      });
    }

    return items;
  }, [allCustomers, todayVisits, zones, totalPlanned]);

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
    const tourCustomers = allCustomers.map(c => ({
      id: c.id, company_name: c.company_name, address: c.address || '', city: c.city || '',
      phone: c.phone || '', visit_frequency: c.visit_frequency || 'monthly',
      number_of_vehicles: c.number_of_vehicles || 0,
      annual_revenue_potential: Number(c.annual_revenue_potential || 0),
      latitude: c.latitude, longitude: c.longitude, sales_potential: c.sales_potential || 'C',
    }));
    return <TourMode onExit={() => setTourMode(false)} allCustomers={tourCustomers} />;
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'Commercial';
  const sessionCompletedCount = session ? Object.values(session.statuses).filter(s => s === 'completed').length : 0;

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* ═══ GREETING ═══ */}
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">Bonjour, {firstName} 👋</h1>
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* ═══ A. MA JOURNÉE ═══ */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 space-y-3">
          {/* Zone + stats row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold truncate">
                {todayZone ? formatZoneName(todayZone) : 'Aucune zone assignée'}
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
          {session?.active ? (
            <Button className="w-full h-12 font-bold text-sm gap-2" onClick={() => setTourMode(true)}>
              <RotateCcw className="h-4 w-4" />
              Reprendre ma tournée ({sessionCompletedCount}/{session.stops.length})
            </Button>
          ) : totalPlanned > 0 ? (
            <Button className="w-full h-12 font-bold text-sm gap-2" onClick={handleLaunchTour}>
              <Play className="h-4 w-4" />
              Démarrer ma tournée
            </Button>
          ) : (
            <Link to="/tournees" className="block">
              <Button variant="outline" className="w-full h-12 font-bold text-sm gap-2">
                <Calendar className="h-4 w-4" />
                Planifier ma tournée
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* ═══ B. VISITES DU JOUR ═══ */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading text-sm font-semibold">Visites du jour</h2>
          <Link to="/tournees">
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
              Tournée <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>

        {todayVisits.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Aucune visite prévue</p>
              <Link to="/tournees">
                <Button variant="outline" size="sm" className="mt-3 text-xs">Planifier</Button>
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
                      {/* Step indicator */}
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

      {/* ═══ C. TÂCHES URGENTES ═══ */}
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
            <Link to="/taches" className="block">
              <Button variant="ghost" size="sm" className="w-full text-xs h-8 gap-1 text-muted-foreground">
                <Plus className="h-3 w-3" /> Ajouter une tâche
              </Button>
            </Link>
          </div>
        )}
      </section>

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
