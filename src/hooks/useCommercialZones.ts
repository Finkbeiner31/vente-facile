import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CommercialZone {
  id: string;
  name: string;
  color: string;
  user_id: string | null;
  cities: string[];
  postal_codes: string[];
}

export function useCommercialZones() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['commercial-zones', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('commercial_zones').select('*').order('name');
      if (error) throw error;
      return (data || []).map((z: any) => ({
        ...z,
        cities: z.cities || [],
        postal_codes: z.postal_codes || [],
      })) as CommercialZone[];
    },
    enabled: !!user,
  });
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
