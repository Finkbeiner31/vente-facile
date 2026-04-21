import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { UserPlus, Save, Search, Loader2, MapPin, Plus, AlertTriangle, ExternalLink, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
    existing_customer_id?: string;
  }) => void;
}

interface CustomerSuggestion {
  id: string;
  company_name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  customer_type: string;
}

const statusConfig: Record<string, { label: string; class: string }> = {
  prospect: { label: 'Prospect', class: 'bg-muted text-muted-foreground' },
  prospect_qualifie: { label: 'Prospect qualifié', class: 'bg-accent/15 text-accent' },
  client_actif: { label: 'Client actif', class: 'bg-success/15 text-success' },
  client_inactif: { label: 'Client inactif', class: 'bg-muted text-muted-foreground' },
  pending_conversion: { label: 'En attente', class: 'bg-warning/15 text-warning' },
};

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
  const [linkedExistingId, setLinkedExistingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const isValid =
    form.company_name.trim() &&
    form.city.trim() &&
    form.contact_name.trim() &&
    form.phone.trim();

  // Reset on close
  useEffect(() => {
    if (!open) {
      setForm({ company_name: '', city: '', address: '', contact_name: '', phone: '', number_of_vehicles: '', notes: '' });
      setLinkedExistingId(null);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [open]);

  // Debounced live search on company_name
  useEffect(() => {
    const term = form.company_name.trim();

    // If user edits after picking, drop the link
    if (linkedExistingId) {
      const linked = suggestions.find(s => s.id === linkedExistingId);
      if (!linked || normalize(linked.company_name) !== normalize(term)) {
        setLinkedExistingId(null);
      }
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (term.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    setShowSuggestions(true);
    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, company_name, city, address, phone, customer_type')
        .ilike('company_name', `%${term}%`)
        .limit(8);
      if (!error) setSuggestions((data || []) as CustomerSuggestion[]);
      setLoading(false);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.company_name]);

  const exactMatch = suggestions.find(
    s => normalize(s.company_name) === normalize(form.company_name)
  );

  const handlePickExisting = (c: CustomerSuggestion) => {
    setForm(prev => ({
      ...prev,
      company_name: c.company_name,
      city: c.city || prev.city,
      address: c.address || prev.address,
      phone: c.phone || prev.phone,
    }));
    setLinkedExistingId(c.id);
    setShowSuggestions(false);
  };

  const handleCreateNew = () => {
    setLinkedExistingId(null);
    setShowSuggestions(false);
  };

  const handleSubmit = () => {
    onSubmit({
      ...form,
      number_of_vehicles: parseInt(form.number_of_vehicles) || 0,
      existing_customer_id: linkedExistingId || undefined,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-2xl px-5 pb-8 overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Ajouter un prospect rencontré
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">Capture rapide — terrain</p>
        </SheetHeader>

        <div className="space-y-3">
          {/* Company name with live search */}
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground">Entreprise *</label>
            <div className="relative mt-1">
              <Input
                value={form.company_name}
                onChange={e => set('company_name', e.target.value)}
                onFocus={() => form.company_name.trim().length >= 2 && setShowSuggestions(true)}
                placeholder="Tapez pour rechercher ou créer..."
                className="h-12 text-base pr-10"
                autoComplete="off"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </div>
            </div>

            {/* Linked existing badge */}
            {linkedExistingId && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-success/30 bg-success/5 p-2">
                <Check className="h-4 w-4 text-success shrink-0" />
                <span className="text-xs text-success font-medium flex-1">
                  Compte existant lié — pas de doublon
                </span>
                <Link to={`/clients/${linkedExistingId}`} target="_blank">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <ExternalLink className="h-3 w-3 mr-1" /> Voir
                  </Button>
                </Link>
              </div>
            )}

            {/* Exact-match warning if user is editing without linking */}
            {!linkedExistingId && exactMatch && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 p-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <span className="text-xs text-warning flex-1">
                  Un compte « {exactMatch.company_name} » existe déjà.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handlePickExisting(exactMatch)}
                >
                  Lier
                </Button>
              </div>
            )}

            {/* Suggestions dropdown */}
            {showSuggestions && form.company_name.trim().length >= 2 && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border bg-popover shadow-lg max-h-[280px] overflow-y-auto">
                {loading && suggestions.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                    Recherche...
                  </div>
                ) : (
                  <>
                    {suggestions.map(s => {
                      const conf = statusConfig[s.customer_type] || statusConfig.prospect;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handlePickExisting(s)}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/50 active:bg-muted border-b last:border-b-0 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{s.company_name}</span>
                            <Badge variant="secondary" className={`text-[10px] ${conf.class}`}>
                              {conf.label}
                            </Badge>
                          </div>
                          {(s.city || s.address) && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {[s.address, s.city].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </button>
                      );
                    })}

                    {/* Create new option */}
                    {!exactMatch && (
                      <button
                        type="button"
                        onClick={handleCreateNew}
                        className="w-full text-left px-3 py-2.5 hover:bg-primary/5 active:bg-primary/10 border-t bg-primary/[0.03] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Plus className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium text-primary">
                            Créer un nouveau prospect : « {form.company_name.trim()} »
                          </span>
                        </div>
                      </button>
                    )}

                    {suggestions.length === 0 && !loading && (
                      <div className="px-3 py-3 text-xs text-muted-foreground text-center border-t">
                        Aucun compte existant trouvé
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
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
            {linkedExistingId ? 'Enregistrer la rencontre' : 'Enregistrer le prospect'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
