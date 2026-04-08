import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Plus,
  Filter,
  MapPin,
  Phone,
  Mail,
  Building2,
  MoreVertical,
  Eye,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const demoCustomers = [
  { id: '1', name: 'Boulangerie Martin', type: 'client', sector: 'Alimentaire', city: 'Paris', phone: '01 42 33 44 55', email: 'contact@martin.fr', potential: 'A', lastVisit: '08 Avr 2026', rep: 'Sophie Leclerc' },
  { id: '2', name: 'Café du Commerce', type: 'client', sector: 'Restauration', city: 'Lyon', phone: '04 72 11 22 33', email: 'info@cafecommerce.fr', potential: 'B', lastVisit: '07 Avr 2026', rep: 'Sophie Leclerc' },
  { id: '3', name: 'Restaurant Le Gourmet', type: 'prospect', sector: 'Restauration', city: 'Lyon', phone: '04 78 99 88 77', email: 'legourmet@email.fr', potential: 'A', lastVisit: '—', rep: 'Sophie Leclerc' },
  { id: '4', name: 'Librairie Centrale', type: 'client', sector: 'Commerce', city: 'Marseille', phone: '04 91 55 66 77', email: 'central@librairie.fr', potential: 'C', lastVisit: '05 Avr 2026', rep: 'Marc Dubois' },
  { id: '5', name: 'Fleuriste Rose & Lys', type: 'prospect', sector: 'Commerce', city: 'Bordeaux', phone: '05 56 22 33 44', email: 'contact@roselys.fr', potential: 'B', lastVisit: '—', rep: 'Marc Dubois' },
  { id: '6', name: 'Pharmacie du Centre', type: 'client', sector: 'Santé', city: 'Toulouse', phone: '05 61 77 88 99', email: 'pharmacie.centre@email.fr', potential: 'A', lastVisit: '03 Avr 2026', rep: 'Sophie Leclerc' },
  { id: '7', name: 'Garage Auto Plus', type: 'client', sector: 'Automobile', city: 'Nantes', phone: '02 40 11 22 33', email: 'autoplus@garage.fr', potential: 'B', lastVisit: '01 Avr 2026', rep: 'Marc Dubois' },
  { id: '8', name: 'Cabinet Durand & Associés', type: 'prospect', sector: 'Services', city: 'Paris', phone: '01 45 67 89 00', email: 'contact@durand-associes.fr', potential: 'A', lastVisit: '—', rep: 'Sophie Leclerc' },
];

const potentialColors: Record<string, string> = {
  A: 'bg-success text-success-foreground',
  B: 'bg-warning text-warning-foreground',
  C: 'bg-muted text-muted-foreground',
};

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = demoCustomers.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || c.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Clients & Prospects</h1>
          <p className="text-sm text-muted-foreground">{demoCustomers.length} comptes au total</p>
        </div>
        <Link to="/clients/nouveau">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau client
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="client">Clients</SelectItem>
            <SelectItem value="prospect">Prospects</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Customer Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((customer) => (
          <Link key={customer.id} to={`/clients/${customer.id}`}>
            <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm group-hover:text-primary transition-colors">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.sector}</p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] ${potentialColors[customer.potential]}`}>
                    {customer.potential}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3" />
                    <span>{customer.city}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-3 w-3" />
                    <span>{customer.phone}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <Badge variant={customer.type === 'client' ? 'default' : 'secondary'} className="text-[10px]">
                    {customer.type === 'client' ? 'Client' : 'Prospect'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Dernière visite : {customer.lastVisit}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-sm text-muted-foreground">Aucun résultat trouvé</p>
        </div>
      )}
    </div>
  );
}
