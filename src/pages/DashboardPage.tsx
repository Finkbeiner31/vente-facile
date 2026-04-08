import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import { TourMode } from '@/components/TourMode';
import {
  Play, Square, Phone, Navigation, AlertTriangle, ArrowRight,
  Sun, Flag, Target, TrendingUp, Eye, Calendar,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  generateRouteCycle,
  type CustomerForRouting,
} from '@/lib/routeCycleEngine';

const demoCustomers: CustomerForRouting[] = [
  { id: '1', company_name: 'Boulangerie Martin', address: '12 Rue de la Paix, Paris', city: 'Paris', phone: '01 42 33 44 55', visit_frequency: 'weekly', number_of_vehicles: 8, annual_revenue_potential: 28000, latitude: null, longitude: null, sales_potential: 'A' },
  { id: '2', company_name: 'Café du Commerce', address: '45 Av. des Champs, Lyon', city: 'Lyon', phone: '04 72 11 22 33', visit_frequency: 'weekly', number_of_vehicles: 5, annual_revenue_potential: 17500, latitude: null, longitude: null, sales_potential: 'B' },
  { id: '3', company_name: 'Restaurant Le Gourmet', address: '8 Pl. Bellecour, Lyon', city: 'Lyon', phone: '04 78 99 88 77', visit_frequency: 'biweekly', number_of_vehicles: 12, annual_revenue_potential: 42000, latitude: null, longitude: null, sales_potential: 'A' },
  { id: '4', company_name: 'Pharmacie du Centre', address: '22 Rue Nationale, Toulouse', city: 'Toulouse', phone: '05 61 77 88 99', visit_frequency: 'biweekly', number_of_vehicles: 3, annual_revenue_potential: 10500, latitude: null, longitude: null, sales_potential: 'B' },
  { id: '5', company_name: 'Garage Auto Plus', address: '8 Bd de la Prairie, Nantes', city: 'Nantes', phone: '02 40 11 22 33', visit_frequency: 'multiple_per_week', number_of_vehicles: 25, annual_revenue_potential: 87500, latitude: null, longitude: null, sales_potential: 'A' },
  { id: '6', company_name: 'SuperMarché Bio', address: '99 Av. de la République, Paris', city: 'Paris', phone: '01 55 66 77 88', visit_frequency: 'multiple_per_week', number_of_vehicles: 18, annual_revenue_potential: 63000, latitude: null, longitude: null, sales_potential: 'A' },
];

const urgentTasks = [
  { id: '1', title: 'Envoyer devis Boulangerie Martin', due: "Aujourd'hui", priority: 'high', client: 'Boulangerie Martin' },
  { id: '2', title: 'Relancer Garage Auto Plus', due: 'Demain', priority: 'medium', client: 'Garage Auto Plus' },
  { id: '3', title: 'Envoyer documentation Pharmacie', due: 'En retard', priority: 'high', client: 'Pharmacie du Centre' },
];

