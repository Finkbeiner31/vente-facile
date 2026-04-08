import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  Edit,
  FileText,
  CheckSquare,
  TrendingUp,
  User,
  Calendar,
  Clock,
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
  rep: 'Sophie Leclerc',
  notes: 'Client fidèle depuis 2020. Intéressé par les nouveaux produits bio.',
  contacts: [
    { name: 'Pierre Martin', role: 'Gérant', phone: '06 12 34 56 78', email: 'pierre@martin.fr', primary: true },
    { name: 'Marie Martin', role: 'Responsable achats', phone: '06 98 76 54 32', email: 'marie@martin.fr', primary: false },
  ],
};

const timeline = [
  { date: '08 Avr 2026', type: 'visit', title: 'Visite — Présentation nouveaux produits', detail: 'Rencontré Pierre Martin. Intéressé par la gamme bio.' },
  { date: '05 Avr 2026', type: 'task', title: 'Tâche terminée — Envoi catalogue', detail: 'Catalogue envoyé par email.' },
  { date: '01 Avr 2026', type: 'opportunity', title: 'Opportunité créée — Gamme bio 2026', detail: 'Montant estimé : 15 000 €' },
  { date: '25 Mar 2026', type: 'visit', title: 'Visite — Suivi commande', detail: 'Livraison confirmée pour le 28 mars.' },
  { date: '15 Mar 2026', type: 'note', title: 'Note ajoutée', detail: 'Le client souhaite augmenter les volumes au Q2.' },
];

const typeIcons: Record<string, any> = {
  visit: FileText,
  task: CheckSquare,
  opportunity: TrendingUp,
  note: Edit,
};

const typeColors: Record<string, string> = {
  visit: 'bg-primary/10 text-primary',
  task: 'bg-success/10 text-success',
  opportunity: 'bg-warning/10 text-warning',
  note: 'bg-info/10 text-info',
};

export default function CustomerDetailPage() {
  const { id } = useParams();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/clients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold">{customer.name}</h1>
            <Badge className="bg-success text-success-foreground">{customer.potential}</Badge>
            <Badge variant="default">Client</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{customer.sector} — {customer.address}</p>
        </div>
        <Button>
          <Edit className="mr-2 h-4 w-4" />
          Modifier
        </Button>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="text-muted-foreground">Adresse</p>
              <p className="font-medium">{customer.address}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="text-muted-foreground">Téléphone</p>
              <p className="font-medium">{customer.phone}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="text-muted-foreground">Dernière visite</p>
              <p className="font-medium">{customer.lastVisit}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="text-muted-foreground">Commercial</p>
              <p className="font-medium">{customer.rep}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList>
          <TabsTrigger value="timeline">Historique</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunités</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Fil d'activité</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-6 pl-6 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-border">
                {timeline.map((item, i) => {
                  const Icon = typeIcons[item.type];
                  return (
                    <div key={i} className="relative">
                      <div className={`absolute -left-6 flex h-6 w-6 items-center justify-center rounded-full ${typeColors[item.type]}`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium">{item.title}</p>
                          <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {customer.contacts.map((contact, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.role}</p>
                      </div>
                    </div>
                    {contact.primary && <Badge variant="secondary" className="text-[10px]">Principal</Badge>}
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{contact.phone}</div>
                    <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{contact.email}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="opportunities" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm">Gamme bio 2026</p>
                  <Badge className="bg-warning/10 text-warning">Négociation</Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                  <div>
                    <p>Montant estimé</p>
                    <p className="font-medium text-foreground">15 000 €</p>
                  </div>
                  <div>
                    <p>Probabilité</p>
                    <p className="font-medium text-foreground">60%</p>
                  </div>
                  <div>
                    <p>Clôture prévue</p>
                    <p className="font-medium text-foreground">30 Juin 2026</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm">{customer.notes}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
