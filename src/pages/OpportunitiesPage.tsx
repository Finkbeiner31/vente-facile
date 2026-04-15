import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, TrendingUp, DollarSign } from 'lucide-react';

const stages = [
  { name: 'Prospection', color: 'bg-info/10 text-info border-info/20' },
  { name: 'Qualification', color: 'bg-primary/10 text-primary border-primary/20' },
  { name: 'Proposition', color: 'bg-warning/10 text-warning border-warning/20' },
  { name: 'Négociation', color: 'bg-accent/10 text-accent border-accent/20' },
  { name: 'Gagné', color: 'bg-success/10 text-success border-success/20' },
];

const opportunities = [
  { id: '1', title: 'Gamme bio 2026', client: 'Boulangerie Martin', amount: 15000, probability: 60, stage: 'Négociation', closeDate: '30 Juin 2026' },
  { id: '2', title: 'Contrat fournitures Q3', client: 'Café du Commerce', amount: 8500, probability: 80, stage: 'Proposition', closeDate: '15 Mai 2026' },
  { id: '3', title: 'Parapharmacie complète', client: 'Pharmacie du Centre', amount: 25000, probability: 30, stage: 'Qualification', closeDate: '30 Sep 2026' },
  { id: '4', title: 'Équipement atelier', client: 'Garage Auto Plus', amount: 12000, probability: 45, stage: 'Prospection', closeDate: '30 Juil 2026' },
  { id: '5', title: 'Renouvellement annuel', client: 'Librairie Centrale', amount: 6000, probability: 90, stage: 'Négociation', closeDate: '30 Avr 2026' },
  { id: '6', title: 'Nouveau point de vente', client: 'Fleuriste Rose & Lys', amount: 18000, probability: 20, stage: 'Prospection', closeDate: '31 Déc 2026' },
];

const totalPipeline = opportunities.reduce((sum, o) => sum + o.amount, 0);
const weightedPipeline = opportunities.reduce((sum, o) => sum + (o.amount * o.probability / 100), 0);

export default function OpportunitiesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Opportunités</h1>
          <p className="text-sm text-muted-foreground">{opportunities.length} opportunités en cours</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle opportunité
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Pipeline total</p>
            <p className="font-heading text-2xl font-bold">{totalPipeline.toLocaleString('fr-FR')} €</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Pipeline pondéré</p>
            <p className="font-heading text-2xl font-bold">{weightedPipeline.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Nombre d'opportunités</p>
            <p className="font-heading text-2xl font-bold">{opportunities.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Kanban-like view */}
      <div className="hidden lg:grid lg:grid-cols-5 gap-4">
        {stages.map((stage) => {
          const stageOpps = opportunities.filter(o => o.stage === stage.name);
          return (
            <div key={stage.name} className="space-y-3">
              <div className={`rounded-lg border p-3 ${stage.color}`}>
                <p className="text-sm font-medium">{stage.name}</p>
                <p className="text-xs">{stageOpps.length} · {stageOpps.reduce((s, o) => s + o.amount, 0).toLocaleString('fr-FR')} €</p>
              </div>
              {stageOpps.map((opp) => (
                <Card key={opp.id} className="cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium">{opp.title}</p>
                    <p className="text-xs text-muted-foreground">{opp.client}</p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-medium">{opp.amount.toLocaleString('fr-FR')} €</span>
                      <Badge variant="secondary" className="text-[10px]">{opp.probability}%</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })}
      </div>

      {/* Mobile list */}
      <div className="lg:hidden space-y-3">
        {opportunities.map((opp) => (
          <Card key={opp.id} className="cursor-pointer hover:shadow-sm transition-all">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{opp.title}</p>
                <p className="text-xs text-muted-foreground">{opp.client}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium">{opp.amount.toLocaleString('fr-FR')} €</p>
                <Badge variant="secondary" className="text-[10px]">{opp.stage}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
