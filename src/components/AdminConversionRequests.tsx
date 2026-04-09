import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRightCircle, Check, X, Loader2, Truck, Building2, Wrench } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FLEET_KEYS, FLEET_LABELS } from '@/hooks/useVehiclePotentials';
import { Link } from 'react-router-dom';

export function AdminConversionRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['conversion-requests'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('conversion_requests')
        .select('*, customers(company_name, activity_type, equipment_type, fleet_pl, fleet_vu, fleet_remorque, fleet_car_bus, number_of_vehicles), profiles:requested_by(full_name)')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const pendingRequests = requests.filter((r: any) => r.status === 'pending');
  const pastRequests = requests.filter((r: any) => r.status !== 'pending');

  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const req = requests.find((r: any) => r.id === requestId);
      if (!req) throw new Error('Request not found');

      const { error: e1 } = await (supabase as any)
        .from('conversion_requests')
        .update({ status: 'approved', reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
        .eq('id', requestId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from('customers')
        .update({ customer_type: 'client_actif' })
        .eq('id', req.customer_id);
      if (e2) throw e2;

      await (supabase as any).from('activity_logs').insert({
        user_id: user!.id,
        entity_type: 'customer',
        entity_id: req.customer_id,
        action: 'conversion_approved',
        details: { from: 'pending_conversion', to: 'client_actif', request_id: requestId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversion-requests'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Conversion validée — client actif');
    },
    onError: () => toast.error('Erreur lors de la validation'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const req = requests.find((r: any) => r.id === requestId);
      if (!req) throw new Error('Request not found');

      const { error: e1 } = await (supabase as any)
        .from('conversion_requests')
        .update({ status: 'rejected', reviewed_by: user!.id, reviewed_at: new Date().toISOString(), review_comment: reason || null })
        .eq('id', requestId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from('customers')
        .update({ customer_type: 'prospect_qualifie' })
        .eq('id', req.customer_id);
      if (e2) throw e2;

      await (supabase as any).from('activity_logs').insert({
        user_id: user!.id,
        entity_type: 'customer',
        entity_id: req.customer_id,
        action: 'conversion_rejected',
        details: { from: 'pending_conversion', to: 'prospect_qualifie', request_id: requestId, reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversion-requests'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setRejectId(null);
      setRejectReason('');
      toast.success('Conversion refusée — statut remis en prospect qualifié');
    },
    onError: () => toast.error('Erreur lors du refus'),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Pending */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <ArrowRightCircle className="h-5 w-5 text-warning" />
              Demandes en attente
              {pendingRequests.length > 0 && (
                <Badge className="bg-warning/15 text-warning text-xs ml-1">{pendingRequests.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune demande en attente</p>
            ) : (
              pendingRequests.map((req: any) => {
                const cust = req.customers;
                const fleet = { fleet_pl: cust?.fleet_pl || 0, fleet_vu: cust?.fleet_vu || 0, fleet_remorque: cust?.fleet_remorque || 0, fleet_car_bus: cust?.fleet_car_bus || 0 };
                return (
                  <div key={req.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Link to={`/clients/${req.customer_id}`} className="text-sm font-semibold hover:underline">
                        {cust?.company_name || 'Client'}
                      </Link>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {cust?.activity_type && (
                        <Badge variant="outline" className="text-[10px] gap-1"><Building2 className="h-3 w-3" />{cust.activity_type}</Badge>
                      )}
                      {cust?.equipment_type && (
                        <Badge variant="outline" className="text-[10px] gap-1"><Wrench className="h-3 w-3" />{cust.equipment_type}</Badge>
                      )}
                      {FLEET_KEYS.map(k => fleet[k] > 0 && (
                        <Badge key={k} variant="secondary" className="text-[10px]">{fleet[k]} {FLEET_LABELS[k]}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>Par : {(req.profiles as any)?.full_name || 'Commercial'}</span>
                    </div>
                    {req.comment && (
                      <p className="text-xs text-muted-foreground bg-muted rounded-md p-2 italic">"{req.comment}"</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="h-8 text-xs gap-1" onClick={() => approveMutation.mutate(req.id)} disabled={approveMutation.isPending}>
                        <Check className="h-3.5 w-3.5" />Valider
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => { setRejectId(req.id); setRejectReason(''); }}>
                        <X className="h-3.5 w-3.5" />Refuser
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Past decisions */}
        {pastRequests.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm">Historique des décisions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pastRequests.slice(0, 10).map((req: any) => (
                <div key={req.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <Badge className={`text-[9px] shrink-0 ${req.status === 'approved' ? 'bg-accent/15 text-accent' : 'bg-destructive/15 text-destructive'}`}>
                    {req.status === 'approved' ? '✓ Validée' : '✗ Refusée'}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <Link to={`/clients/${req.customer_id}`} className="text-sm font-medium hover:underline truncate block">
                      {req.customers?.company_name || 'Client'}
                    </Link>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={() => setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la conversion</DialogTitle>
            <DialogDescription>Le prospect sera remis en statut "Prospect". Vous pouvez indiquer une raison.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Raison du refus (optionnel)..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={() => rejectId && rejectMutation.mutate({ requestId: rejectId, reason: rejectReason })} disabled={rejectMutation.isPending}>
              {rejectMutation.isPending ? 'Refus...' : 'Confirmer le refus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
