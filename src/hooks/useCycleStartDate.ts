import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_CYCLE_START_DATE } from '@/lib/weekCycleUtils';

const SETTING_KEY = 'cycle_start_date';

/** Fetch the configured cycle reference date (start of S1). */
export function useCycleStartDate() {
  return useQuery({
    queryKey: ['app-setting', SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return (data?.setting_value as string) || DEFAULT_CYCLE_START_DATE;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Admin-only mutation to update the cycle reference date. */
export function useUpdateCycleStartDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      // Upsert by setting_key (unique).
      const { error } = await (supabase as any)
        .from('app_settings')
        .upsert(
          { setting_key: SETTING_KEY, setting_value: date, label: 'Date de début du cycle 4 semaines' },
          { onConflict: 'setting_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-setting', SETTING_KEY] });
    },
  });
}
