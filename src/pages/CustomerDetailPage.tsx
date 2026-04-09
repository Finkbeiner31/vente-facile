import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Star, Mail, MessageCircle,
} from 'lucide-react';
import { RevenueHistoryCard } from '@/components/RevenueHistoryCard';
import { useCustomerPerformance } from '@/hooks/useCustomerPerformance';
import { computeVisitPriority, PRIORITY_CONFIGS } from '@/lib/priorityEngine';

type CustomerStatus = 'prospect' | 'client_actif' | 'client_inactif';

const statusConfig: Record<CustomerStatus, { label: string; class: string }> = {
  prospect: { label: 'Prospect', class: 'bg-warning/15 text-warning' },
  client_actif: { label: 'Client actif', class: 'bg-accent/15 text-accent' },
  client_inactif: { label: 'Inactif', class: 'bg-muted text-muted-foreground' },
};

const typeColors: Record<string, string> = {
  visit: 'bg-primary/10 text-primary',
  task: 'bg-accent/10 text-accent',
  opportunity: 'bg-warning/10 text-warning',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [editingVehicles, setEditingVehicles] = useState(false);
  const [vehicleValue, setVehicleValue] = useState('');
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', role: '', phone: '', email: '' });
  const [editContactData, setEditContactData] = useState({ first_name: '', last_name: '', role: '', phone: '', email: '' });
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

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('customer_id', id!)
        .order('is_primary', { ascending: false });
      return data || [];
    },
    enabled: !authLoading && !!user && isValidId,
  });

  const { data: visitReports = [] } = useQuery({
    queryKey: ['visit-reports', id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('visit_reports')
        .select('*')
        .eq('customer_id', id!)
        .order('visit_date', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !authLoading && !!user && isValidId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['customer-tasks', id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('customer_id', id!)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !authLoading && !!user && isValidId,
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('customers')
        .update({ customer_type: 'client_actif' })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Converti en Client actif');
    },
  });

  const vehicleMutation = useMutation({
    mutationFn: async (count: number) => {
      const { error } = await supabase
        .from('customers')
        .update({ number_of_vehicles: count })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      setEditingVehicles(false);
      toast.success('Nombre de véhicules mis à jour');
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async (contact: typeof newContact) => {
      const isPrimary = contacts.length === 0;
      const { error } = await supabase.from('contacts').insert({
        customer_id: id!,
        first_name: contact.first_name,
        last_name: contact.last_name,
        role: contact.role || null,
        phone: contact.phone || null,
        email: contact.email || null,
        is_primary: isPrimary,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', id] });
      setAddingContact(false);
      setNewContact({ first_name: '', last_name: '', role: '', phone: '', email: '' });
      toast.success('Contact ajouté');
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, data }: { contactId: string; data: typeof editContactData }) => {
      const { error } = await supabase.from('contacts').update({
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role || null,
        phone: data.phone || null,
        email: data.email || null,
      }).eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', id] });
      setEditingContact(null);
      toast.success('Contact modifié');
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', id] });
      toast.success('Contact supprimé');
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (contactId: string) => {
      // Unset all primary
      await supabase.from('contacts').update({ is_primary: false }).eq('customer_id', id!);
      const { error } = await supabase.from('contacts').update({ is_primary: true }).eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', id] });
      toast.success('Contact principal défini');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isValidId || error || !customer) {
    return (
      <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
        <div className="flex items-center gap-3">
          <Link to="/clients">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-heading text-lg font-bold">Retour</h1>
        </div>
        <div className="py-12 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-warning" />
          <p className="mt-3 text-sm font-medium">Client introuvable</p>
          <p className="text-xs text-muted-foreground mt-1">L'identifiant "{id}" ne correspond à aucun client.</p>
        </div>
      </div>
    );
  }

  const status = (customer.customer_type || 'prospect') as CustomerStatus;
  const sc = statusConfig[status] || statusConfig.prospect;
  const tier = getRevenueTier(revenue);

  const priority = computeVisitPriority(
    perf, customer.last_visit_date, customer.visit_frequency,
    null, null, customer.latitude, customer.longitude,
  );
  const prioConfig = PRIORITY_CONFIGS[priority.level];

  const timeline = [
    ...visitReports.map(r => ({
      date: new Date(r.visit_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      type: 'visit' as const,
      title: r.visit_purpose || r.summary || 'Visite',
      detail: r.quick_outcome || r.summary || '',
    })),
    ...tasks.map(t => ({
      date: new Date(t.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      type: 'task' as const,
      title: t.title,
      detail: t.description || '',
    })),
  ].sort((a, b) => 0).slice(0, 6);

  const primaryContact = contacts.find(c => c.is_primary) || contacts[0];
  const phoneNumber = primaryContact?.phone || customer.phone || '';
  const address = customer.address ? `${customer.address}${customer.city ? ', ' + customer.city : ''}` : customer.city || '';
  const fullAddress = [customer.address, customer.postal_code, customer.city].filter(Boolean).join(', ');

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* ─── 1. HEADER ─── */}
      <div className="flex items-start gap-3">
        <Link to="/clients">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 mt-0.5">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-heading text-xl md:text-2xl font-bold truncate">{customer.company_name}</h1>
            <Badge className={`text-[10px] shrink-0 ${sc.class}`}>{sc.label}</Badge>
          </div>
          {(customer.city || customer.address) && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              <MapPin className="inline h-3 w-3 mr-0.5 -mt-0.5" />
              {customer.city}{customer.address ? ` · ${customer.address}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Key metrics row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">CA pot.</span>
          <span className={`text-sm font-bold ${getRevenueTierColor(tier)}`}>{formatMonthly(revenue)}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
          <Car className="h-3.5 w-3.5 text-muted-foreground" />
          {editingVehicles ? (
            <form className="flex items-center gap-1" onSubmit={(e) => {
              e.preventDefault();
              const v = parseInt(vehicleValue, 10);
              if (!isNaN(v) && v >= 0) vehicleMutation.mutate(v);
            }}>
              <Input
                type="number"
                min={0}
                value={vehicleValue}
                onChange={e => setVehicleValue(e.target.value)}
                className="h-6 w-16 text-xs px-1.5"
                autoFocus
              />
              <Button type="submit" size="sm" className="h-6 px-2 text-[10px]" disabled={vehicleMutation.isPending}>OK</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => setEditingVehicles(false)}>✕</Button>
            </form>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-bold hover:text-primary transition-colors"
              onClick={() => { setVehicleValue(String(customer.number_of_vehicles || 0)); setEditingVehicles(true); }}
            >
              {customer.number_of_vehicles || 0} véh.
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        {customer.visit_frequency && (
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs">{customer.visit_frequency}</span>
          </div>
        )}
        {customer.last_visit_date && (
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
            <span className="text-[10px] text-muted-foreground">Dernière visite</span>
            <span className="text-xs font-medium">
              {new Date(customer.last_visit_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            </span>
          </div>
        )}
      </div>

      {/* Convert banner for prospects */}
      {status === 'prospect' && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-3 flex items-center gap-3">
            <ArrowRightCircle className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Ce compte est un prospect</p>
              <p className="text-[11px] text-muted-foreground">Convertissez-le après validation commerciale</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 border-warning/30 text-warning hover:bg-warning/10"
              onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
              {convertMutation.isPending ? 'Conversion...' : 'Convertir'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── 2. QUICK ACTIONS ─── */}
      <div className="grid grid-cols-4 gap-2">
        {phoneNumber ? (
          <a href={`tel:${phoneNumber}`}>
            <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium">
              <Phone className="h-5 w-5 text-primary" />
              Appeler
            </Button>
          </a>
        ) : (
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium" disabled>
            <Phone className="h-5 w-5 text-muted-foreground" />
            Appeler
          </Button>
        )}
        {address ? (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress || address)}`}
            target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium">
              <Navigation className="h-5 w-5 text-primary" />
              Naviguer
            </Button>
          </a>
        ) : (
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium" disabled>
            <Navigation className="h-5 w-5 text-muted-foreground" />
            Naviguer
          </Button>
        )}
        <Button variant="outline" className="h-14 flex-col gap-1 text-xs font-medium" onClick={() => setReportOpen(true)}>
          <FileText className="h-5 w-5 text-primary" />
          Rapport
        </Button>
        <Link to="/taches">
          <Button variant="outline" className="w-full h-14 flex-col gap-1 text-xs font-medium">
            <CheckSquare className="h-5 w-5 text-primary" />
            Tâche
          </Button>
        </Link>
      </div>

      {/* Next Action */}
      {customer.next_action_description && (
        <Card className="border-primary/20">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                Action à faire{customer.next_action_date ? ` · ${new Date(customer.next_action_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
              </p>
              <p className="text-sm font-medium truncate">{customer.next_action_description}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 3. PERFORMANCE (Priority) ─── */}
      <Card className={`border-l-4 ${priority.level === 'high' ? 'border-l-destructive' : priority.level === 'medium' ? 'border-l-warning' : 'border-l-muted'}`}>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Priorité commerciale
            </span>
            <Badge className={`text-[10px] ${prioConfig.bgColor} ${prioConfig.color}`}>
              {prioConfig.emoji} {prioConfig.label} ({priority.score})
            </Badge>
          </CardTitle>
        </CardHeader>
        {priority.reasons.length > 0 && (
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {priority.reasons.map((r, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ─── 4. CONTACTS ─── */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Contacts
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setAddingContact(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ajouter
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {contacts.length === 0 && !addingContact && (
            <div className="text-center py-4 space-y-2">
              <User className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aucun contact renseigné</p>
              <Button variant="outline" size="sm" onClick={() => setAddingContact(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un contact
              </Button>
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
                    <Button size="sm" className="h-8 text-xs" onClick={() => updateContactMutation.mutate({ contactId: contact.id, data: editContactData })}
                      disabled={!editContactData.first_name || !editContactData.last_name || updateContactMutation.isPending}>
                      Enregistrer
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingContact(null)}>Annuler</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
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
                        <button type="button" onClick={() => setPrimaryMutation.mutate(contact.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors" title="Définir comme principal">
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button type="button" onClick={() => {
                        setEditingContact(contact.id);
                        setEditContactData({ first_name: contact.first_name, last_name: contact.last_name, role: contact.role || '', phone: contact.phone || '', email: contact.email || '' });
                      }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => { if (confirm('Supprimer ce contact ?')) deleteContactMutation.mutate(contact.id); }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Contact actions */}
                  <div className="flex items-center gap-2 ml-11">
                    {contact.phone && (
                      <>
                        <a href={`tel:${contact.phone}`}>
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            {contact.phone}
                          </Button>
                        </a>
                        <a href={`https://wa.me/${contact.phone.replace(/\s+/g, '').replace(/^0/, '33')}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="icon" className="h-8 w-8" title="WhatsApp">
                            <MessageCircle className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`}>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          {contact.email}
                        </Button>
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Add contact form */}
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
                <Button size="sm" className="h-8 text-xs" onClick={() => addContactMutation.mutate(newContact)}
                  disabled={!newContact.first_name || !newContact.last_name || addContactMutation.isPending}>
                  Ajouter
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setAddingContact(false); setNewContact({ first_name: '', last_name: '', role: '', phone: '', email: '' }); }}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── 5. ADDRESS ─── */}
      {(fullAddress || address) && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm flex-1">{fullAddress || address}</p>
            </div>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress || address)}`}
              target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="w-full h-9 text-xs gap-1.5">
                <Navigation className="h-3.5 w-3.5" />
                Ouvrir dans Google Maps
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* ─── 6. REVENUE HISTORY ─── */}
      <RevenueHistoryCard customerId={customer.id} annualRevenuePotential={revenue} />

      {/* ─── 7. TIMELINE ─── */}
      {timeline.length > 0 ? (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="font-heading text-sm">Historique récent</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                <Badge className={`text-[9px] shrink-0 ${typeColors[item.type]}`}>{item.date}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  {item.detail && <p className="text-[11px] text-muted-foreground line-clamp-2">{item.detail}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Aucun historique pour ce client</p>
          </CardContent>
        </Card>
      )}

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={customer.company_name} />
    </div>
  );
}
