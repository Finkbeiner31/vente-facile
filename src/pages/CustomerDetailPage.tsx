import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import { useAuth } from '@/contexts/AuthContext';
import { formatMonthly, getRevenueTierColor, getRevenueTier } from '@/lib/revenueUtils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Navigation, FileText, CheckSquare,
  User, Clock, MapPin, ExternalLink, Car, Target,
  Loader2, AlertTriangle, ArrowRightCircle, Plus, Pencil, Trash2,
  Star, Mail, MessageCircle, Truck, Wrench, Building2,
} from 'lucide-react';
import { RevenueHistoryCard } from '@/components/RevenueHistoryCard';
import { useCommercialZones, findMatchingZone, formatZoneName } from '@/hooks/useCommercialZones';
import { formatAssignmentSource, formatZoneStatus } from '@/lib/zoneAssignment';
import { useZoneAssignment } from '@/hooks/useZoneAssignment';
import { useCustomerPerformance } from '@/hooks/useCustomerPerformance';
import { computeVisitPriority, PRIORITY_CONFIGS } from '@/lib/priorityEngine';
import {
  useVehiclePotentials, computeFleetPotential,
  FLEET_KEYS, FLEET_LABELS, CUSTOMER_TYPES, EQUIPMENT_TYPES, EQUIPMENT_SUB_TYPES,
} from '@/hooks/useVehiclePotentials';
import { Checkbox } from '@/components/ui/checkbox';
import {
  computeVisitStatus, VISIT_FREQUENCIES, PREFERRED_DAYS, getDefaultFrequency,
} from '@/lib/visitFrequencyUtils';

import { ConversionRequestSheet } from '@/components/ConversionRequestSheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

type CustomerStatus = 'prospect' | 'prospect_qualifie' | 'client_actif' | 'client_inactif' | 'pending_conversion';

