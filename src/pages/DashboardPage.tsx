import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  CheckSquare,
  TrendingUp,
  FileText,
  Clock,
  AlertTriangle,
  Plus,
  ArrowRight,
  Users,
  Calendar,
} from 'lucide-react';
import { Link } from 'react-router-dom';

function StatCard({ title, value, icon: Icon, trend, variant = 'default' }: {
  title: string;
  value: string | number;
  icon: any;
  trend?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}) {
  const bgMap = {
    default: 'bg-card',
    primary: 'bg-primary/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
  };
  const iconBgMap = {
    default: 'bg-muted',
    primary: 'bg-primary/20',
    success: 'bg-success/20',
    warning: 'bg-warning/20',
  };
  const iconColorMap = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
  };

  return (
    <Card className={`${bgMap[variant]} border-none shadow-sm`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 font-heading text-2xl font-bold">{value}</p>
            {trend && <p className="mt-1 text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`rounded-lg p-2.5 ${iconBgMap[variant]}`}>
            <Icon className={`h-5 w-5 ${iconColorMap[variant]}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ title, icon: Icon, to }: { title: string; icon: any; to: string }) {
  return (
    <Link to={to}>
      <Button variant="outline" className="h-auto w-full flex-col gap-2 py-4 hover:border-primary hover:bg-primary/5">
        <Icon className="h-5 w-5 text-primary" />
        <span className="text-xs font-medium">{title}</span>
      </Button>
    </Link>
  );
}

export default function DashboardPage() {
  const { profile, role } = useAuth();

  const firstName = profile?.full_name?.split(' ')[0] || 'Commercial';

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-2xl font-bold">
          Bonjour, {firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici votre tableau de bord pour aujourd'hui
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Visites aujourd'hui" value={3} icon={MapPin} trend="2 complétées" variant="primary" />
        <StatCard title="Tâches en cours" value={7} icon={CheckSquare} trend="3 en retard" variant="warning" />
        <StatCard title="Opportunités ouvertes" value={12} icon={TrendingUp} trend="245 000 €" variant="success" />
        <StatCard title="Rapports cette semaine" value={8} icon={FileText} variant="default" />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-base">Actions rapides</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickAction title="Nouveau client" icon={Plus} to="/clients/nouveau" />
            <QuickAction title="Rapport de visite" icon={FileText} to="/rapports/nouveau" />
            <QuickAction title="Planifier tournée" icon={Calendar} to="/tournees" />
            <QuickAction title="Nouvelle tâche" icon={CheckSquare} to="/taches" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's visits */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="font-heading text-base">Visites du jour</CardTitle>
            <Link to="/tournees">
              <Button variant="ghost" size="sm" className="text-xs">
                Voir tout <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { client: 'Boulangerie Martin', time: '09:00', status: 'completed', address: '12 Rue de la Paix, Paris' },
              { client: 'Café du Commerce', time: '10:30', status: 'completed', address: '45 Av. des Champs, Lyon' },
              { client: 'Restaurant Le Gourmet', time: '14:00', status: 'planned', address: '8 Pl. Bellecour, Lyon' },
            ].map((visit, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{visit.client}</p>
                  <p className="text-xs text-muted-foreground truncate">{visit.address}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">{visit.time}</p>
                  <Badge variant={visit.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                    {visit.status === 'completed' ? 'Terminé' : 'Planifié'}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="font-heading text-base">Tâches à venir</CardTitle>
            <Link to="/taches">
              <Button variant="ghost" size="sm" className="text-xs">
                Voir tout <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { title: 'Envoyer devis Boulangerie Martin', due: 'Aujourd\'hui', priority: 'high' },
              { title: 'Relancer Café du Commerce', due: 'Demain', priority: 'medium' },
              { title: 'Préparer présentation nouveau produit', due: '15 Avr', priority: 'low' },
              { title: 'Mettre à jour fiche Restaurant Le Gourmet', due: '16 Avr', priority: 'medium' },
            ].map((task, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <div className={`h-2 w-2 shrink-0 rounded-full ${
                  task.priority === 'high' ? 'bg-destructive' : task.priority === 'medium' ? 'bg-warning' : 'bg-success'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {task.due}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent reports */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="font-heading text-base">Derniers rapports</CardTitle>
          <Link to="/rapports">
            <Button variant="ghost" size="sm" className="text-xs">
              Voir tout <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { client: 'Boulangerie Martin', date: '08 Avr 2026', purpose: 'Présentation nouveaux produits', contact: 'Pierre Martin' },
              { client: 'Café du Commerce', date: '07 Avr 2026', purpose: 'Suivi commande', contact: 'Marie Dupont' },
              { client: 'Librairie Centrale', date: '05 Avr 2026', purpose: 'Prospection', contact: 'Jean Lefèvre' },
            ].map((report, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{report.client}</p>
                  <p className="text-xs text-muted-foreground">{report.purpose} — {report.contact}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{report.date}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
