import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import {
  MapPin,
  CheckSquare,
  TrendingUp,
  Play,
  Square,
  Clock,
  AlertTriangle,
  Phone,
  Navigation,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const todayVisits = [
  { id: '1', client: 'Boulangerie Martin', address: '12 Rue de la Paix, Paris', time: '09:00', status: 'completed', phone: '01 42 33 44 55' },
  { id: '2', client: 'Café du Commerce', address: '45 Av. des Champs, Lyon', time: '10:30', status: 'completed', phone: '04 72 11 22 33' },
  { id: '3', client: 'Restaurant Le Gourmet', address: '8 Pl. Bellecour, Lyon', time: '14:00', status: 'planned', phone: '04 78 99 88 77' },
  { id: '4', client: 'Pharmacie du Centre', address: '22 Rue Nationale, Lyon', time: '15:30', status: 'planned', phone: '05 61 77 88 99' },
];

const urgentTasks = [
  { id: '1', title: 'Envoyer devis Boulangerie Martin', due: "Aujourd'hui", priority: 'high', client: 'Boulangerie Martin' },
  { id: '2', title: 'Relancer Café du Commerce', due: 'Demain', priority: 'medium', client: 'Café du Commerce' },
  { id: '3', title: 'Envoyer documentation Pharmacie', due: 'En retard', priority: 'high', client: 'Pharmacie du Centre' },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const [visits, setVisits] = useState(todayVisits);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [activeVisitClient, setActiveVisitClient] = useState('');

  const firstName = profile?.full_name?.split(' ')[0] || 'Commercial';
  const completed = visits.filter(v => v.status === 'completed').length;
  const inProgress = visits.find(v => v.status === 'in_progress');

  const handleStartVisit = (id: string) => {
    setVisits(prev => prev.map(v => v.id === id ? { ...v, status: 'in_progress' } : v));
  };

  const handleEndVisit = (id: string, clientName: string) => {
    setVisits(prev => prev.map(v => v.id === id ? { ...v, status: 'completed' } : v));
    setActiveVisitClient(clientName);
    setReportDialogOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* Greeting - compact on mobile */}
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">
          Bonjour, {firstName} 👋
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          {completed}/{visits.length} visites · {urgentTasks.length} tâches urgentes
        </p>
      </div>

      {/* In-progress visit banner */}
      {inProgress && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Visite en cours</p>
                <p className="text-xs text-muted-foreground truncate">{inProgress.client}</p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="h-10 px-4 font-semibold"
                onClick={() => handleEndVisit(inProgress.id, inProgress.client)}
              >
                <Square className="h-4 w-4 mr-1.5" />
                Terminer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Visits */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm md:text-base">Visites du jour</CardTitle>
          <Link to="/tournees">
            <Button variant="ghost" size="sm" className="text-xs h-8">
              Tout voir <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {visits.map((visit) => (
            <div
              key={visit.id}
              className={`rounded-xl border p-3 transition-all ${
                visit.status === 'in_progress' ? 'border-primary/40 bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  visit.status === 'completed' ? 'bg-success/10 text-success' :
                  visit.status === 'in_progress' ? 'bg-primary/10 text-primary' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {visit.time.split(':')[0]}h
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{visit.client}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{visit.address}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-2.5">
                {visit.status === 'planned' && (
                  <Button
                    size="sm"
                    className="h-9 flex-1 font-semibold text-xs"
                    onClick={() => handleStartVisit(visit.id)}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Démarrer
                  </Button>
                )}
                {visit.status === 'in_progress' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-9 flex-1 font-semibold text-xs"
                    onClick={() => handleEndVisit(visit.id, visit.client)}
                  >
                    <Square className="h-3.5 w-3.5 mr-1" />
                    Terminer la visite
                  </Button>
                )}
                {visit.status === 'completed' && (
                  <Badge className="bg-success/10 text-success text-[10px]">
                    ✓ Terminé
                  </Badge>
                )}
                <a href={`tel:${visit.phone}`} className="shrink-0">
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                </a>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <Navigation className="h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Urgent Tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm md:text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Tâches urgentes
          </CardTitle>
          <Link to="/taches">
            <Button variant="ghost" size="sm" className="text-xs h-8">
              Tout voir <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {urgentTasks.map(task => (
            <div key={task.id} className="flex items-center gap-3 rounded-xl border p-3">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                task.priority === 'high' ? 'bg-destructive' : 'bg-warning'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
                <p className="text-[11px] text-muted-foreground">{task.client}</p>
              </div>
              <Badge
                variant="secondary"
                className={`text-[10px] shrink-0 ${
                  task.due === 'En retard' ? 'bg-destructive/10 text-destructive' : ''
                }`}
              >
                {task.due}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="font-heading text-xl font-bold text-primary">{completed}</p>
            <p className="text-[10px] text-muted-foreground">Visites</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="font-heading text-xl font-bold text-warning">3</p>
            <p className="text-[10px] text-muted-foreground">Tâches</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="font-heading text-xl font-bold text-success">12</p>
            <p className="text-[10px] text-muted-foreground">Opportunités</p>
          </CardContent>
        </Card>
      </div>

      <QuickReportDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        clientName={activeVisitClient}
      />
    </div>
  );
}
