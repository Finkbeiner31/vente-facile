import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, CheckCircle, XCircle, Pause, Plus, Calendar } from 'lucide-react';

const todayStops = [
  { id: 1, client: 'Boulangerie Martin', address: '12 Rue de la Paix, Paris', time: '09:00', status: 'completed' },
  { id: 2, client: 'Café du Commerce', address: '45 Av. des Champs, Lyon', time: '10:30', status: 'completed' },
  { id: 3, client: 'Restaurant Le Gourmet', address: '8 Pl. Bellecour, Lyon', time: '14:00', status: 'planned' },
  { id: 4, client: 'Pharmacie du Centre', address: '22 Rue Nationale, Lyon', time: '15:30', status: 'planned' },
];

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  completed: { label: 'Terminé', icon: CheckCircle, className: 'bg-success/10 text-success' },
  planned: { label: 'Planifié', icon: Clock, className: 'bg-info/10 text-info' },
  postponed: { label: 'Reporté', icon: Pause, className: 'bg-warning/10 text-warning' },
  cancelled: { label: 'Annulé', icon: XCircle, className: 'bg-destructive/10 text-destructive' },
};

export default function RoutesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Tournées</h1>
          <p className="text-sm text-muted-foreground">Planifiez et suivez vos visites terrain</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle tournée
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's route */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="font-heading text-base">Aujourd'hui — 08 Avr 2026</CardTitle>
                  <p className="text-xs text-muted-foreground">4 arrêts · ~85 km · ~2h15</p>
                </div>
              </div>
              <Badge variant="secondary">En cours</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayStops.map((stop, i) => {
                const config = statusConfig[stop.status];
                const Icon = config.icon;
                return (
                  <div key={stop.id} className="flex items-center gap-4 rounded-lg border p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-sm font-bold">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{stop.client}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {stop.address}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{stop.time}</p>
                      <Badge className={`text-[10px] ${config.className}`}>
                        <Icon className="mr-1 h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Week overview */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Cette semaine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {['Lun 06', 'Mar 07', 'Mer 08', 'Jeu 09', 'Ven 10'].map((day, i) => (
              <div key={i} className={`flex items-center justify-between rounded-lg p-3 ${i === 2 ? 'bg-primary/10 border border-primary/20' : 'border'}`}>
                <span className={`text-sm font-medium ${i === 2 ? 'text-primary' : ''}`}>{day}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {i === 2 ? '4 visites' : i < 2 ? `${3 + i} visites` : `${2 + i} visites`}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