const neglectedHighPotential = [
  { id: '5', name: 'Garage Auto Plus', potential: '87.5k€', lastVisit: 'Il y a 12 jours', vehicles: 25 },
  { id: '3', name: 'Restaurant Le Gourmet', potential: '42k€', lastVisit: 'Il y a 18 jours', vehicles: 12 },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const cycle = useMemo(() => generateRouteCycle(demoCustomers), []);
  const todayStops = cycle[0] || [];

  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [activeClient, setActiveClient] = useState('');
  const [dayStarted, setDayStarted] = useState(false);

  const firstName = profile?.full_name?.split(' ')[0] || 'Commercial';
  const completedCount = todayStops.filter(s => statuses[s.customer.id] === 'completed').length;
  const inProgress = todayStops.find(s => statuses[s.customer.id] === 'in_progress');
  const targetMin = 8;
  const targetMax = 12;

  const handleStart = (id: string) => {
    setStatuses(prev => ({ ...prev, [id]: 'in_progress' }));
    if (!dayStarted) setDayStarted(true);
  };

  const handleEnd = (id: string, name: string) => {
    setStatuses(prev => ({ ...prev, [id]: 'completed' }));
    setActiveClient(name);
    setReportOpen(true);
  };

  const handleNextVisit = () => {
    const next = todayStops.find(s => !statuses[s.customer.id] || statuses[s.customer.id] === 'planned');
    if (next) handleStart(next.customer.id);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">Bonjour, {firstName} 👋</h1>
        <p className="text-xs text-muted-foreground">
          {completedCount}/{todayStops.length} visites aujourd'hui · Objectif {targetMin}-{targetMax}
        </p>
      </div>

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
            <p className="font-heading text-2xl font-bold text-warning">
              {urgentTasks.filter(t => t.due === 'En retard').length}
            </p>
            <p className="text-[10px] text-muted-foreground">En retard</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="font-heading text-2xl font-bold text-accent">{neglectedHighPotential.length}</p>
            <p className="text-[10px] text-muted-foreground">À revoir</p>
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
          <div className="flex gap-2">
            {!dayStarted && (
              <Button className="flex-1 h-12 font-semibold" onClick={() => { setDayStarted(true); handleNextVisit(); }}>
                <Sun className="h-4 w-4 mr-2" /> Démarrer la journée
              </Button>
            )}
            {dayStarted && !inProgress && completedCount < todayStops.length && (
              <Button className="flex-1 h-12 font-semibold" onClick={handleNextVisit}>
                <Play className="h-4 w-4 mr-2" /> Visite suivante
              </Button>
            )}
            {dayStarted && completedCount === todayStops.length && todayStops.length > 0 && (
              <Button variant="outline" className="flex-1 h-12 font-semibold border-success text-success"
                onClick={() => setDayStarted(false)}>
                <Flag className="h-4 w-4 mr-2" /> Journée terminée 🎉
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* In-progress visit */}
      {inProgress && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{inProgress.customer.company_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{inProgress.customer.address}</p>
              </div>
              <Button size="sm" variant="destructive" className="h-10 px-4 font-semibold shrink-0"
                onClick={() => handleEnd(inProgress.customer.id, inProgress.customer.company_name)}>
                <Square className="h-4 w-4 mr-1" /> Terminer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's visits - compact */}
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
          {todayStops.slice(0, 6).map((stop, i) => {
            const status = statuses[stop.customer.id] || 'planned';
            return (
              <div key={stop.customer.id} className={`flex items-center gap-2.5 rounded-lg p-2 transition-all ${
                status === 'in_progress' ? 'bg-primary/5 border border-primary/20' : ''
              }`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  status === 'completed' ? 'bg-success/10 text-success' :
                  status === 'in_progress' ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>{status === 'completed' ? '✓' : i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{stop.customer.company_name}</p>
                  {stop.customer.annual_revenue_potential > 0 && (
                    <p className="text-[10px] text-accent">{(stop.customer.annual_revenue_potential / 1000).toFixed(0)}k€/an</p>
                  )}
                </div>
                {status === 'planned' && (
                  <Button size="sm" className="h-8 px-3 text-xs shrink-0" onClick={() => handleStart(stop.customer.id)}>
                    <Play className="h-3 w-3 mr-1" /> Go
                  </Button>
                )}
              </div>
            );
          })}
          {todayStops.length > 6 && (
            <Link to="/tournees">
              <p className="text-xs text-primary font-medium text-center py-1">
                +{todayStops.length - 6} autres visites →
              </p>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Neglected high-potential */}
      {neglectedHighPotential.length > 0 && (
        <Card className="border-accent/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
            <CardTitle className="font-heading text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-accent" />
              Clients à haut potentiel négligés
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {neglectedHighPotential.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-accent/15 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.vehicles} véh. · {c.potential}/an · {c.lastVisit}</p>
                </div>
                <Badge className="bg-accent/15 text-accent text-[10px] shrink-0">Prioritaire</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
          {urgentTasks.map(task => (
            <div key={task.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                task.priority === 'high' ? 'bg-destructive' : 'bg-warning'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
              </div>
              <Badge variant="secondary"
                className={`text-[10px] shrink-0 ${task.due === 'En retard' ? 'bg-destructive/10 text-destructive' : ''}`}>
                {task.due}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={activeClient} />
    </div>
  );
}
