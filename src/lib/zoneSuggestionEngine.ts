/**
 * Zone suggestion engine — calculates nearest zone for unassigned clients
 * using polygon centroid distance and optional point-in-polygon check.
 */

const MAX_DISTANCE_KM = 50;

interface ZoneData {
  id: string;
  system_name: string;
  custom_label: string | null;
  user_id: string | null;
  color: string | null;
  polygon_coordinates: any;
}

interface ClientData {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ZoneSuggestion {
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  distanceKm: number;
  repId: string | null;
  repName: string | null;
  confidence: number; // 1-4 stars
}

/** Haversine distance in km */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute centroid of a polygon */
function centroid(coords: { lat: number; lng: number }[]): { lat: number; lng: number } {
  let latSum = 0, lngSum = 0;
  for (const c of coords) {
    latSum += c.lat;
    lngSum += c.lng;
  }
  return { lat: latSum / coords.length, lng: lngSum / coords.length };
}

/** Parse polygon_coordinates from DB into array of {lat,lng} */
function parsePolygon(raw: any): { lat: number; lng: number }[] | null {
  try {
    const coords = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(coords) || coords.length < 3) return null;
    return coords.map((c: any) => ({
      lat: c.lat ?? c[0],
      lng: c.lng ?? c[1],
    }));
  } catch {
    return null;
  }
}

/** Point-in-polygon (ray casting) */
function pointInPolygon(pt: { lat: number; lng: number }, poly: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lat, yi = poly[i].lng;
    const xj = poly[j].lat, yj = poly[j].lng;
    const intersect = ((yi > pt.lng) !== (yj > pt.lng)) &&
      (pt.lat < (xj - xi) * (pt.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Minimum distance from a point to a polygon boundary (approximate) */
function minDistToPolygon(pt: { lat: number; lng: number }, poly: { lat: number; lng: number }[]): number {
  let minDist = Infinity;
  for (const vertex of poly) {
    const d = haversineKm(pt.lat, pt.lng, vertex.lat, vertex.lng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Compute suggestions for a single client.
 * Returns sorted list (best first), max 3 suggestions.
 */
export function computeSuggestions(
  client: ClientData,
  zones: ZoneData[],
  reps: { id: string; full_name: string }[],
  maxDistKm = MAX_DISTANCE_KM,
): ZoneSuggestion[] {
  if (!client.latitude || !client.longitude) return [];

  const pt = { lat: client.latitude, lng: client.longitude };
  const candidates: ZoneSuggestion[] = [];

  for (const zone of zones) {
    const poly = parsePolygon(zone.polygon_coordinates);
    if (!poly) continue;

    const isInside = pointInPolygon(pt, poly);
    const distKm = isInside ? 0 : minDistToPolygon(pt, poly);

    if (distKm > maxDistKm) continue;

    // Confidence: inside=4, <5km=3, <15km=2, else=1
    let confidence = 1;
    if (isInside) confidence = 4;
    else if (distKm < 5) confidence = 3;
    else if (distKm < 15) confidence = 2;

    const repName = zone.user_id
      ? reps.find(r => r.id === zone.user_id)?.full_name ?? null
      : null;

    candidates.push({
      zoneId: zone.id,
      zoneName: zone.custom_label || zone.system_name,
      zoneColor: zone.color || '#3b82f6',
      distanceKm: Math.round(distKm * 10) / 10,
      repId: zone.user_id,
      repName,
      confidence,
    });
  }

  // Sort by confidence desc, then distance asc
  candidates.sort((a, b) => b.confidence - a.confidence || a.distanceKm - b.distanceKm);
  return candidates.slice(0, 3);
}
