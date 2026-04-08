import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { UserPlus, Save } from 'lucide-react';

interface QuickProspectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    company_name: string;
    city: string;
    address: string;
    contact_name: string;
    phone: string;
    number_of_vehicles: number;
    notes: string;
  }) => void;
}

export function QuickProspectSheet({ open, onOpenChange, onSubmit }: QuickProspectSheetProps) {
  const [form, setForm] = useState({
    company_name: '',
    city: '',
    address: '',
    contact_name: '',
    phone: '',
    number_of_vehicles: '',
    notes: '',
  });

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const isValid = form.company_name.trim() && form.city.trim() && form.contact_name.trim() && form.phone.trim();

  const handleSubmit = () => {
    onSubmit({
      ...form,
      number_of_vehicles: parseInt(form.number_of_vehicles) || 0,
    });
    setForm({ company_name: '', city: '', address: '', contact_name: '', phone: '', number_of_vehicles: '', notes: '' });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-2xl px-5 pb-8">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Ajouter un prospect rencontré
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">Capture rapide — terrain</p>
        </SheetHeader>

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
              <label className="text-xs font-medium text-muted-foreground">Téléphone *</label>
              <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="06..." className="h-12 mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Note rapide</label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Note courte..." rows={2} className="mt-1" />
          </div>

          <Button onClick={handleSubmit} disabled={!isValid}
            className="w-full h-14 text-base font-bold">
            <Save className="h-5 w-5 mr-2" />
            Enregistrer le prospect
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
