import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Home, MapPin, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AddressAutocomplete, type AddressSelection } from '@/components/AddressAutocomplete';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddressDraft {
  address: string;
  lat: number | null;
  lng: number | null;
}

interface ConfigureAddressesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Profile id being edited (logged user OR impersonated user) */
  userId: string | null;
  /** Display name of the profile being edited (for clarity in the dialog) */
  userLabel?: string;
  /** Initial values pre-loaded from profile */
  initialEntreprise?: AddressDraft;
  initialDomicile?: AddressDraft;
  initialAutre?: AddressDraft;
  /** Which field should be focused / required first */
  focusField?: 'entreprise' | 'domicile' | 'autre';
  /** When true, dialog is editing someone other than the logged-in user
   *  (admin impersonation). Used to surface a clear notice. */
  isImpersonating?: boolean;
}

const EMPTY: AddressDraft = { address: '', lat: null, lng: null };

/**
 * Focused modal to configure the entreprise/domicile/autre addresses used as
 * the default departure/arrival points of every tournée. Saves directly to
 * the targeted profile and invalidates every dependent query so the optimizer
 * & route summary pick up the change immediately, with no reload.
 */
export function ConfigureAddressesDialog({
  open,
  onOpenChange,
  userId,
  userLabel,
  initialEntreprise,
  initialDomicile,
  initialAutre,
  focusField = 'entreprise',
  isImpersonating,
}: ConfigureAddressesDialogProps) {
  const queryClient = useQueryClient();
  const [entreprise, setEntreprise] = useState<AddressDraft>(initialEntreprise ?? EMPTY);
  const [domicile, setDomicile] = useState<AddressDraft>(initialDomicile ?? EMPTY);
  const [autre, setAutre] = useState<AddressDraft>(initialAutre ?? EMPTY);

  // Track the open transition so we only re-seed state when the dialog is
  // actually (re)opened. Re-seeding on every parent render would erase the
  // user's typing and is the root cause of "save does nothing" reports.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setEntreprise(initialEntreprise ?? EMPTY);
      setDomicile(initialDomicile ?? EMPTY);
      setAutre(initialAutre ?? EMPTY);
    }
    wasOpenRef.current = open;
  }, [open, initialEntreprise, initialDomicile, initialAutre]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Aucun utilisateur ciblé');

      // Build a partial payload: each address group is only included when the
      // user picked a real suggestion (lat/lng present). Free-text without
      // geocoding is rejected because the optimizer needs coordinates.
      const payload: {
        entreprise_address?: string; entreprise_lat?: number; entreprise_lng?: number;
        domicile_address?: string; domicile_lat?: number; domicile_lng?: number;
        autre_address?: string; autre_lat?: number; autre_lng?: number;
      } = {};

      const hasEntrepriseInput = entreprise.address.trim().length > 0;
      const hasDomicileInput = domicile.address.trim().length > 0;
      const hasAutreInput = autre.address.trim().length > 0;

      if (hasEntrepriseInput) {
        if (entreprise.lat == null || entreprise.lng == null) {
          throw new Error("Adresse entreprise : sélectionnez une suggestion pour la géolocaliser.");
        }
        payload.entreprise_address = entreprise.address.trim();
        payload.entreprise_lat = entreprise.lat;
        payload.entreprise_lng = entreprise.lng;
      }
      if (hasDomicileInput) {
        if (domicile.lat == null || domicile.lng == null) {
          throw new Error("Adresse domicile : sélectionnez une suggestion pour la géolocaliser.");
        }
        payload.domicile_address = domicile.address.trim();
        payload.domicile_lat = domicile.lat;
        payload.domicile_lng = domicile.lng;
      }
      if (hasAutreInput) {
        if (autre.lat == null || autre.lng == null) {
          throw new Error("Autre adresse : sélectionnez une suggestion pour la géolocaliser.");
        }
        payload.autre_address = autre.address.trim();
        payload.autre_lat = autre.lat;
        payload.autre_lng = autre.lng;
      }

      if (Object.keys(payload).length === 0) {
        throw new Error('Renseignez au moins une adresse.');
      }

      const { data, error } = await supabase.functions.invoke('update-profile-addresses', {
        body: { user_id: userId, ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.profile ?? null;
    },
    onSuccess: (savedProfile) => {
      // Invalidate every cache that derives from profile addresses so the
      // warning banner, optimizer panel, route summary and day-route map all
      // refresh in place — no manual reload needed.
      if (savedProfile) {
        queryClient.setQueryData(['profile-entreprise', userId], savedProfile);
      }
      queryClient.invalidateQueries({ queryKey: ['profile-entreprise', userId] });
      queryClient.invalidateQueries({ queryKey: ['profile-addresses'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['day-route-addresses'] });
      toast.success('Adresses enregistrées');
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Échec de l'enregistrement");
    },
  });

  const handleEntrepriseSelect = (sel: AddressSelection) =>
    setEntreprise({ address: sel.fullAddress, lat: sel.latitude, lng: sel.longitude });
  const handleDomicileSelect = (sel: AddressSelection) =>
    setDomicile({ address: sel.fullAddress, lat: sel.latitude, lng: sel.longitude });
  const handleAutreSelect = (sel: AddressSelection) =>
    setAutre({ address: sel.fullAddress, lat: sel.latitude, lng: sel.longitude });

  const entrepriseValid = !!entreprise.address.trim() && entreprise.lat != null && entreprise.lng != null;
  const domicileValid = !!domicile.address.trim() && domicile.lat != null && domicile.lng != null;
  const autreValid = !!autre.address.trim() && autre.lat != null && autre.lng != null;
  const canSave = entrepriseValid || domicileValid || autreValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurer les adresses</DialogTitle>
          <DialogDescription>
            {userLabel
              ? `Adresses utilisées pour le départ et l'arrivée des tournées de ${userLabel}.`
              : "Adresses utilisées pour le départ et l'arrivée de vos tournées."}
          </DialogDescription>
        </DialogHeader>

        {isImpersonating && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning flex gap-2 items-start">
            <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
            <span>
              Vous modifiez le profil de <strong>{userLabel ?? 'cet utilisateur'}</strong> via
              l'impersonation. Les adresses seront enregistrées sur son compte.
            </span>
          </div>
        )}

        <div className="space-y-4">
          {/* Entreprise — primary endpoint, almost always required */}
          <div className="space-y-2">
            <Label htmlFor="entreprise-addr" className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Adresse entreprise
              {focusField === 'entreprise' && (
                <span className="text-[10px] text-warning font-medium">Requise</span>
              )}
            </Label>
            <AddressAutocomplete
              value={entreprise.address}
              onChange={addr => setEntreprise(prev => ({ ...prev, address: addr, lat: null, lng: null }))}
              onSelect={handleEntrepriseSelect}
              placeholder="Tapez une adresse entreprise…"
            />
            {entreprise.address && !entrepriseValid && (
              <p className="text-[11px] text-muted-foreground">
                Sélectionnez une adresse dans la liste pour la géolocaliser.
              </p>
            )}
          </div>

          {/* Domicile — optional, used as alternative départ/arrivée */}
          <div className="space-y-2">
            <Label htmlFor="domicile-addr" className="flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              Adresse domicile
              <span className="text-[10px] text-muted-foreground">(optionnel)</span>
            </Label>
            <AddressAutocomplete
              value={domicile.address}
              onChange={addr => setDomicile(prev => ({ ...prev, address: addr, lat: null, lng: null }))}
              onSelect={handleDomicileSelect}
              placeholder="Tapez une adresse domicile…"
            />
            {domicile.address && !domicileValid && (
              <p className="text-[11px] text-muted-foreground">
                Sélectionnez une adresse dans la liste pour la géolocaliser.
              </p>
            )}
          </div>

          {/* Autre — optional secondary depot / starting point */}
          <div className="space-y-2">
            <Label htmlFor="autre-addr" className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Autre adresse
              <span className="text-[10px] text-muted-foreground">(optionnel)</span>
            </Label>
            <AddressAutocomplete
              value={autre.address}
              onChange={addr => setAutre(prev => ({ ...prev, address: addr, lat: null, lng: null }))}
              onSelect={handleAutreSelect}
              placeholder="Dépôt, bureau secondaire, etc."
            />
            {autre.address && !autreValid && (
              <p className="text-[11px] text-muted-foreground">
                Sélectionnez une adresse dans la liste pour la géolocaliser.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
            Annuler
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
