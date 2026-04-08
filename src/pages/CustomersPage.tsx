import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Plus, Phone, Navigation, Building2, Car,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMonthly, getRevenueTier, getRevenueTierColor } from '@/lib/revenueUtils';
import { NewCustomerSheet } from '@/components/NewCustomerSheet';
import { toast } from 'sonner';

type CustomerStatus = 'prospect' | 'client_actif' | 'client_inactif';

interface DemoCustomer {
  id: string;
  name: string;
  status: CustomerStatus;
  sector: string;
  city: string;
  phone: string;
  potential: string;
  lastVisit: string;
  nextAction: string | null;
  address: string;
  vehicles: number;
  revenue: number;
}

const statusConfig: Record<CustomerStatus, { label: string; class: string }> = {
  prospect: { label: 'Prospect', class: 'bg-warning/15 text-warning' },
  client_actif: { label: 'Client actif', class: 'bg-accent/15 text-accent' },
  client_inactif: { label: 'Inactif', class: 'bg-muted text-muted-foreground' },
};

const demoCustomers: DemoCustomer[] = [
  { id: '1', name: 'Boulangerie Martin', status: 'client_actif', sector: 'Alimentaire', city: 'Paris', phone: '01 42 33 44 55', potential: 'A', lastVisit: '08 Avr', nextAction: 'Envoyer devis', address: '12 Rue de la Paix, Paris', vehicles: 8, revenue: 28000 },
  { id: '5', name: 'Garage Auto Plus', status: 'client_actif', sector: 'Automobile', city: 'Nantes', phone: '02 40 11 22 33', potential: 'A', lastVisit: '27 Mar', nextAction: 'Relancer', address: '8 Bd de la Prairie, Nantes', vehicles: 25, revenue: 87500 },
  { id: '3', name: 'Restaurant Le Gourmet', status: 'prospect', sector: 'Restauration', city: 'Lyon', phone: '04 78 99 88 77', potential: 'A', lastVisit: '—', nextAction: 'Premier contact', address: '8 Pl. Bellecour, Lyon', vehicles: 12, revenue: 42000 },
  { id: '8', name: 'SuperMarché Bio', status: 'client_actif', sector: 'Commerce', city: 'Paris', phone: '01 55 66 77 88', potential: 'A', lastVisit: '05 Avr', nextAction: null, address: '99 Av. de la République, Paris', vehicles: 18, revenue: 63000 },
  { id: '2', name: 'Café du Commerce', status: 'client_actif', sector: 'Restauration', city: 'Lyon', phone: '04 72 11 22 33', potential: 'B', lastVisit: '07 Avr', nextAction: 'Relancer', address: '45 Av. des Champs, Lyon', vehicles: 5, revenue: 17500 },
  { id: '4', name: 'Pharmacie du Centre', status: 'client_actif', sector: 'Santé', city: 'Toulouse', phone: '05 61 77 88 99', potential: 'B', lastVisit: '03 Avr', nextAction: 'Envoyer doc', address: '22 Rue Nationale, Toulouse', vehicles: 3, revenue: 10500 },
  { id: '6', name: 'Librairie Centrale', status: 'client_inactif', sector: 'Commerce', city: 'Marseille', phone: '04 91 55 66 77', potential: 'C', lastVisit: '05 Avr', nextAction: null, address: '15 Rue St-Ferréol, Marseille', vehicles: 2, revenue: 7000 },
  { id: '7', name: 'Studio Créatif', status: 'prospect', sector: 'Services', city: 'Bordeaux', phone: '05 56 33 44 55', potential: 'B', lastVisit: '—', nextAction: 'Appel découverte', address: '3 Rue Ste-Catherine, Bordeaux', vehicles: 4, revenue: 14000 },
];

const potentialColors: Record<string, string> = {
  A: 'bg-accent/15 text-accent',
  B: 'bg-warning/15 text-warning',
  C: 'bg-muted text-muted-foreground',
};

type FilterTab = 'tous' | 'clients' | 'prospects';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('tous');
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = demoCustomers
    .filter(c => {
      if (tab === 'clients') return c.status === 'client_actif' || c.status === 'client_inactif';
      if (tab === 'prospects') return c.status === 'prospect';
      return true;
    })
    .filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase())
    );

  const counts = {
    tous: demoCustomers.length,
    clients: demoCustomers.filter(c => c.status === 'client_actif' || c.status === 'client_inactif').length,
    prospects: demoCustomers.filter(c => c.status === 'prospect').length,
  };

  const handleCreate = (data: any) => {
    toast.success(`${data.company_name} créé comme ${statusConfig[data.customer_type as CustomerStatus].label}`);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl md:text-2xl font-bold">Clients</h1>
          <p className="text-xs text-muted-foreground">{filtered.length} comptes · trié par potentiel</p>
        </div>
        <Button size="sm" className="h-10 px-4 font-semibold" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Nouveau
        </Button>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as FilterTab)}>
        <TabsList className="w-full">
          <TabsTrigger value="tous" className="flex-1 text-xs">Tous ({counts.tous})</TabsTrigger>
          <TabsTrigger value="clients" className="flex-1 text-xs">Clients ({counts.clients})</TabsTrigger>
          <TabsTrigger value="prospects" className="flex-1 text-xs">Prospects ({counts.prospects})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-11" />
      </div>

      <div className="space-y-2">
        {filtered.map(customer => {
          const sc = statusConfig[customer.status];
          return (
            <Card key={customer.id} className={`transition-all hover:border-primary/30 ${
              customer.potential === 'A' ? 'border-l-2 border-l-accent' : ''
            }`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Link to={`/clients/${customer.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{customer.name}</p>
                        <Badge className={`text-[9px] h-4 ${potentialColors[customer.potential]}`}>{customer.potential}</Badge>
                        <Badge className={`text-[9px] h-4 ${sc.class}`}>{sc.label}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{customer.city}</span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Car className="h-2.5 w-2.5" /> {customer.vehicles}
                        </span>
                        <span>·</span>
                        <span className={`font-semibold ${getRevenueTierColor(getRevenueTier(customer.revenue))}`}>{formatMonthly(customer.revenue)}</span>
                      </div>
                      {customer.nextAction && (
                        <p className="text-[10px] text-primary font-medium mt-0.5 truncate">→ {customer.nextAction}</p>
                      )}
                    </div>
                  </Link>
                  <div className="flex gap-1.5 shrink-0">
                    <a href={`tel:${customer.phone}`}>
                      <Button variant="outline" size="icon" className="h-9 w-9">
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
                      target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="icon" className="h-9 w-9">
                        <Navigation className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">Aucun résultat</p>
        </div>
      )}

      <NewCustomerSheet open={sheetOpen} onOpenChange={setSheetOpen} onSubmit={handleCreate} />
    </div>
  );
}
