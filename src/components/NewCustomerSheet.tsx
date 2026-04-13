import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Building2, Save, RotateCcw, MapPin, Users, Briefcase, Search, Loader2 } from 'lucide-react';
import { formatMonthly, formatAnnual } from '@/lib/revenueUtils';
import { getDefaultFrequency } from '@/lib/visitFrequencyUtils';
import { AddressAutocomplete, type AddressSelection } from '@/components/AddressAutocomplete';
import { BusinessSearchAutocomplete, type BusinessSelection } from '@/components/BusinessSearchAutocomplete';
import { ContactListEditor, emptyContact, type ContactEntry } from '@/components/ContactListEditor';
import { DuplicateWarning } from '@/components/DuplicateWarning';
import { detectDuplicates, fetchExistingCustomersForDuplicateCheck, type DuplicateCandidate } from '@/lib/duplicateDetection';
import { useCommercialZones, findMatchingZone } from '@/hooks/useCommercialZones';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, MapPinOff } from 'lucide-react';

export interface NewCustomerFormData {
  company_name: string;
  city: string;
  address: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  contacts: ContactEntry[];
  number_of_vehicles: number;
  notes: string;
  customer_type: 'prospect' | 'client_actif' | 'client_inactif';
  visit_frequency: string;
}

interface NewCustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: NewCustomerFormData) => Promise<void> | void;
  defaultType?: 'prospect' | 'client_actif' | 'client_inactif';
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-xs font-semibold uppercase tracking-wider text-primary">{label}</span>
      <div className="flex-1 border-b border-border" />
    </div>
  );
}

