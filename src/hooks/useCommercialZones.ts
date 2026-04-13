import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

export interface CommercialZone {
  id: string;
  system_name: string;
  custom_label: string | null;
  color: string;
  user_id: string | null;
  cities: string[];
  postal_codes: string[];
  polygon_coordinates: { lat: number; lng: number }[] | null;
}

/** Format zone display: "Zone 1 — Label" or just "Zone 1" */
export function formatZoneName(zone: CommercialZone): string {
  return zone.custom_label
    ? `${zone.system_name} — ${zone.custom_label}`
    : zone.system_name;
}

export function useCommercialZones() {
  const { user } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;
  
  return useQuery({
    queryKey: ['commercial-zones', activeUserId],
    queryFn: async () => {
      let query = (supabase as any).from('commercial_zones').select('*').order('system_name');
      // When we have an effective user, filter zones by that user
      if (activeUserId) {
        query = query.eq('user_id', activeUserId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((z: any) => ({
        ...z,
        cities: z.cities || [],
        postal_codes: z.postal_codes || [],
        polygon_coordinates: z.polygon_coordinates || null,
      })) as CommercialZone[];
    },
    enabled: !!activeUserId,
  });
}

/** Compute the next system_name based on existing zones */
export function getNextSystemName(zones: CommercialZone[]): string {
  const numbers = zones
    .map(z => {
      const m = z.system_name.match(/^Zone (\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter(n => n > 0);
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `Zone ${next}`;
}

/** Find matching zone for a customer based on city/postal_code */
export function findMatchingZone(zones: CommercialZone[], city?: string | null, postalCode?: string | null): CommercialZone | null {
  if (!city && !postalCode) return null;
  const cityLower = city?.toLowerCase().trim();
  const pc = postalCode?.trim();

  for (const z of zones) {
    if (cityLower && z.cities.some(c => c.toLowerCase().trim() === cityLower)) return z;
    if (pc && z.postal_codes.some(p => p.trim() === pc)) return z;
  }
  return null;
}
