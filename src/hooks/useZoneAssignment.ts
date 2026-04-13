import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useCommercialZones, type CommercialZone } from '@/hooks/useCommercialZones';
import { computeZoneAssignment, type ZoneAssignmentResult } from '@/lib/zoneAssignment';
import { toast } from 'sonner';

/**
 * Hook providing zone auto-assignment helpers.
 * Uses the loaded commercial zones to compute assignments.
 */
export function useZoneAssignment() {
  const { data: zones = [] } = useCommercialZones();
  const queryClient = useQueryClient();

  /** Compute assignment for a single client (pure, no DB write) */
  const computeAssignment = useCallback(
    (client: { latitude?: number | null; longitude?: number | null; postal_code?: string | null; city?: string | null }) => {
      return computeZoneAssignment(client, zones);
    },
    [zones]
  );

  /** Apply auto-assignment to a customer by ID — only if current mode is not 'manual' */
  const autoAssignCustomer = useCallback(
    async (
      customerId: string,
      client: { latitude?: number | null; longitude?: number | null; postal_code?: string | null; city?: string | null },
      options?: { force?: boolean }
    ) => {
      const result = computeZoneAssignment(client, zones);
      
      let currentRepMode = 'automatic';
      if (!options?.force) {
        // Check current assignment mode — skip if manual
        const { data: current } = await (supabase as any)
          .from('customers')
          .select('assignment_mode, rep_assignment_mode')
          .eq('id', customerId)
          .single();
        if (current?.assignment_mode === 'manual') return result;
        currentRepMode = current?.rep_assignment_mode || 'automatic';
      }

      const update: Record<string, any> = {
        zone: result.zone,
        assignment_mode: result.assignment_mode,
        assignment_source: result.assignment_source,
        zone_status: result.zone_status,
      };

      // Auto-assign commercial from zone owner if rep_assignment_mode is automatic
      if (currentRepMode !== 'manual' && result.zone_id) {
        const matchedZone = zones.find(z => z.id === result.zone_id);
        if (matchedZone?.user_id) {
          update.assigned_rep_id = matchedZone.user_id;
          update.rep_assignment_mode = 'automatic';
        }
      }

      await (supabase as any).from('customers').update(update).eq('id', customerId);
      queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });

      return result;
    },
    [zones, queryClient]
  );

  /** Bulk recalculate zones for all auto-assigned clients */
  const bulkRecalculate = useCallback(
    async (): Promise<{ assigned: number; conflicts: number; outside: number; skippedManual: number }> => {
      // Fetch all customers
      const { data: allCustomers, error } = await (supabase as any)
        .from('customers')
        .select('id, latitude, longitude, postal_code, city, assignment_mode, zone');
      if (error) throw error;

      let assigned = 0, conflicts = 0, outside = 0, skippedManual = 0;

      const updates: { id: string; update: Record<string, any> }[] = [];

      for (const c of allCustomers || []) {
        // Skip manual assignments
        if (c.assignment_mode === 'manual' && c.zone) {
          skippedManual++;
          continue;
        }

        const result = computeZoneAssignment(c, zones);
        
        const update: Record<string, any> = {
          zone: result.zone,
          assignment_mode: result.assignment_mode,
          assignment_source: result.assignment_source,
          zone_status: result.zone_status,
        };

        updates.push({ id: c.id, update });

        if (result.zone_status === 'assigned') assigned++;
        else if (result.zone_status === 'to_confirm') conflicts++;
        else outside++;
      }

      // Batch updates
      for (const { id, update } of updates) {
        await (supabase as any).from('customers').update(update).eq('id', id);
      }

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      return { assigned, conflicts, outside, skippedManual };
    },
    [zones, queryClient]
  );

  return { zones, computeAssignment, autoAssignCustomer, bulkRecalculate };
}
