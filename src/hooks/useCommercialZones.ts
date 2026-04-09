import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommercialZone {
  id: string;
  name: string;
  color: string;
}

export function useCommercialZones() {
  return useQuery({
    queryKey: ['commercial-zones'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('commercial_zones').select('*').order('name');
      if (error) throw error;
      return (data || []) as CommercialZone[];
    },
  });
}
