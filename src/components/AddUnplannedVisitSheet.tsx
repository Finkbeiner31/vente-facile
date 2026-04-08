import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  UserPlus, Search, Building2, MapPin, Save, ListOrdered,
} from 'lucide-react';
import type { CustomerForRouting } from '@/lib/routeCycleEngine';

type InsertPosition = 'next' | 'end' | 'manual';

interface AddUnplannedVisitSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCustomers: CustomerForRouting[];
  currentIndex: number;
  totalStops: number;
  onAddProspect: (data: {
    company_name: string;
    city: string;
    address: string;
    contact_name: string;
    phone: string;
    number_of_vehicles: number;
    notes: string;
  }, position: InsertPosition, manualIndex?: number) => void;
  onAddExistingCustomer: (customer: CustomerForRouting, position: InsertPosition, manualIndex?: number) => void;
}

type Mode = 'choose' | 'prospect' | 'customer';

export function AddUnplannedVisitSheet({
  open, onOpenChange, existingCustomers, currentIndex, totalStops,
  onAddProspect, onAddExistingCustomer,
}: AddUnplannedVisitSheetProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [position, setPosition] = useState<InsertPosition>('next');
  const [search, setSearch] = useState('');

  // Prospect form
  const [form, setForm] = useState({
    company_name: '', city: '', address: '', contact_name: '', phone: '', number_of_vehicles: '', notes: '',
  });
  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const isValid = form.company_name.trim() && form.city.trim() && form.contact_name.trim();

  const filteredCustomers = existingCustomers.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(search.toLowerCase())
  );

  const reset = () => {
    setMode('choose');
    setPosition('next');
    setSearch('');
    setForm({ company_name: '', city: '', address: '', contact_name: '', phone: '', number_of_vehicles: '', notes: '' });
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const positionButtons = (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <ListOrdered className="h-3.5 w-3.5" />
        Insérer dans la tournée
      </p>
      <div className="flex gap-1.5">
        {[
          { value: 'next' as InsertPosition, label: 'Prochaine visite' },
          { value: 'end' as InsertPosition, label: 'Fin de journée' },
        ].map(p => (
          <Button
            key={p.value}
            variant="outline"
            size="sm"
            className={`flex-1 h-9 text-xs ${position === p.value ? 'bg-primary/10 border-primary/30 text-primary' : ''}`}
            onClick={() => setPosition(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-2xl px-5 pb-8 overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {mode === 'choose' ? 'Ajouter une visite imprévue' :
             mode === 'prospect' ? 'Nouveau prospect' : 'Client existant'}
          </SheetTitle>
        </SheetHeader>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('prospect')}
              className="w-full flex items-center gap-3 rounded-xl border border-border p-4 text-left active:bg-muted/50 transition-colors"
            >
              <div className="h-11 w-11 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <UserPlus className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold">Prospect non prévu</p>
                <p className="text-xs text-muted-foreground">Créer un nouveau prospect rencontré</p>
              </div>
            </button>
            <button
              onClick={() => setMode('customer')}
              className="w-full flex items-center gap-3 rounded-xl border border-border p-4 text-left active:bg-muted/50 transition-colors"
            >
              <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Client non prévu</p>
                <p className="text-xs text-muted-foreground">Ajouter un client existant à la tournée</p>
              </div>
            </button>
          </div>
        )}

        {mode === 'prospect' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Entreprise *</label>
              <Input value={form.company_name} onChange={e => set('company_name', e.target.value)}
                placeholder="Nom de l'entreprise" className="h-12 text-base mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Ville *</label>
                <Input value={form.city} onChange={e => set('city', e.target.value)}
                  placeholder="Ville" className="h-12 mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nb véhicules</label>
                <Input type="number" value={form.number_of_vehicles} onChange={e => set('number_of_vehicles', e.target.value)}
                  placeholder="0" className="h-12 mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Adresse</label>
              <Input value={form.address} onChange={e => set('address', e.target.value)}
                placeholder="Adresse (optionnel)" className="h-12 mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Contact *</label>
                <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
                  placeholder="Nom du contact" className="h-12 mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Téléphone</label>
                <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                  placeholder="06..." className="h-12 mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Note</label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Note courte..." rows={2} className="mt-1" />
            </div>

            {positionButtons}

            <Button onClick={() => {
              onAddProspect({ ...form, number_of_vehicles: parseInt(form.number_of_vehicles) || 0 }, position);
              handleClose(false);
            }} disabled={!isValid} className="w-full h-14 text-base font-bold">
              <Save className="h-5 w-5 mr-2" />
              Créer & ajouter à la tournée
            </Button>
          </div>
        )}

        {mode === 'customer' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un client..."
                className="h-12 pl-10 text-base"
                autoFocus
              />
            </div>

            {positionButtons}

            <div className="max-h-[40vh] overflow-y-auto space-y-1">
              {filteredCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun client trouvé</p>
              ) : (
                filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { onAddExistingCustomer(c, position); handleClose(false); }}
                    className="w-full text-left rounded-xl border border-border p-3 active:bg-muted/50 transition-colors"
                  >
                    <p className="text-sm font-semibold truncate">{c.company_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.city && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {c.city}
                        </span>
                      )}
                      {c.annual_revenue_potential > 0 && (
                        <span className="text-[10px] text-accent font-medium">
                          {(c.annual_revenue_potential / 1000).toFixed(0)}k€/an
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {mode !== 'choose' && (
          <Button variant="ghost" className="w-full mt-2 text-sm text-muted-foreground" onClick={() => setMode('choose')}>
            ← Retour
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
