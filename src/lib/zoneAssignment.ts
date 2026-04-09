import type { CommercialZone } from '@/hooks/useCommercialZones';

export type AssignmentMode = 'manual' | 'automatic';
export type AssignmentSource = 'polygon' | 'postal_code' | 'city' | null;
export type ZoneStatus = 'assigned' | 'to_confirm' | 'outside';

export interface ZoneAssignmentResult {
  zone: string | null;            // system_name of matched zone
  zone_id: string | null;
  assignment_mode: AssignmentMode;
  assignment_source: AssignmentSource;
  zone_status: ZoneStatus;
  conflicts?: CommercialZone[];   // multiple matches
}

interface ClientGeoData {
  latitude?: number | null;
  longitude?: number | null;
  postal_code?: string | null;
  city?: string | null;
}

/** Ray-casting point-in-polygon */
function pointInPolygon(lat: number, lng: number, coords: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i].lat, yi = coords[i].lng;
    const xj = coords[j].lat, yj = coords[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Compute zone assignment for a client using priority:
 * 1. Polygon match (GPS coords inside zone polygon)
 * 2. Postal code match
 * 3. City match
 * 
 * Returns the best assignment result, handling conflicts and no-match.
 */
export function computeZoneAssignment(
  client: ClientGeoData,
  zones: CommercialZone[]
): ZoneAssignmentResult {
  if (!zones.length) {
    return { zone: null, zone_id: null, assignment_mode: 'automatic', assignment_source: null, zone_status: 'outside' };
  }

  // 1. Polygon match
  if (client.latitude && client.longitude) {
    const polygonMatches = zones.filter(z => {
      if (!z.polygon_coordinates) return false;
      const coords = z.polygon_coordinates as { lat: number; lng: number }[];
      return coords.length >= 3 && pointInPolygon(client.latitude!, client.longitude!, coords);
    });

    if (polygonMatches.length === 1) {
      return {
        zone: polygonMatches[0].system_name,
        zone_id: polygonMatches[0].id,
        assignment_mode: 'automatic',
        assignment_source: 'polygon',
        zone_status: 'assigned',
      };
    }
    if (polygonMatches.length > 1) {
      return {
        zone: null,
        zone_id: null,
        assignment_mode: 'automatic',
        assignment_source: 'polygon',
        zone_status: 'to_confirm',
        conflicts: polygonMatches,
      };
    }
  }

  // 2. Postal code match
  const pc = client.postal_code?.trim();
  if (pc) {
    const pcMatches = zones.filter(z => z.postal_codes.some(p => p.trim() === pc));
    if (pcMatches.length === 1) {
      return {
        zone: pcMatches[0].system_name,
        zone_id: pcMatches[0].id,
        assignment_mode: 'automatic',
        assignment_source: 'postal_code',
        zone_status: 'assigned',
      };
    }
    if (pcMatches.length > 1) {
      return {
        zone: null,
        zone_id: null,
        assignment_mode: 'automatic',
        assignment_source: 'postal_code',
        zone_status: 'to_confirm',
        conflicts: pcMatches,
      };
    }
  }

  // 3. City match
  const cityLower = client.city?.toLowerCase().trim();
  if (cityLower) {
    const cityMatches = zones.filter(z => z.cities.some(c => c.toLowerCase().trim() === cityLower));
    if (cityMatches.length === 1) {
      return {
        zone: cityMatches[0].system_name,
        zone_id: cityMatches[0].id,
        assignment_mode: 'automatic',
        assignment_source: 'city',
        zone_status: 'assigned',
      };
    }
    if (cityMatches.length > 1) {
      return {
        zone: null,
        zone_id: null,
        assignment_mode: 'automatic',
        assignment_source: 'city',
        zone_status: 'to_confirm',
        conflicts: cityMatches,
      };
    }
  }

  // No match
  return { zone: null, zone_id: null, assignment_mode: 'automatic', assignment_source: null, zone_status: 'outside' };
}

/** Human-readable label for assignment source */
export function formatAssignmentSource(source: AssignmentSource, mode: AssignmentMode): string {
  if (mode === 'manual') return 'Manuel';
  switch (source) {
    case 'polygon': return 'Auto — carte';
    case 'postal_code': return 'Auto — code postal';
    case 'city': return 'Auto — ville';
    default: return 'Automatique';
  }
}

/** Human-readable label for zone status */
export function formatZoneStatus(status: ZoneStatus): string {
  switch (status) {
    case 'assigned': return 'Assigné';
    case 'to_confirm': return 'Zone à confirmer';
    case 'outside': return 'Hors zone';
  }
}
