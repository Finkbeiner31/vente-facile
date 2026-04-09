import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CommercialZone {
  id: string;
  name: string;
  color: string;
  user_id: string | null;
}

export function useCommercialZones() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['commercial-zones', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('commercial_zones').select('*').order('name');
      if (error) throw error;
      return (data || []) as CommercialZone[];
    },
    enabled: !!user,
  });
}
