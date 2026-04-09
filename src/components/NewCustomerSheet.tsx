import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Building2, Save } from 'lucide-react';
import { formatMonthly, formatAnnual } from '@/lib/revenueUtils';
import { AddressAutocomplete, type AddressSelection } from '@/components/AddressAutocomplete';

interface NewCustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    company_name: string;
    city: string;
    address: string;
    postal_code: string;
    latitude: number | null;
    longitude: number | null;
    contact_name: string;
    phone: string;
    email: string;
    number_of_vehicles: number;
    notes: string;
    customer_type: 'prospect' | 'client_actif' | 'client_inactif';
  }) => Promise<void> | void;
  defaultType?: 'prospect' | 'client_actif' | 'client_inactif';
}

export function NewCustomerSheet({ open, onOpenChange, onSubmit, defaultType = 'prospect' }: NewCustomerSheetProps) {
  const getInitialForm = () => ({
    company_name: '',
    city: '',
    address: '',
    postal_code: '',
    latitude: null as number | null,
    longitude: null as number | null,
    contact_name: '',
    phone: '',
    email: '',
    number_of_vehicles: '',
    notes: '',
    customer_type: defaultType,
  });

  const [form, setForm] = useState(getInitialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setForm(getInitialForm());
  }, [defaultType, open]);

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const vehicles = parseInt(form.number_of_vehicles) || 0;
  const annualRevenue = vehicles * 3500;

  const isValid = form.company_name.trim() && form.city.trim();

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...form,
        number_of_vehicles: vehicles,
        latitude: form.latitude,
        longitude: form.longitude,
        postal_code: form.postal_code,
      });
      setForm(getInitialForm());
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[92vh] rounded-t-2xl px-5 pb-8 overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Nouveau compte
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Statut *</label>
            <Select value={form.customer_type} onValueChange={v => set('customer_type', v)}>
              <SelectTrigger className="h-12 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="client_actif">Client actif</SelectItem>
                <SelectItem value="client_inactif">Client inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

          {vehicles > 0 && (
            <div className="rounded-lg bg-accent/10 p-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">CA potentiel estimé</span>
              <div className="text-right">
                <span className="text-sm font-bold text-accent">{formatMonthly(annualRevenue)}</span>
                <span className="text-xs text-muted-foreground ml-2">({formatAnnual(annualRevenue)})</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Adresse</label>
            <AddressAutocomplete
              value={form.address}
              onChange={v => set('address', v)}
              onSelect={(sel: AddressSelection) => {
                setForm(prev => ({
                  ...prev,
                  address: sel.fullAddress,
                  city: sel.city,
                  postal_code: sel.postalCode,
                  latitude: sel.latitude,
                  longitude: sel.longitude,
                }));
              }}
              placeholder="Tapez une adresse..."
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contact</label>
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
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="email@exemple.fr" className="h-12 mt-1" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Notes..." rows={2} className="mt-1" />
          </div>

          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}
            className="w-full h-14 text-base font-bold">
            <Save className="h-5 w-5 mr-2" />
            {isSubmitting ? 'Enregistrement...' : 'Créer le compte'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
