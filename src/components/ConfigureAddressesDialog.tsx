import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Home, Loader2 } from 'lucide-react';
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
  /** Which field should be focused / required first */
  focusField?: 'entreprise' | 'domicile';
}

/**
 * Focused modal to fix a missing entreprise/domicile address directly from
 * the tournée warning banner. Saves to the profile and invalidates the
 * dependent queries so the optimizer picks the new endpoint immediately.
 */
export function ConfigureAddressesDialog({
  open,
  onOpenChange,
  userId,
  userLabel,
  initialEntreprise,
  initialDomicile,
  focusField = 'entreprise',
}: ConfigureAddressesDialogProps) {
  const queryClient = useQueryClient();
  const [entreprise, setEntreprise] = useState<AddressDraft>(
    initialEntreprise ?? { address: '', lat: null, lng: null },
  );
  const [domicile, setDomicile] = useState<AddressDraft>(
    initialDomicile ?? { address: '', lat: null, lng: null },
  );

  useEffect(() => {
    if (open) {
      setEntreprise(initialEntreprise ?? { address: '', lat: null, lng: null });
      setDomicile(initialDomicile ?? { address: '', lat: null, lng: null });
    }
  }, [open, initialEntreprise, initialDomicile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Aucun utilisateur ciblé');
      const payload: {
        entreprise_address?: string; entreprise_lat?: number; entreprise_lng?: number;
        domicile_address?: string; domicile_lat?: number; domicile_lng?: number;
      } = {};

      if (entreprise.address.trim() && entreprise.lat != null && entreprise.lng != null) {
        payload.entreprise_address = entreprise.address.trim();
        payload.entreprise_lat = entreprise.lat;
        payload.entreprise_lng = entreprise.lng;
      }
      if (domicile.address.trim() && domicile.lat != null && domicile.lng != null) {
        payload.domicile_address = domicile.address.trim();
        payload.domicile_lat = domicile.lat;
        payload.domicile_lng = domicile.lng;
      }

      if (Object.keys(payload).length === 0) {
        throw new Error('Sélectionnez au moins une adresse depuis les suggestions');
      }

      const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Refresh every query that depends on the profile addresses so the
      // optimizer / route summary / map pick them up immediately.
      queryClient.invalidateQueries({ queryKey: ['profile-entreprise', userId] });
      queryClient.invalidateQueries({ queryKey: ['profile-addresses'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Adresses enregistrées');
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Échec de l'enregistrement");
    },
  });

  const handleEntrepriseSelect = (sel: AddressSelection) => {
    setEntreprise({ address: sel.fullAddress, lat: sel.latitude, lng: sel.longitude });
  };
  const handleDomicileSelect = (sel: AddressSelection) => {
    setDomicile({ address: sel.fullAddress, lat: sel.latitude, lng: sel.longitude });
  };

  const entrepriseValid = !!entreprise.address.trim() && entreprise.lat != null && entreprise.lng != null;
  const domicileValid = !!domicile.address.trim() && domicile.lat != null && domicile.lng != null;
  const canSave = entrepriseValid || domicileValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurer les adresses</DialogTitle>
          <DialogDescription>
            {userLabel
              ? `Adresses utilisées pour le départ et l'arrivée des tournées de ${userLabel}.`
              : "Adresses utilisées pour le départ et l'arrivée de vos tournées."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
