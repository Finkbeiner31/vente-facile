import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VisitDurationDefaults {
  client: number;
  prospect: number;
  prospect_qualifie: number;
}

const FALLBACKS: VisitDurationDefaults = {
  client: 20,
  prospect: 15,
  prospect_qualifie: 20,
};

export function useVisitDurationDefaults() {
  return useQuery({
    queryKey: ['visit-duration-defaults'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('app_settings')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'visit_duration_client',
          'visit_duration_prospect',
          'visit_duration_prospect_qualifie',
        ]);
      if (error) throw error;

      const map: Record<string, string> = {};
      for (const row of data || []) {
        map[row.setting_key] = row.setting_value;
      }

      return {
        client: parseInt(map['visit_duration_client']) || FALLBACKS.client,
        prospect: parseInt(map['visit_duration_prospect']) || FALLBACKS.prospect,
        prospect_qualifie: parseInt(map['visit_duration_prospect_qualifie']) || FALLBACKS.prospect_qualifie,
      } as VisitDurationDefaults;
    },
    staleTime: 300_000,
  });
}

/** Get visit duration for a customer, using admin defaults as fallback */
export function getVisitDurationWithDefaults(
  customerType: string,
  profileDuration: number | null | undefined,
  defaults: VisitDurationDefaults,
): number {
  if (profileDuration && profileDuration > 0) return profileDuration;
  if (customerType === 'prospect_qualifie') return defaults.prospect_qualifie;
  if (customerType === 'prospect') return defaults.prospect;
  return defaults.client;
}
