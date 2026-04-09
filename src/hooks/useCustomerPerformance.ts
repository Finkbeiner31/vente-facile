import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import { analyzeCustomerPerformance, type CustomerPerformance, type RevenueData } from '@/lib/performanceUtils';

/**
 * Hook to fetch revenue history and compute performance for a single customer.
 */
export function useCustomerPerformance(customerId: string | undefined, annualRevenuePotential: number) {
  const { data: revenues = [] } = useQuery({
    queryKey: ['customer-revenues', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data } = await supabase
        .from('monthly_revenues')
        .select('month, year, monthly_revenue')
        .eq('customer_id', customerId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(12);
      return (data || []) as RevenueData[];
    },
    enabled: !!customerId,
  });

  return useMemo(
    () => analyzeCustomerPerformance(annualRevenuePotential, revenues),
    [annualRevenuePotential, revenues]
  );
}

/**
 * Hook to fetch ALL customer revenues (for list/map/dashboard) with batch loading.
 */
export function useAllCustomerRevenues() {
  return useQuery({
    queryKey: ['all-customer-revenues'],
    queryFn: async () => {
      const { data } = await supabase
        .from('monthly_revenues')
        .select('customer_id, month, year, monthly_revenue')
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      // Group by customer_id
      const map = new Map<string, RevenueData[]>();
      for (const r of data || []) {
        if (!map.has(r.customer_id)) map.set(r.customer_id, []);
        map.get(r.customer_id)!.push({
          month: r.month,
          year: r.year,
          monthly_revenue: Number(r.monthly_revenue),
        });
      }
      return map;
    },
    staleTime: 60_000,
  });
}