const statusConfig: Record<CustomerStatus, { label: string; class: string }> = {
  prospect: { label: 'Prospect', class: 'bg-warning/15 text-warning' },
  prospect_qualifie: { label: 'Prospect qualifié', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  pending_conversion: { label: 'Validation en attente', class: 'bg-primary/15 text-primary' },
  client_actif: { label: 'Client actif', class: 'bg-accent/15 text-accent' },
  client_inactif: { label: 'Inactif', class: 'bg-muted text-muted-foreground' },
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, role, loading: authLoading } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [editingVehicles, setEditingVehicles] = useState(false);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', role: '', phone: '', email: '' });
  const [editContactData, setEditContactData] = useState({ first_name: '', last_name: '', role: '', phone: '', email: '' });
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [fleetForm, setFleetForm] = useState({ fleet_pl: 0, fleet_vu: 0, fleet_remorque: 0, fleet_car_bus: 0, activity_type: '', equipment_type: '', equipment_types: [] as string[] });
  const [conversionSheetOpen, setConversionSheetOpen] = useState(false);
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackTarget, setRollbackTarget] = useState<'prospect' | 'prospect_qualifie'>('prospect_qualifie');
  const queryClient = useQueryClient();
  const isValidId = Boolean(id && UUID_REGEX.test(id));

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id, user?.id],
    queryFn: async () => {
      if (!id) throw new Error('ID manquant');
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !authLoading && !!user && isValidId,
  });

  const revenue = customer?.annual_revenue_potential || 0;
  const perf = useCustomerPerformance(customer?.id, revenue);
  const { data: potentials = [] } = useVehiclePotentials();
  const { data: zones = [] } = useCommercialZones();
  const { autoAssignCustomer } = useZoneAssignment();

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', id, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('*').eq('customer_id', id!).order('is_primary', { ascending: false });
      return data || [];
    },
    enabled: !authLoading && !!user && isValidId,
  });

  const { data: visitReports = [] } = useQuery({
    queryKey: ['visit-reports', id, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('visit_reports').select('*, profiles:rep_id(full_name)').eq('customer_id', id!).order('visit_date', { ascending: false }).limit(10);
      return data || [];
    },
    enabled: !authLoading && !!user && isValidId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['customer-tasks', id, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('tasks').select('*').eq('customer_id', id!).order('created_at', { ascending: false }).limit(5);
      return data || [];
    },
    enabled: !authLoading && !!user && isValidId,
  });

  const qualifyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('customers').update({ customer_type: 'prospect_qualifie' } as any).eq('id', id!);
      if (error) throw error;
      await (supabase as any).from('activity_logs').insert({
        user_id: user!.id, entity_type: 'customer', entity_id: id,
        action: 'qualified', details: { from: 'prospect', to: 'prospect_qualifie' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Prospect qualifié');
    },
  });

  const conversionRequestMutation = useMutation({
    mutationFn: async (comment: string) => {
      const cust = customer as any;
      const totalV = (cust.fleet_pl || 0) + (cust.fleet_vu || 0) + (cust.fleet_remorque || 0) + (cust.fleet_car_bus || 0);
      if (totalV === 0 && !(customer.number_of_vehicles && customer.number_of_vehicles > 0)) {
        throw new Error('NO_VEHICLES');
      }
      // Create conversion request
      const { error: e1 } = await (supabase as any).from('conversion_requests').insert({
        customer_id: id!,
        requested_by: user!.id,
        comment: comment || null,
      });
      if (e1) throw e1;
      // Update status to pending
      const { error: e2 } = await supabase.from('customers').update({ customer_type: 'pending_conversion' } as any).eq('id', id!);
      if (e2) throw e2;
      // Audit log
      await (supabase as any).from('activity_logs').insert({
        user_id: user!.id, entity_type: 'customer', entity_id: id,
        action: 'conversion_requested', details: { from: 'prospect_qualifie', to: 'pending_conversion', comment },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setConversionSheetOpen(false);
      toast.success('Demande de conversion envoyée');
    },
    onError: (err: any) => {
      if (err.message === 'NO_VEHICLES') {
        toast.error('Impossible de convertir ce prospect en client : veuillez renseigner le nombre de véhicules.');
      } else {
        toast.error('Erreur lors de la demande');
      }
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ reason, target }: { reason: string; target: string }) => {
      const { error } = await supabase.from('customers').update({ customer_type: target } as any).eq('id', id!);
      if (error) throw error;
      await (supabase as any).from('activity_logs').insert({
        user_id: user!.id, entity_type: 'customer', entity_id: id,
        action: 'rollback_status', details: { from: customer.customer_type, to: target, reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setRollbackDialogOpen(false);
      setRollbackReason('');
      toast.success('Statut mis à jour');
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await (supabase as any).from('customers').update(updates).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      setEditingVehicles(false);
      setEditingBusiness(false);
      toast.success('Informations mises à jour');
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async (contact: typeof newContact) => {
      const isPrimary = contacts.length === 0;
      const { error } = await supabase.from('contacts').insert({ customer_id: id!, first_name: contact.first_name, last_name: contact.last_name, role: contact.role || null, phone: contact.phone || null, email: contact.email || null, is_primary: isPrimary });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts', id] }); setAddingContact(false); setNewContact({ first_name: '', last_name: '', role: '', phone: '', email: '' }); toast.success('Contact ajouté'); },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, data }: { contactId: string; data: typeof editContactData }) => {
      const { error } = await supabase.from('contacts').update({ first_name: data.first_name, last_name: data.last_name, role: data.role || null, phone: data.phone || null, email: data.email || null }).eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts', id] }); setEditingContact(null); toast.success('Contact modifié'); },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => { const { error } = await supabase.from('contacts').delete().eq('id', contactId); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts', id] }); toast.success('Contact supprimé'); },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await supabase.from('contacts').update({ is_primary: false }).eq('customer_id', id!);
      const { error } = await supabase.from('contacts').update({ is_primary: true }).eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts', id] }); toast.success('Contact principal défini'); },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!isValidId || error || !customer) {
    return (
      <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
        <div className="flex items-center gap-3">
          <Link to="/clients"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <h1 className="font-heading text-lg font-bold">Retour</h1>
        </div>
        <div className="py-12 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
          <p className="mt-3 text-sm font-medium">Client introuvable</p>
        </div>
      </div>
    );
  }

  const status = (customer.customer_type || 'prospect') as CustomerStatus;
  const sc = statusConfig[status] || statusConfig.prospect;
  const cust = customer as any; // for new fields not yet in generated types
  const fleetData = { fleet_pl: cust.fleet_pl || 0, fleet_vu: cust.fleet_vu || 0, fleet_remorque: cust.fleet_remorque || 0, fleet_car_bus: cust.fleet_car_bus || 0 };
  const totalVehicles = fleetData.fleet_pl + fleetData.fleet_vu + fleetData.fleet_remorque + fleetData.fleet_car_bus;
  const fleetPotential = computeFleetPotential(fleetData, potentials);
  const displayRevenue = fleetPotential.annual > 0 ? fleetPotential.annual : revenue;

  const priority = computeVisitPriority(perf, customer.last_visit_date, customer.visit_frequency, null, null, customer.latitude, customer.longitude);
  const prioConfig = PRIORITY_CONFIGS[priority.level];

  const primaryContact = contacts.find(c => c.is_primary) || contacts[0];
  const phoneNumber = primaryContact?.phone || customer.phone || '';
  const address = customer.address ? `${customer.address}${customer.city ? ', ' + customer.city : ''}` : customer.city || '';
  const fullAddress = [customer.address, customer.postal_code, customer.city].filter(Boolean).join(', ');

  const startEditBusiness = () => {
    const eqTypes = (cust as any).equipment_types;
    setFleetForm({
      fleet_pl: cust.fleet_pl || 0,
      fleet_vu: cust.fleet_vu || 0,
      fleet_remorque: cust.fleet_remorque || 0,
      fleet_car_bus: cust.fleet_car_bus || 0,
      activity_type: cust.activity_type || '',
      equipment_type: cust.equipment_type || '',
      equipment_types: Array.isArray(eqTypes) ? eqTypes : [],
    });
    setEditingBusiness(true);
  };

  const saveBusiness = () => {
    if (fleetForm.equipment_type === 'Multi-équipement' && fleetForm.equipment_types.length === 0) {
      toast.error('Veuillez sélectionner au moins un type d\'équipement');
      return;
    }
    const totalV = fleetForm.fleet_pl + fleetForm.fleet_vu + fleetForm.fleet_remorque + fleetForm.fleet_car_bus;
    const eqTypes = fleetForm.equipment_type === 'Multi-équipement'
      ? fleetForm.equipment_types
      : fleetForm.equipment_type ? [fleetForm.equipment_type] : [];
    updateCustomerMutation.mutate({
      fleet_pl: fleetForm.fleet_pl,
      fleet_vu: fleetForm.fleet_vu,
      fleet_remorque: fleetForm.fleet_remorque,
      fleet_car_bus: fleetForm.fleet_car_bus,
      number_of_vehicles: totalV,
      activity_type: fleetForm.activity_type || null,
      equipment_type: fleetForm.equipment_type || null,
      equipment_types: eqTypes,
    } as any);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* ─── 1. HEADER ─── */}
      <div className="flex items-start gap-3">
        <Link to="/clients">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 mt-0.5"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-heading text-xl md:text-2xl font-bold truncate">{customer.company_name}</h1>
            <Badge className={`text-[10px] shrink-0 ${sc.class}`}>{sc.label}</Badge>
          </div>
          {cust.activity_type && (
            <p className="text-xs text-primary font-medium mt-0.5">{cust.activity_type}</p>
          )}
          {(customer.city || customer.address) && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              <MapPin className="inline h-3 w-3 mr-0.5 -mt-0.5" />
              {customer.city}{customer.address ? ` · ${customer.address}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Key metrics */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">CA pot.</span>
          <span className={`text-sm font-bold ${getRevenueTierColor(getRevenueTier(displayRevenue))}`}>{formatMonthly(displayRevenue)}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-bold">{totalVehicles || customer.number_of_vehicles || 0} véh.</span>
        </div>
        {(() => {
          const eqTypes = (cust as any).equipment_types as string[] | undefined;
          const isMulti = cust.equipment_type === 'Multi-équipement' && Array.isArray(eqTypes) && eqTypes.length > 0;
          const displayEq = isMulti ? eqTypes.join(', ') : cust.equipment_type;
          return displayEq ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs">{displayEq}</span>
            </div>
          ) : null;
        })()}
        {customer.last_visit_date && (
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs">{new Date(customer.last_visit_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          </div>
        )}
        {/* Zone */}
        <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 flex-wrap">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={(customer as any).zone || 'none'}
            onValueChange={v => {
              const isManual = v !== 'none';
              updateCustomerMutation.mutate({
                zone: v === 'none' ? null : v,
                assignment_mode: isManual ? 'manual' : 'automatic',
                assignment_source: isManual ? null : (customer as any).assignment_source,
                zone_status: isManual ? 'assigned' : 'outside',
              } as any);
            }}
          >
            <SelectTrigger className="h-7 border-0 bg-transparent p-0 text-xs font-medium w-auto min-w-[100px]">
              <SelectValue placeholder="Zone..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucune zone</SelectItem>
              {zones.map(z => (
                <SelectItem key={z.id} value={z.system_name}>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: z.color }} />
                    {formatZoneName(z)}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Assignment info badges */}
          {(customer as any).zone && (
            <Badge variant="outline" className="text-[9px] h-4">
              {formatAssignmentSource((customer as any).assignment_source, (customer as any).assignment_mode || 'manual')}
            </Badge>
          )}
          {(customer as any).zone_status === 'to_confirm' && (
            <Badge className="text-[9px] h-4 bg-warning/15 text-warning">⚠ Zone à confirmer</Badge>
          )}
          {(customer as any).zone_status === 'outside' && !(customer as any).zone && (
            <Badge className="text-[9px] h-4 bg-muted text-muted-foreground">Hors zone</Badge>
          )}
          {/* Auto-suggest if no zone set */}
          {!(customer as any).zone && (() => {
            const suggested = findMatchingZone(zones, customer.city, customer.postal_code);
            if (!suggested) return null;
            return (
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-primary"
                onClick={() => updateCustomerMutation.mutate({ 
                  zone: suggested.system_name,
                  assignment_mode: 'automatic',
                  assignment_source: 'city',
                  zone_status: 'assigned',
                } as any)}>
                → {formatZoneName(suggested)}
              </Button>
            );
          })()}
          {/* Recalculate button */}
          {(customer as any).assignment_mode !== 'manual' && (
            <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-primary"
              onClick={async () => {
                const result = await autoAssignCustomer(customer.id, {
                  latitude: customer.latitude,
                  longitude: customer.longitude,
                  postal_code: customer.postal_code,
                  city: customer.city,
                }, { force: true });
                if (result.zone_status === 'assigned') toast.success(`Zone assignée : ${result.zone}`);
                else if (result.zone_status === 'to_confirm') toast.warning('Plusieurs zones possibles');
                else toast.info('Aucune zone correspondante');
                queryClient.invalidateQueries({ queryKey: ['customer', id] });
              }}>
              ↻ Recalculer
            </Button>
          )}
        </div>
      </div>

      {/* Convert / status banners */}
      {status === 'prospect' && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-3 flex items-center gap-3">
            <ArrowRightCircle className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Ce compte est un prospect</p>
              <p className="text-[11px] text-muted-foreground">Qualifiez ce prospect pour pouvoir demander sa conversion</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 border-warning/30 text-warning hover:bg-warning/10"
              onClick={() => qualifyMutation.mutate()} disabled={qualifyMutation.isPending}>
              {qualifyMutation.isPending ? 'Qualification...' : 'Qualifier le prospect'}
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'prospect_qualifie' && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="p-3 flex items-center gap-3">
            <ArrowRightCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Prospect qualifié</p>
              <p className="text-[11px] text-muted-foreground">Ce prospect a du potentiel. Demandez la conversion en client.</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/50"
              onClick={() => setConversionSheetOpen(true)}>
              Demander la conversion
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'pending_conversion' && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-primary shrink-0 animate-spin" />
            <div className="flex-1">
              <p className="text-sm font-medium text-primary">Validation admin en attente</p>
              <p className="text-[11px] text-muted-foreground">La demande de conversion attend l'approbation d'un administrateur</p>
            </div>
          </CardContent>
        </Card>
      )}

      {(status === 'client_actif' || status === 'client_inactif') && role === 'admin' && (
        <Card className="border-muted">
          <CardContent className="p-3 flex items-center gap-3">
            <ArrowRightCircle className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground">Action admin</p>
            </div>
            <Button size="sm" variant="ghost" className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => { setRollbackTarget('prospect_qualifie'); setRollbackDialogOpen(true); }}>
              Rebasculer en prospect
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── 2. QUICK ACTIONS ─── */}
      <div className="grid grid-cols-4 gap-2">
        {phoneNumber ? (
          <a href={`tel:${phoneNumber}`}>
            <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium"><Phone className="h-5 w-5 text-primary" />Appeler</Button>
          </a>
        ) : (
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium" disabled><Phone className="h-5 w-5 text-muted-foreground" />Appeler</Button>
        )}
        {address ? (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress || address)}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium"><Navigation className="h-5 w-5 text-primary" />Naviguer</Button>
          </a>
        ) : (
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium" disabled><Navigation className="h-5 w-5 text-muted-foreground" />Naviguer</Button>
        )}
        <Button variant="outline" className="h-14 flex-col gap-1 text-xs font-medium" onClick={() => setReportOpen(true)}>
          <FileText className="h-5 w-5 text-primary" />Rapport
        </Button>
        <Link to="/taches">
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium"><CheckSquare className="h-5 w-5 text-primary" />Tâche</Button>
        </Link>
      </div>

      {/* ─── 3. BUSINESS PROFILE ─── */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Profil commercial</span>
            {!editingBusiness && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={startEditBusiness}>
                <Pencil className="h-3.5 w-3.5 mr-1" />Modifier
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {editingBusiness ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type de client</label>
                <Select value={fleetForm.activity_type} onValueChange={v => setFleetForm(f => ({ ...f, activity_type: v }))}>
                  <SelectTrigger className="h-10 mt-1"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Équipement principal</label>
                <Select value={fleetForm.equipment_type} onValueChange={v => setFleetForm(f => ({ ...f, equipment_type: v, equipment_types: v === 'Multi-équipement' ? f.equipment_types : [] }))}>
                  <SelectTrigger className="h-10 mt-1"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {fleetForm.equipment_type === 'Multi-équipement' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Types d'équipements présents</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {EQUIPMENT_SUB_TYPES.map(t => (
                      <label key={t} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50 text-sm">
                        <Checkbox
                          checked={fleetForm.equipment_types.includes(t)}
                          onCheckedChange={(checked) => {
                            setFleetForm(f => ({
                              ...f,
                              equipment_types: checked
                                ? [...f.equipment_types, t]
                                : f.equipment_types.filter(x => x !== t),
                            }));
                          }}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                  {fleetForm.equipment_types.length === 0 && (
                    <p className="text-xs text-destructive mt-1">Veuillez sélectionner au moins un type d'équipement</p>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Flotte véhicules</label>
                <div className="grid grid-cols-2 gap-2">
                  {FLEET_KEYS.map(key => (
                    <div key={key} className="flex items-center gap-2 rounded-lg border p-2">
                      <span className="text-xs flex-1">{FLEET_LABELS[key]}</span>
                      <Input
                        type="number" min={0}
                        value={fleetForm[key]}
                        onChange={e => setFleetForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
                        className="h-8 w-16 text-sm text-center px-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveBusiness} disabled={updateCustomerMutation.isPending}>
                  {updateCustomerMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingBusiness(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Customer type & equipment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Type de client</p>
                  <p className="text-sm font-medium mt-0.5">{cust.activity_type || <span className="text-muted-foreground italic">Non renseigné</span>}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {cust.equipment_type === 'Multi-équipement' ? 'Équipements' : 'Équipement principal'}
                  </p>
                  <p className="text-sm font-medium mt-0.5">
                    {(() => {
                      const eqTypes = (cust as any).equipment_types as string[] | undefined;
                      if (cust.equipment_type === 'Multi-équipement' && Array.isArray(eqTypes) && eqTypes.length > 0) {
                        return eqTypes.join(', ');
                      }
                      return cust.equipment_type || <span className="text-muted-foreground italic">Non renseigné</span>;
                    })()}
                  </p>
                </div>
              </div>

              {/* Fleet breakdown */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Flotte véhicules</p>
                {totalVehicles > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {FLEET_KEYS.map(key => (
                      <div key={key} className="rounded-lg bg-muted p-2 text-center">
                        <p className="text-lg font-bold">{fleetData[key]}</p>
                        <p className="text-[10px] text-muted-foreground">{FLEET_LABELS[key]}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Aucune flotte renseignée</p>
                )}
              </div>

              {/* Visit frequency & status */}
              {(() => {
                const effectiveFreq = cust.visit_frequency || getDefaultFrequency(status);
                const visitStatusResult = computeVisitStatus(effectiveFreq, customer.last_visit_date);
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Fréquence de visite</p>
                        <Select
                          value={cust.visit_frequency || getDefaultFrequency(status)}
                          onValueChange={v => updateCustomerMutation.mutate({ visit_frequency: v } as any)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VISIT_FREQUENCIES.map(f => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Jour préféré</p>
                        <Select
                          value={cust.preferred_visit_day || 'aucun'}
                          onValueChange={v => updateCustomerMutation.mutate({ preferred_visit_day: v === 'aucun' ? null : v } as any)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PREFERRED_DAYS.map(d => (
                              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Visit status display */}
                    <div className="rounded-lg border p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium">Statut de visite</p>
                          <p className="text-[11px] text-muted-foreground">
                            {customer.last_visit_date
                              ? `Dernière visite : ${new Date(customer.last_visit_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
                              : 'Jamais visité'}
                            {visitStatusResult.daysSinceVisit !== null && ` (il y a ${visitStatusResult.daysSinceVisit}j)`}
                          </p>
                        </div>
                      </div>
                      <Badge className={`text-xs ${visitStatusResult.bgColor} ${visitStatusResult.color}`}>
                        {visitStatusResult.label}
                      </Badge>
                    </div>
                  </div>
                );
              })()}

              {/* Visit duration */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Durée de visite</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={cust.visit_duration_minutes ? String(cust.visit_duration_minutes) : 'default'}
                    onValueChange={v => updateCustomerMutation.mutate({ visit_duration_minutes: v === 'default' ? null : parseInt(v) } as any)}
                  >
                    <SelectTrigger className="h-8 w-[140px] text-sm">
                      <SelectValue placeholder="Par défaut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Par défaut</SelectItem>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="20">20 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="45">45 min</SelectItem>
                      <SelectItem value="60">60 min</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {!cust.visit_duration_minutes && (
                      <>Défaut : {status === 'prospect' || status === 'prospect_qualifie' ? '20' : '30'} min</>
                    )}
                  </span>
                </div>
              </div>

              {/* Potential breakdown */}
              {fleetPotential.annual > 0 && (
                <div className="rounded-lg bg-accent/5 border border-accent/20 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-accent">CA potentiel calculé</p>
                    <span className="text-sm font-bold text-accent">{formatMonthly(fleetPotential.annual)}</span>
                  </div>
                  <div className="space-y-0.5">
                    {fleetPotential.breakdown.filter(b => b.count > 0).map(b => (
                      <div key={b.label} className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{b.count} {b.label} × {b.unitPotential}€/an</span>
                        <span className="font-medium">{(b.total / 12).toFixed(0)}€/mois</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 4. PRIORITY ─── */}
      <Card className={`border-l-4 ${priority.level === 'high' ? 'border-l-destructive' : priority.level === 'medium' ? 'border-l-warning' : 'border-l-muted'}`}>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Priorité commerciale</span>
            <Badge className={`text-[10px] ${prioConfig.bgColor} ${prioConfig.color}`}>{prioConfig.emoji} {prioConfig.label} ({priority.score})</Badge>
          </CardTitle>
        </CardHeader>
        {priority.reasons.length > 0 && (
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {priority.reasons.map((r, i) => <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>)}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ─── 5. CONTACTS ─── */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><User className="h-4 w-4 text-primary" />Contacts</span>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddingContact(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />Ajouter
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {contacts.length === 0 && !addingContact && (
            <div className="text-center py-4 space-y-2">
              <User className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aucun contact renseigné</p>
              <Button variant="outline" size="sm" onClick={() => setAddingContact(true)}><Plus className="h-3.5 w-3.5 mr-1" />Ajouter un contact</Button>
            </div>
          )}

          {contacts.map((contact) => (
            <div key={contact.id} className="rounded-xl border border-border p-3 space-y-2">
              {editingContact === contact.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editContactData.first_name} onChange={e => setEditContactData(d => ({ ...d, first_name: e.target.value }))} placeholder="Prénom" className="h-9 text-sm" />
                    <Input value={editContactData.last_name} onChange={e => setEditContactData(d => ({ ...d, last_name: e.target.value }))} placeholder="Nom" className="h-9 text-sm" />
                  </div>
                  <Input value={editContactData.role} onChange={e => setEditContactData(d => ({ ...d, role: e.target.value }))} placeholder="Rôle" className="h-9 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="tel" value={editContactData.phone} onChange={e => setEditContactData(d => ({ ...d, phone: e.target.value }))} placeholder="Téléphone" className="h-9 text-sm" />
                    <Input type="email" value={editContactData.email} onChange={e => setEditContactData(d => ({ ...d, email: e.target.value }))} placeholder="Email" className="h-9 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 text-xs" onClick={() => updateContactMutation.mutate({ contactId: contact.id, data: editContactData })} disabled={!editContactData.first_name || !editContactData.last_name || updateContactMutation.isPending}>Enregistrer</Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingContact(null)}>Annuler</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="h-4 w-4 text-primary" /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold truncate">{contact.first_name} {contact.last_name}</p>
                          {contact.is_primary && <Badge variant="secondary" className="text-[9px] h-4 shrink-0">Principal</Badge>}
                        </div>
                        {contact.role && <p className="text-[11px] text-muted-foreground">{contact.role}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!contact.is_primary && (
                        <button type="button" onClick={() => setPrimaryMutation.mutate(contact.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors" title="Définir comme principal"><Star className="h-3.5 w-3.5" /></button>
                      )}
                      <button type="button" onClick={() => { setEditingContact(contact.id); setEditContactData({ first_name: contact.first_name, last_name: contact.last_name, role: contact.role || '', phone: contact.phone || '', email: contact.email || '' }); }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => { if (confirm('Supprimer ce contact ?')) deleteContactMutation.mutate(contact.id); }} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-11">
                    {contact.phone && (
                      <>
                        <a href={`tel:${contact.phone}`}><Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"><Phone className="h-3.5 w-3.5" />{contact.phone}</Button></a>
                        <a href={`https://wa.me/${contact.phone.replace(/\s+/g, '').replace(/^0/, '33')}`} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="icon" className="h-8 w-8" title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></Button></a>
                      </>
                    )}
                    {contact.email && <a href={`mailto:${contact.email}`}><Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"><Mail className="h-3.5 w-3.5" />{contact.email}</Button></a>}
                  </div>
                </>
              )}
            </div>
          ))}

          {addingContact && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-medium text-primary">Nouveau contact</p>
              <div className="grid grid-cols-2 gap-2">
                <Input value={newContact.first_name} onChange={e => setNewContact(c => ({ ...c, first_name: e.target.value }))} placeholder="Prénom *" className="h-9 text-sm" />
                <Input value={newContact.last_name} onChange={e => setNewContact(c => ({ ...c, last_name: e.target.value }))} placeholder="Nom *" className="h-9 text-sm" />
              </div>
              <Input value={newContact.role} onChange={e => setNewContact(c => ({ ...c, role: e.target.value }))} placeholder="Rôle (ex: Gérant)" className="h-9 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Input type="tel" value={newContact.phone} onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))} placeholder="Téléphone" className="h-9 text-sm" />
                <Input type="email" value={newContact.email} onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))} placeholder="Email" className="h-9 text-sm" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-8 text-xs" onClick={() => addContactMutation.mutate(newContact)} disabled={!newContact.first_name || !newContact.last_name || addContactMutation.isPending}>Ajouter</Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setAddingContact(false); setNewContact({ first_name: '', last_name: '', role: '', phone: '', email: '' }); }}>Annuler</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 6. ADDRESS ─── */}
      {(fullAddress || address) && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm flex-1">{fullAddress || address}</p>
            </div>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress || address)}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="w-full h-9 text-xs gap-1.5">
                <Navigation className="h-3.5 w-3.5" />Ouvrir dans Google Maps<ExternalLink className="h-3 w-3 ml-auto" />
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* ─── 7. REVENUE HISTORY ─── */}
      <RevenueHistoryCard customerId={customer.id} annualRevenuePotential={displayRevenue} />

      {/* ─── 8. VISIT REPORT HISTORY ─── */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Historique des rapports de visite</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setReportOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />Rapport
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {visitReports.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aucun rapport de visite</p>
              <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Créer un rapport
              </Button>
            </div>
          ) : (
            visitReports.map((report: any) => (
              <div key={report.id} className="rounded-xl border border-border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {new Date(report.visit_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Badge>
                    {report.quick_outcome && (
                      <Badge className={`text-[9px] ${
                        report.quick_outcome === 'positive' ? 'bg-accent/15 text-accent' :
                        report.quick_outcome === 'negative' ? 'bg-destructive/15 text-destructive' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {report.quick_outcome === 'positive' ? '✓ Positif' : report.quick_outcome === 'negative' ? '✗ Négatif' : '◌ Neutre'}
                      </Badge>
                    )}
                  </div>
                  {report.profiles && (
                    <span className="text-[10px] text-muted-foreground">{(report.profiles as any)?.full_name}</span>
                  )}
                </div>
                {(report.visit_purpose || report.summary) && (
                  <p className="text-sm font-medium line-clamp-1">{report.visit_purpose || report.summary}</p>
                )}
                {report.summary && report.visit_purpose && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{report.summary}</p>
                )}
                {report.next_actions && (
                  <div className="flex items-center gap-1.5 text-[11px] text-primary">
                    <ArrowRightCircle className="h-3 w-3 shrink-0" />
                    <span className="line-clamp-1">{report.next_actions}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ─── 9. TIMELINE (tasks + older interactions) ─── */}
      {tasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="font-heading text-sm flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-primary" />Tâches récentes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 rounded-lg border p-3">
                <Badge className={`text-[9px] shrink-0 ${task.status === 'done' ? 'bg-accent/10 text-accent' : task.priority === 'high' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                  {task.due_date ? new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : 'Sans date'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  {task.description && <p className="text-[11px] text-muted-foreground line-clamp-1">{task.description}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={customer.company_name} />

      <ConversionRequestSheet
        open={conversionSheetOpen}
        onOpenChange={setConversionSheetOpen}
        customer={customer}
        onSubmit={(comment) => conversionRequestMutation.mutate(comment)}
        isPending={conversionRequestMutation.isPending}
      />

      {/* Rollback dialog (admin only) */}
      <Dialog open={rollbackDialogOpen} onOpenChange={setRollbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rebasculer le statut</DialogTitle>
            <DialogDescription>Toutes les données (rapports, tâches, contacts, CA) seront conservées.</DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nouveau statut</label>
            <Select value={rollbackTarget} onValueChange={(v: any) => setRollbackTarget(v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prospect_qualifie">Prospect qualifié</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={rollbackReason}
            onChange={e => setRollbackReason(e.target.value)}
            placeholder="Raison du changement (optionnel)..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRollbackDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={() => rollbackMutation.mutate({ reason: rollbackReason, target: rollbackTarget })} disabled={rollbackMutation.isPending}>
              {rollbackMutation.isPending ? 'En cours...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
