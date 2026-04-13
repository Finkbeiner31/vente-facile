import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VehiclePotential {
  id: string;
  vehicle_type: string;
  label: string;
  annual_potential: number;
}

const DEFAULT_POTENTIALS: Record<string, number> = {
  poids_lourds: 3500,
  vu: 2500,
  remorque: 2000,
  car_bus: 3000,
};

export function useVehiclePotentials() {
  return useQuery({
    queryKey: ['vehicle-type-potentials'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('vehicle_type_potentials')
        .select('*')
        .order('vehicle_type');
      if (error) throw error;
      return (data || []) as unknown as VehiclePotential[];
    },
    staleTime: 300_000,
  });
}

export function computeFleetPotential(
  fleet: { fleet_pl: number; fleet_vu: number; fleet_remorque: number; fleet_car_bus: number },
  potentials: VehiclePotential[]
): { annual: number; monthly: number; breakdown: { label: string; count: number; unitPotential: number; total: number }[] } {
  const getP = (type: string) => {
    const found = potentials.find(p => p.vehicle_type === type);
    return found ? Number(found.annual_potential) : (DEFAULT_POTENTIALS[type] || 0);
  };

  const items = [
    { label: 'Poids lourds', count: fleet.fleet_pl || 0, unitPotential: getP('poids_lourds') },
    { label: 'VU', count: fleet.fleet_vu || 0, unitPotential: getP('vu') },
    { label: 'Remorque', count: fleet.fleet_remorque || 0, unitPotential: getP('remorque') },
    { label: 'CAR & BUS', count: fleet.fleet_car_bus || 0, unitPotential: getP('car_bus') },
  ];

  const breakdown = items.map(i => ({ ...i, total: i.count * i.unitPotential }));
  const annual = breakdown.reduce((s, b) => s + b.total, 0);
  return { annual, monthly: Math.round(annual / 12), breakdown };
}

export const FLEET_KEYS = ['fleet_pl', 'fleet_vu', 'fleet_remorque', 'fleet_car_bus'] as const;
export const FLEET_LABELS: Record<string, string> = {
  fleet_pl: 'Poids lourds',
  fleet_vu: 'VU',
  fleet_remorque: 'Remorque',
  fleet_car_bus: 'CAR & BUS',
};

export const CUSTOMER_TYPES = [
  'Transport', 'Transport de personne', 'Travaux publics', 'Collectivité', 'BTP', 'Industrie', 'Location', 'Autre',
];

export const EQUIPMENT_TYPES = [
  'Hydrocureur', 'BOM', 'Grue', 'Benne', 'Plateau', 'Frigorifique', 'Citerne', 'Porte-engins', 'Caisse', 'Polybenne', 'Tautliner', 'Multi-équipement', 'Autre',
];

export const EQUIPMENT_SUB_TYPES = [
  'Hydrocureur', 'BOM', 'Grue', 'Benne', 'Plateau', 'Frigorifique', 'Citerne', 'Porte-engins', 'Caisse', 'Polybenne', 'Tautliner', 'Autre',
];
