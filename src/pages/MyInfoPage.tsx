import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User as UserIcon, Mail, Phone, Building2, Home, MapPin,
  Loader2, Save, Pencil, Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ConfigureAddressesDialog } from '@/components/ConfigureAddressesDialog';
import { toast } from 'sonner';

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  entreprise_address: string | null;
  entreprise_lat: number | null;
  entreprise_lng: number | null;
  domicile_address: string | null;
  domicile_lat: number | null;
  domicile_lng: number | null;
  autre_address: string | null;
  autre_lat: number | null;
  autre_lng: number | null;
}

/**
 * "Mes infos" — self-service profile page for the active commercial user.
 *
 * Reads & writes the SAME `profiles` row used everywhere else (administration,
 * tournée optimizer, route summary…). No parallel data store.
 *
 * Address fields reuse `ConfigureAddressesDialog` so the geocoding/persistence
 * logic, query invalidation and impersonation handling stay centralized.
 */
export default function MyInfoPage() {
  const { user, profile: realProfile } = useAuth();
  const { isImpersonating, effectiveUserId, effectiveFullName } = useImpersonation();
  const queryClient = useQueryClient();

  // The "active" user identity — respects admin impersonation so a logged-in
  // admin previewing a rep sees & edits THAT rep's personal infos.
  const activeUserId = isImpersonating ? effectiveUserId : user?.id ?? null;
  const activeUserLabel = isImpersonating ? effectiveFullName : realProfile?.full_name ?? null;

  /* ─── Load profile (single source of truth) ───────────── */
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', activeUserId],
    enabled: !!activeUserId,
    queryFn: async (): Promise<ProfileRow | null> => {
      if (!activeUserId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, entreprise_address, entreprise_lat, entreprise_lng, domicile_address, domicile_lat, domicile_lng, autre_address, autre_lat, autre_lng')
        .eq('id', activeUserId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  /* ─── Identity (Prénom / Nom / Email / Téléphone) ─────── */
  // The DB stores `full_name`. We split on the first whitespace to expose
  // separate first/last name fields, then re-join on save. This keeps the
  // single-column schema intact while giving the user a friendlier UX.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const seededRef = useRef(false);

  useEffect(() => {
    if (!profile || seededRef.current) return;
    const fullName = (profile.full_name ?? '').trim();
    const [first, ...rest] = fullName.split(/\s+/);
    setFirstName(first ?? '');
    setLastName(rest.join(' '));
    setEmail(profile.email ?? '');
    setPhone(profile.phone ?? '');
    seededRef.current = true;
  }, [profile]);

  // Re-seed when switching impersonation target.
  useEffect(() => {
    seededRef.current = false;
  }, [activeUserId]);

  const identityMutation = useMutation({
    mutationFn: async () => {
      if (!activeUserId) throw new Error('Aucun utilisateur actif');
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          email: email.trim() || null,
          phone: phone.trim() || null,
        })
        .eq('id', activeUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', activeUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile-entreprise', activeUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile-addresses'] });
      toast.success('Informations enregistrées');
    },
    onError: (err: Error) => toast.error(err.message ?? 'Échec de l\'enregistrement'),
  });

  /* ─── Address dialog reuse ─────────────────────────────── */
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [focusField, setFocusField] = useState<'entreprise' | 'domicile' | 'autre'>('entreprise');

  const initialEntreprise = useMemo(() => ({
    address: profile?.entreprise_address ?? '',
    lat: profile?.entreprise_lat ?? null,
    lng: profile?.entreprise_lng ?? null,
  }), [profile]);
  const initialDomicile = useMemo(() => ({
    address: profile?.domicile_address ?? '',
    lat: profile?.domicile_lat ?? null,
    lng: profile?.domicile_lng ?? null,
  }), [profile]);
  const initialAutre = useMemo(() => ({
    address: profile?.autre_address ?? '',
    lat: profile?.autre_lat ?? null,
    lng: profile?.autre_lng ?? null,
  }), [profile]);

  const openAddressDialog = (field: 'entreprise' | 'domicile' | 'autre') => {
    setFocusField(field);
    setAddressDialogOpen(true);
  };

  /* ─── Clear single address ─────────────────────────────── */
  const clearAddressMutation = useMutation({
    mutationFn: async (field: 'entreprise' | 'domicile' | 'autre') => {
      if (!activeUserId) throw new Error('Aucun utilisateur actif');
      const payload: Record<string, null> = {
        [`${field}_address`]: null,
        [`${field}_lat`]: null,
        [`${field}_lng`]: null,
      };
      const { data, error } = await supabase.functions.invoke('update-profile-addresses', {
        body: { user_id: activeUserId, ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', activeUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile-entreprise', activeUserId] });
      queryClient.invalidateQueries({ queryKey: ['profile-addresses'] });
      queryClient.invalidateQueries({ queryKey: ['day-route-addresses'] });
      toast.success('Adresse supprimée');
    },
    onError: (err: Error) => toast.error(err.message ?? 'Échec de la suppression'),
  });

  /* ─── Render ───────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 pb-20 md:pb-6 space-y-6">
      <header>
        <h1 className="font-heading text-2xl font-bold">Mes infos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isImpersonating ? (
            <>Profil opérationnel de <strong>{activeUserLabel}</strong> (impersonation).</>
          ) : (
            <>Vos informations personnelles et adresses utilisées pour vos tournées.</>
          )}
        </p>
      </header>

      {/* ─── Identity ─────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserIcon className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold">Identité &amp; contact</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">Prénom</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Prénom"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">Nom</Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Nom"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="exemple@entreprise.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Téléphone
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="06 12 34 56 78"
            />
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end">
          <Button
            onClick={() => identityMutation.mutate()}
            disabled={identityMutation.isPending || !firstName.trim()}
          >
            {identityMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Enregistrer
          </Button>
        </div>
      </Card>

      {/* ─── Operational addresses ─────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-semibold">Adresses pour mes tournées</h2>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Ces adresses sont utilisées comme points de départ et d'arrivée par défaut
          dans l'optimiseur de tournée, le résumé du trajet et la carte.
        </p>

        <div className="space-y-3">
          <AddressRow
            icon={<Building2 className="h-4 w-4 text-primary" />}
            label="Adresse entreprise"
            address={profile?.entreprise_address}
            hasCoords={profile?.entreprise_lat != null && profile?.entreprise_lng != null}
            onEdit={() => openAddressDialog('entreprise')}
            onClear={() => clearAddressMutation.mutate('entreprise')}
            isClearing={clearAddressMutation.isPending && clearAddressMutation.variables === 'entreprise'}
            required
          />
          <AddressRow
            icon={<Home className="h-4 w-4 text-primary" />}
            label="Adresse domicile"
            address={profile?.domicile_address}
            hasCoords={profile?.domicile_lat != null && profile?.domicile_lng != null}
            onEdit={() => openAddressDialog('domicile')}
            onClear={() => clearAddressMutation.mutate('domicile')}
            isClearing={clearAddressMutation.isPending && clearAddressMutation.variables === 'domicile'}
          />
          <AddressRow
            icon={<MapPin className="h-4 w-4 text-primary" />}
            label="Autre adresse"
            address={profile?.autre_address}
            hasCoords={profile?.autre_lat != null && profile?.autre_lng != null}
            onEdit={() => openAddressDialog('autre')}
            onClear={() => clearAddressMutation.mutate('autre')}
            isClearing={clearAddressMutation.isPending && clearAddressMutation.variables === 'autre'}
          />
        </div>
      </Card>

      <ConfigureAddressesDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        userId={activeUserId}
        userLabel={activeUserLabel ?? undefined}
        initialEntreprise={initialEntreprise}
        initialDomicile={initialDomicile}
        initialAutre={initialAutre}
        focusField={focusField}
        isImpersonating={isImpersonating}
      />
    </div>
  );
}

/* ─── Address row sub-component ─────────────────────────── */
function AddressRow({
  icon, label, address, hasCoords, onEdit, onClear, isClearing, required,
}: {
  icon: React.ReactNode;
  label: string;
  address: string | null | undefined;
  hasCoords: boolean;
  onEdit: () => void;
  onClear: () => void;
  isClearing: boolean;
  required?: boolean;
}) {
  const isEmpty = !address?.trim();
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {required && isEmpty && (
            <span className="text-[10px] font-medium text-warning">À renseigner</span>
          )}
          {!isEmpty && !hasCoords && (
            <span className="text-[10px] font-medium text-warning">Non géolocalisée</span>
          )}
        </div>
        <p className={`text-sm mt-0.5 truncate ${isEmpty ? 'text-muted-foreground italic' : 'text-foreground'}`}>
          {isEmpty ? 'Aucune adresse définie' : address}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1" />
          {isEmpty ? 'Ajouter' : 'Modifier'}
        </Button>
        {!isEmpty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={isClearing}
            className="text-muted-foreground hover:text-destructive"
            title="Supprimer cette adresse"
          >
            {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}
