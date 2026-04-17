import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RelationshipWeights {
  magasin: number;
  mixte: number;
  atelier: number;
  unknown: number;
}

export const DEFAULT_RELATIONSHIP_WEIGHTS: RelationshipWeights = {
  magasin: 30,
  mixte: 15,
  atelier: 0,
  unknown: -10,
};

const KEYS = [
  'relationship_weight_magasin',
  'relationship_weight_mixte',
  'relationship_weight_atelier',
  'relationship_weight_unknown',
];

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(-100, Math.min(100, n));
}

export function useRelationshipWeights() {
  return useQuery({
    queryKey: ['relationship-weights'],
    queryFn: async (): Promise<RelationshipWeights> => {
      const { data, error } = await (supabase as any)
        .from('app_settings')
        .select('setting_key, setting_value')
        .in('setting_key', KEYS);
      if (error) throw error;

      const map: Record<string, string> = {};
      for (const row of data || []) map[row.setting_key] = row.setting_value;

      return {
        magasin: map['relationship_weight_magasin'] != null
          ? clamp(parseFloat(map['relationship_weight_magasin']))
          : DEFAULT_RELATIONSHIP_WEIGHTS.magasin,
        mixte: map['relationship_weight_mixte'] != null
          ? clamp(parseFloat(map['relationship_weight_mixte']))
          : DEFAULT_RELATIONSHIP_WEIGHTS.mixte,
        atelier: map['relationship_weight_atelier'] != null
          ? clamp(parseFloat(map['relationship_weight_atelier']))
          : DEFAULT_RELATIONSHIP_WEIGHTS.atelier,
        unknown: map['relationship_weight_unknown'] != null
          ? clamp(parseFloat(map['relationship_weight_unknown']))
          : DEFAULT_RELATIONSHIP_WEIGHTS.unknown,
      };
    },
    staleTime: 300_000,
  });
}

/**
 * Maps a relationship_type value to its admin-configured weight bucket.
 */
export function getRelationshipWeight(
  relationshipType: string | null | undefined,
  weights: RelationshipWeights,
): number {
  switch (relationshipType) {
    case 'magasin': return weights.magasin;
    case 'mixte': return weights.mixte;
    case 'atelier': return weights.atelier;
    default: return weights.unknown;
  }
}