export function NewCustomerSheet({ open, onOpenChange, onSubmit, defaultType = 'prospect' }: NewCustomerSheetProps) {
  const { role } = useAuth();
  const { data: zones = [] } = useCommercialZones();

  const getInitialForm = () => ({
    company_name: '',
    city: '',
    address: '',
    postal_code: '',
    latitude: null as number | null,
    longitude: null as number | null,
    number_of_vehicles: '',
    notes: '',
    customer_type: defaultType,
  });

  const [form, setForm] = useState(getInitialForm);
  const [contacts, setContacts] = useState<ContactEntry[]>([emptyContact(true)]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addressLocked, setAddressLocked] = useState(false);
  
  // Duplicate detection state
  const [existingCustomers, setExistingCustomers] = useState<any[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [forceCreate, setForceCreate] = useState(false);

  useEffect(() => {
    setForm(getInitialForm());
    setContacts([emptyContact(true)]);
    setAddressLocked(false);
    setDuplicates([]);
    setDuplicateChecked(false);
    setForceCreate(false);
  }, [defaultType, open]);

  // Load existing customers when sheet opens
  useEffect(() => {
    if (open) {
      fetchExistingCustomersForDuplicateCheck().then(setExistingCustomers).catch(() => {});
    }
  }, [open]);

  const set = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDuplicateChecked(false);
    setForceCreate(false);
  };

  const vehicles = parseInt(form.number_of_vehicles) || 0;
  const annualRevenue = vehicles * 3500;
  const isValid = form.company_name.trim() && form.city.trim();

  // Out-of-zone detection
  const zoneMatch = useMemo(() => {
    if (!form.city && !form.postal_code) return null;
    return findMatchingZone(zones, form.city, form.postal_code);
  }, [zones, form.city, form.postal_code]);

  const isOutOfZone = isValid && !zoneMatch && (form.city.trim() || form.postal_code.trim());
  const isAdmin = role === 'admin' || role === 'manager';

  const handleCheckDuplicates = async () => {
    if (!form.company_name.trim()) return;
    setCheckingDuplicates(true);
    try {
      const primaryContact = contacts.find(c => c.isPrimary) || contacts[0];
      const found = detectDuplicates(
        {
          company_name: form.company_name,
          city: form.city,
          address: form.address,
          phone: primaryContact?.phone,
          email: primaryContact?.email,
          postal_code: form.postal_code,
        },
        existingCustomers
      );
      setDuplicates(found);
      setDuplicateChecked(true);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const hasExactDuplicate = duplicates.some(d => d.confidence === 'exact');

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    
    // Run duplicate check if not done yet
    if (!duplicateChecked) {
      await handleCheckDuplicates();
      return;
    }

    // Block if duplicates found and not force-creating
    if (duplicates.length > 0 && !forceCreate) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        company_name: form.company_name,
        city: form.city,
        address: form.address,
        postal_code: form.postal_code,
        latitude: form.latitude,
        longitude: form.longitude,
        contacts: contacts.filter(c => c.name.trim()),
        number_of_vehicles: vehicles,
        notes: form.notes,
        customer_type: form.customer_type as 'prospect' | 'client_actif' | 'client_inactif',
        visit_frequency: getDefaultFrequency(form.customer_type),
      });
      setForm(getInitialForm());
      setContacts([emptyContact(true)]);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLabel = !duplicateChecked
    ? 'Vérifier et créer'
    : duplicates.length > 0 && !forceCreate
    ? 'Doublons détectés'
    : isSubmitting
    ? 'Enregistrement...'
    : 'Créer le compte';

  const submitDisabled = !isValid || isSubmitting || (duplicateChecked && duplicates.length > 0 && !forceCreate);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[92vh] rounded-t-2xl px-5 pb-8 overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="font-heading text-lg text-left flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Nouveau compte
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* ── Section 1: Compte ── */}
          <SectionHeader icon={Building2} label="Compte" />

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
            <BusinessSearchAutocomplete
              value={form.company_name}
              onChange={v => set('company_name', v)}
              onSelect={(sel: BusinessSelection) => {
                setForm(prev => ({
                  ...prev,
                  company_name: sel.companyName,
                  address: sel.fullAddress,
                  city: sel.city,
                  postal_code: sel.postalCode,
                  latitude: sel.latitude,
                  longitude: sel.longitude,
                }));
                setDuplicateChecked(false);
                setForceCreate(false);
                if (sel.phone) {
                  setContacts(prev => {
                    const next = [...prev];
                    if (next.length > 0 && !next[0].phone) {
                      next[0] = { ...next[0], phone: sel.phone! };
                    }
                    return next;
                  });
                }
                if (sel.fullAddress || sel.city) {
                  setAddressLocked(true);
                }
              }}
              className="mt-1"
            />
          </div>

          {/* ── Section 2: Adresse ── */}
          <SectionHeader icon={MapPin} label="Adresse" />

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Adresse</label>
              {addressLocked && (
                <button
                  type="button"
                  onClick={() => setAddressLocked(false)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  Modifier
                </button>
              )}
            </div>
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
                setDuplicateChecked(false);
                setForceCreate(false);
              }}
              placeholder="Adresse..."
              className="mt-1"
              suppressAutocomplete={addressLocked}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Code postal</label>
              <Input value={form.postal_code} onChange={e => set('postal_code', e.target.value)}
                placeholder="75001" className="h-12 mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ville *</label>
              <Input value={form.city} onChange={e => set('city', e.target.value)}
                placeholder="Ville" className="h-12 mt-1" />
            </div>
          </div>

          {/* Out-of-zone warning */}
          {isOutOfZone && !isAdmin && (
            <div className="rounded-lg border border-warning/50 bg-warning/5 p-3 flex items-start gap-2">
              <MapPinOff className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-warning">Hors zone détecté</p>
                <p className="text-[11px] text-muted-foreground">
                  Ce compte ne correspond à aucune de vos zones. Il sera créé avec le statut « Validation admin requise ».
                </p>
              </div>
            </div>
          )}

          {isOutOfZone && isAdmin && (
            <div className="rounded-lg border border-muted bg-muted/30 p-3 flex items-start gap-2">
              <MapPinOff className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Ce compte est hors zone. L'affectation sera gérée manuellement.
              </p>
            </div>
          )}

          {/* ── Section 3: Contacts ── */}
          <SectionHeader icon={Users} label="Contacts" />
          <ContactListEditor contacts={contacts} onChange={setContacts} />

          {/* ── Section 4: Business ── */}
          <SectionHeader icon={Briefcase} label="Business" />

          <div>
            <label className="text-xs font-medium text-muted-foreground">Nb véhicules</label>
            <Input type="number" value={form.number_of_vehicles} onChange={e => set('number_of_vehicles', e.target.value)}
              placeholder="0" className="h-12 mt-1" />
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
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Notes..." rows={2} className="mt-1" />
          </div>

          {/* ── Duplicate Warning ── */}
          {duplicateChecked && duplicates.length > 0 && (
            <DuplicateWarning
              duplicates={duplicates}
              isExact={hasExactDuplicate}
              onForceCreate={() => setForceCreate(true)}
            />
          )}

          {/* ── Submit ── */}
          <Button
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="w-full h-14 text-base font-bold mt-2"
          >
            {checkingDuplicates ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Vérification...</>
            ) : (
              <><Save className="h-5 w-5 mr-2" /> {submitLabel}</>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
