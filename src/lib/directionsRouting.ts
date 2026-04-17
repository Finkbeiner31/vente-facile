/// <reference types="google.maps" />
/**
 * Google Maps Directions helper used by both the optimizer sheet and the
 * day route map dialog.
 *
 * Given an origin, an ordered list of candidate stops, a destination, and
 * a strategy ('nearest' | 'farthest'), it returns:
 *  - the optimized order of stops (indices into the input array)
 *  - the road polyline path
 *  - real distance (km) and drive time (minutes)
 *
 * Strategy handling:
 *  - 'nearest': we let Google optimize the full waypoint set freely.
 *  - 'farthest': we PIN the stop that is farthest from the origin as the
 *    first waypoint (stopover), then let Google optimize the rest. Google
 *    still computes the shortest path back to the destination, which gives
 *    a coherent "go far first, return logically" itinerary.
 *
 * If routing fails (quota, no road, > MAX waypoints), callers should fall
 * back to a local heuristic.
 */

export interface RoutedStopInput {
  lat: number;
  lng: number;
}

export interface DirectionsResult {
  /** Permutation of indices into the original stops array */
  order: number[];
  /** Decoded road polyline (lat/lng) */
  path: google.maps.LatLngLiteral[];
  /** Total distance in kilometers */
  km: number;
  /** Total driving time in minutes */
  driveMin: number;
}

// Google caps optimizable waypoints around 25; staying below for safety.
export const MAX_DIRECTIONS_WAYPOINTS = 23;

function haversineKm(a: RoutedStopInput, b: RoutedStopInput): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function routeWithDirections(
  origin: RoutedStopInput,
  stops: RoutedStopInput[],
  destination: RoutedStopInput,
  strategy: 'nearest' | 'farthest' = 'nearest',
): Promise<DirectionsResult | null> {
  if (typeof google === 'undefined' || !google.maps || !google.maps.DirectionsService) {
    return null;
  }
  if (stops.length === 0) return null;
  if (stops.length > MAX_DIRECTIONS_WAYPOINTS) return null;

  // For 'farthest': pin the farthest-from-origin stop as the first waypoint.
  let pinnedFirstIdx: number | null = null;
  let optimizableIdx: number[];

  if (strategy === 'farthest' && stops.length >= 2) {
    let maxD = -1;
    let maxI = 0;
    stops.forEach((s, i) => {
      const d = haversineKm(origin, s);
      if (d > maxD) { maxD = d; maxI = i; }
    });
    pinnedFirstIdx = maxI;
    optimizableIdx = stops.map((_, i) => i).filter(i => i !== pinnedFirstIdx);
  } else {
    optimizableIdx = stops.map((_, i) => i);
  }

  const ds = new google.maps.DirectionsService();
  const waypoints: google.maps.DirectionsWaypoint[] = [];

  if (pinnedFirstIdx !== null) {
    waypoints.push({ location: stops[pinnedFirstIdx], stopover: true });
  }
  optimizableIdx.forEach(i => {
    waypoints.push({ location: stops[i], stopover: true });
  });

  // optimizeWaypoints reorders ALL waypoints. To preserve the pinned
  // farthest-first stop, we ask Google to optimize only when there's
  // more than one optimizable stop AND no pin is set; otherwise we keep
  // the manual order for the pin and optimize through a second pass below.
  const useOptimize = pinnedFirstIdx === null && optimizableIdx.length >= 2;

  try {
    const result = await ds.route({
      origin,
      destination,
      waypoints,
      optimizeWaypoints: useOptimize,
      travelMode: google.maps.TravelMode.DRIVING,
    });
    const r = result.routes[0];
    if (!r) return null;

    // Rebuild stop order from waypoint_order (when optimized) or original.
    const baseOrder = useOptimize
      ? r.waypoint_order
      : waypoints.map((_, i) => i);

    // Map waypoint positions back to original stop indices.
    const wpToStopIdx: number[] = [];
    if (pinnedFirstIdx !== null) wpToStopIdx.push(pinnedFirstIdx);
    optimizableIdx.forEach(i => wpToStopIdx.push(i));
    const order = baseOrder.map(o => wpToStopIdx[o]);

    let km = 0;
    let driveSec = 0;
    const path: google.maps.LatLngLiteral[] = [];
    r.legs.forEach(leg => {
      km += (leg.distance?.value || 0) / 1000;
      driveSec += leg.duration?.value || 0;
      leg.steps.forEach(step => {
        step.path?.forEach(p => path.push({ lat: p.lat(), lng: p.lng() }));
      });
    });

    // Second-pass optimization for 'farthest' mode: re-optimize the tail
    // (everything after the pinned stop) by issuing one more Directions
    // request from the pinned stop to destination through the remaining stops.
    if (pinnedFirstIdx !== null && optimizableIdx.length >= 2) {
      try {
        const tail = await ds.route({
          origin: stops[pinnedFirstIdx],
          destination,
          waypoints: optimizableIdx.map(i => ({ location: stops[i], stopover: true })),
          optimizeWaypoints: true,
          travelMode: google.maps.TravelMode.DRIVING,
        });
        const tr = tail.routes[0];
        if (tr) {
          const tailOrder = tr.waypoint_order.map(o => optimizableIdx[o]);
          const newOrder = [pinnedFirstIdx, ...tailOrder];

          // Rebuild metrics from origin → pinned (use first leg of original)
          // + the tail route's legs.
          const firstLegMeters = r.legs[0]?.distance?.value || 0;
          const firstLegSec = r.legs[0]?.duration?.value || 0;
          const firstLegPath: google.maps.LatLngLiteral[] = [];
          r.legs[0]?.steps.forEach(step => {
            step.path?.forEach(p => firstLegPath.push({ lat: p.lat(), lng: p.lng() }));
          });

          let tailKm = firstLegMeters / 1000;
          let tailSec = firstLegSec;
          const tailPath: google.maps.LatLngLiteral[] = [...firstLegPath];
          tr.legs.forEach(leg => {
            tailKm += (leg.distance?.value || 0) / 1000;
            tailSec += leg.duration?.value || 0;
            leg.steps.forEach(step => {
              step.path?.forEach(p => tailPath.push({ lat: p.lat(), lng: p.lng() }));
            });
          });
          return { order: newOrder, path: tailPath, km: tailKm, driveMin: tailSec / 60 };
        }
      } catch {
        // tail optimization failed; fall through with first-pass result
      }
    }

    return { order, path, km, driveMin: driveSec / 60 };
  } catch (err) {
    console.warn('[directionsRouting] route() failed', err);
    return null;
  }
}
