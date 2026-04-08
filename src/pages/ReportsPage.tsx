import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Calendar, User } from 'lucide-react';

const reports = [
  { id: '1', client: 'Boulangerie Martin', date: '08 Avr 2026', contact: 'Pierre Martin', purpose: 'Présentation nouveaux produits', summary: 'Le client est intéressé par la gamme bio. A demandé un devis détaillé pour 5 références.', nextAction: 'Envoyer devis avant le 12 avril' },
  { id: '2', client: 'Café du Commerce', date: '07 Avr 2026', contact: 'Marie Dupont', purpose: 'Suivi commande', summary: 'Commande livrée. Le client souhaite augmenter les volumes au prochain trimestre.', nextAction: 'Planifier visite fin avril' },
  { id: '3', client: 'Pharmacie du Centre', date: '03 Avr 2026', contact: 'Dr. Laurent', purpose: 'Prospection', summary: 'Premier contact positif. Intéressé par notre gamme parapharmacie.', nextAction: 'Envoyer documentation complète' },
  { id: '4', client: 'Librairie Centrale', date: '05 Avr 2026', contact: 'Jean Lefèvre', purpose: 'Négociation', summary: 'Discussion sur les conditions tarifaires. Le client compare avec un concurrent.', nextAction: 'Préparer offre spéciale' },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Rapports de visite</h1>
          <p className="text-sm text-muted-foreground">{reports.length} rapports</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau rapport
        </Button>
      </div>

      <div className="space-y-4">
        {reports.map((report) => (
          <Card key={report.id} className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
            <CardContent className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{report.client}</p>
                    <p className="text-sm text-muted-foreground">{report.purpose}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{report.date}</span>
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{report.contact}</span>
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{report.summary}</p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Badge variant="secondary">Prochaine action</Badge>
                <span className="text-muted-foreground">{report.nextAction}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
