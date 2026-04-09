import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import { useAuth } from '@/contexts/AuthContext';
import { formatMonthly, formatAnnual, getRevenueTier, getRevenueTierColor } from '@/lib/revenueUtils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Navigation, FileText, CheckSquare,
  Edit, User, Clock, MapPin, ExternalLink, Car, TrendingUp, Calendar, ArrowRightCircle, Loader2, AlertTriangle,
} from 'lucide-react';

type CustomerStatus = 'prospect' | 'client_actif' | 'client_inactif';

const statusConfig: Record<CustomerStatus, { label: string; class: string }> = {
  prospect: { label: 'Prospect', class: 'bg-warning/15 text-warning' },
  client_actif: { label: 'Client actif', class: 'bg-accent/15 text-accent' },
  client_inactif: { label: 'Inactif', class: 'bg-muted text-muted-foreground' },
};

const typeColors: Record<string, string> = {
  visit: 'bg-primary/10 text-primary',
  task: 'bg-success/10 text-success',
  opportunity: 'bg-warning/10 text-warning',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
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
  const revenue = customer.annual_revenue_potential || 0;
  const tier = getRevenueTier(revenue);

  // Build timeline from reports + tasks
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

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/clients">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-lg md:text-2xl font-bold truncate">{customer.company_name}</h1>
            <Badge className={`text-[10px] shrink-0 ${sc.class}`}>{sc.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{customer.activity_type || ''}</p>
        </div>
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
              {convertMutation.isPending ? 'Conversion...' : 'Convertir en client'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Revenue Potential */}
      <Card className="border-accent/20 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
              <TrendingUp className="h-6 w-6 text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CA potentiel</p>
              <p className={`font-heading text-2xl font-bold ${getRevenueTierColor(tier)}`}>
                {formatMonthly(revenue)}
              </p>
              <p className="text-xs text-muted-foreground">{formatAnnual(revenue)} · CA potentiel</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Car className="h-4 w-4" />
                <span className="text-lg font-bold">{customer.number_of_vehicles || 0}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">véhicules</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
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
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
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

      {/* Key Info */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dernière visite</p>
            <p className="text-sm font-semibold mt-0.5">
              {customer.last_visit_date
                ? new Date(customer.last_visit_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fréquence</p>
            <p className="text-sm font-semibold mt-0.5">{customer.visit_frequency || '—'}</p>
          </CardContent>
        </Card>
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

      {/* Contacts */}
      {contacts.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="font-heading text-sm">Contacts</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-center gap-3 rounded-xl border p-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{contact.first_name} {contact.last_name}</p>
                    {contact.is_primary && <Badge variant="secondary" className="text-[9px] h-4">Principal</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{contact.role || ''}</p>
                </div>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`}>
                    <Button variant="outline" size="icon" className="h-10 w-10 shrink-0">
                      <Phone className="h-4 w-4" />
                    </Button>
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Address */}
      {address && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
          target="_blank" rel="noopener noreferrer">
          <Card className="cursor-pointer hover:border-primary/30 transition-colors">
            <CardContent className="p-3 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm flex-1">{address}</p>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </a>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
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
                  <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {timeline.length === 0 && (
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
