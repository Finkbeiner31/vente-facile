import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import {
  ArrowLeft,
  Phone,
  Navigation,
  FileText,
  CheckSquare,
  TrendingUp,
  Edit,
  User,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
} from 'lucide-react';

const customer = {
  id: '1',
  name: 'Boulangerie Martin',
  type: 'client',
  sector: 'Alimentaire',
  address: '12 Rue de la Paix, 75002 Paris',
  phone: '01 42 33 44 55',
  email: 'contact@martin.fr',
  website: 'www.boulangerie-martin.fr',
  potential: 'A',
  status: 'actif',
  frequency: 'Bi-mensuelle',
  lastVisit: '08 Avr 2026',
  nextAction: 'Envoyer devis gamme bio',
  nextActionDate: '12 Avr 2026',
  rep: 'Sophie Leclerc',
  notes: 'Client fidèle depuis 2020. Intéressé par les nouveaux produits bio.',
  contacts: [
    { name: 'Pierre Martin', role: 'Gérant', phone: '06 12 34 56 78', email: 'pierre@martin.fr', primary: true },
    { name: 'Marie Martin', role: 'Responsable achats', phone: '06 98 76 54 32', email: 'marie@martin.fr', primary: false },
  ],
};

const timeline = [
  { date: '08 Avr', type: 'visit', title: 'Présentation nouveaux produits', detail: 'Intéressé par la gamme bio.' },
  { date: '05 Avr', type: 'task', title: 'Envoi catalogue', detail: 'Catalogue envoyé par email.' },
  { date: '01 Avr', type: 'opportunity', title: 'Gamme bio 2026 — 15 000 €', detail: 'En négociation' },
];

const typeColors: Record<string, string> = {
  visit: 'bg-primary/10 text-primary',
  task: 'bg-success/10 text-success',
  opportunity: 'bg-warning/10 text-warning',
};

export default function CustomerDetailPage() {
  const { id } = useParams();
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/clients">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-lg md:text-2xl font-bold truncate">{customer.name}</h1>
            <Badge className="bg-success text-success-foreground text-[10px] shrink-0">{customer.potential}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{customer.sector} · {customer.type === 'client' ? 'Client' : 'Prospect'}</p>
        </div>
      </div>

      {/* Quick Action Buttons - large touch targets */}
      <div className="grid grid-cols-4 gap-2">
        <a href={`tel:${customer.contacts[0]?.phone || customer.phone}`}>
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium">
            <Phone className="h-5 w-5 text-primary" />
            Appeler
          </Button>
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium">
            <Navigation className="h-5 w-5 text-primary" />
            Naviguer
          </Button>
        </a>
        <Button variant="outline" className="h-14 flex-col gap-1 text-xs font-medium" onClick={() => setReportOpen(true)}>
          <FileText className="h-5 w-5 text-primary" />
          Rapport
        </Button>
        <Link to="/taches">
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium">
            <CheckSquare className="h-5 w-5 text-primary" />
            Tâche
          </Button>
        </Link>
      </div>

      {/* Key Info - fast reading */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dernière visite</p>
            <p className="text-sm font-semibold mt-0.5">{customer.lastVisit}</p>
          </CardContent>
        </Card>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Prochaine action</p>
            <p className="text-sm font-semibold mt-0.5 truncate">{customer.nextActionDate}</p>
          </CardContent>
        </Card>
      </div>

      {/* Next Action Alert */}
      {customer.nextAction && (
        <Card className="border-primary/20">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Action à faire</p>
              <p className="text-sm font-medium truncate">{customer.nextAction}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact - click to call */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm">Contacts</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {customer.contacts.map((contact, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{contact.name}</p>
                  {contact.primary && <Badge variant="secondary" className="text-[9px] h-4">Principal</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground">{contact.role}</p>
              </div>
              <a href={`tel:${contact.phone}`}>
                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0">
                  <Phone className="h-4 w-4" />
                </Button>
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Address - click for GPS */}
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Card className="cursor-pointer hover:border-primary/30 transition-colors">
          <CardContent className="p-3 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm flex-1">{customer.address}</p>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </a>

      {/* Activity Timeline - compact */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm">Historique récent</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {timeline.map((item, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
              <Badge className={`text-[9px] shrink-0 ${typeColors[item.type]}`}>
                {item.date}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.title}</p>
                <p className="text-[11px] text-muted-foreground">{item.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <QuickReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        clientName={customer.name}
      />
    </div>
  );
}
