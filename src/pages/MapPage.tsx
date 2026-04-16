import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Locate, X, Eye, Play, Loader2, MapPin, Filter, Phone,
  ListChecks, Navigation, ChevronRight, AlertTriangle, Map, Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMonthly } from '@/lib/revenueUtils';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useIsMobile } from '@/hooks/use-mobile';
import RouteOptimizerSheet, { type OptimizedRoute } from '@/components/RouteOptimizerSheet';
import { useAllCustomerRevenues } from '@/hooks/useCustomerPerformance';
import { analyzeCustomerPerformance, getStatusConfig, type PerformanceStatus } from '@/lib/performanceUtils';

// ── Types ──

interface MapCustomer {
  id: string;
  company_name: string;
  customer_type: string;
  city: string;
  latitude: number;
  longitude: number;
  number_of_vehicles: number;
  annual_revenue_potential: number;
  last_visit_date: string | null;
  phone: string | null;
  sales_potential: string | null;
  visit_frequency: string | null;
  address: string | null;
  postal_code: string | null;
}

type FilterType = 'tous' | 'clients' | 'prospects';
type PotentialFilter = 'tous' | 'A' | 'B' | 'C';
type VisitFilter = 'tous' | 'never' | 'overdue' | 'recent';

// ── Helpers ──

const FRANCE_CENTER = { lat: 46.6, lng: 2.5 };

function getMonthly(annual: number) { return annual / 12; }

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

function getVisitStatus(c: MapCustomer): 'never' | 'overdue' | 'recent' | 'ok' {
  const days = daysSince(c.last_visit_date);
  if (days === null) return 'never';
  // Overdue thresholds based on frequency
  const thresholds: Record<string, number> = {
    hebdomadaire: 10, bimensuelle: 18, mensuelle: 40,
    trimestrielle: 100, semestrielle: 200, annuelle: 400,
  };
  const threshold = thresholds[c.visit_frequency || 'mensuelle'] || 40;
  if (days > threshold) return 'overdue';
  if (days <= 7) return 'recent';
  return 'ok';
}

function getPriorityScore(c: MapCustomer): number {
  let score = 0;
  const monthly = getMonthly(c.annual_revenue_potential);
  // Potential weight (0-40)
  if (monthly >= 5000) score += 40;
  else if (monthly >= 2000) score += 25;
  else score += 10;
  // Visit recency weight (0-40)
  const vs = getVisitStatus(c);
  if (vs === 'never') score += 40;
  else if (vs === 'overdue') score += 35;
  else if (vs === 'ok') score += 10;
  // Client status weight (0-20)
  if (c.customer_type === 'client_actif') score += 20;
  else if (c.customer_type === 'prospect') score += 15;
  else score += 5;
  return score;
}

function getMarkerColor(c: MapCustomer, perfStatus?: PerformanceStatus): string {
  if (c.customer_type === 'prospect') return '#3B82F6';
  // Use performance status if available
  if (perfStatus === 'optimise') return '#22C55E';
  if (perfStatus === 'a_developper') return '#F97316';
  if (perfStatus === 'sous_exploite') return '#EF4444';
  // Fallback to potential-based
  const monthly = getMonthly(c.annual_revenue_potential);
  if (monthly >= 5000) return '#EF4444';
  if (monthly >= 2000) return '#F97316';
  return '#9CA3AF';
}

function getVisitRing(c: MapCustomer): string {
  const vs = getVisitStatus(c);
  if (vs === 'never') return '#EF4444';
  if (vs === 'overdue') return '#F59E0B';
  return 'none';
}

function getMarkerSVG(fillColor: string, ringColor: string, isPriority: boolean): string {
  const ring = ringColor !== 'none'
    ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${ringColor}" stroke-width="2.5" stroke-dasharray="4 2"/>`
    : '';
  const glow = isPriority
    ? `<circle cx="12" cy="12" r="16" fill="${fillColor}" opacity="0.2"/>`
    : '';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 32 44" width="32" height="48">
      ${glow}
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${fillColor}"/>
      ${ring}
      <circle cx="12" cy="12" r="4.5" fill="white" opacity="0.9"/>
    </svg>
  `)}`;
}

function formatLastVisit(d: string | null) {
  if (!d) return 'Jamais';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPotential(c: MapCustomer): string {
  const sp = c.sales_potential;
  if (sp === 'A' || sp === 'B' || sp === 'C') return sp;
  const m = getMonthly(c.annual_revenue_potential);
  if (m >= 5000) return 'A';
  if (m >= 2000) return 'B';
  return 'C';
}

// ── Component ──

export default function MapPage() {
  const { user, loading, role } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const activeUserId = effectiveUserId || user?.id;
  const isMobile = useIsMobile();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);

  const [typeFilter, setTypeFilter] = useState<FilterType>('tous');
  const [potentialFilter, setPotentialFilter] = useState<PotentialFilter>('tous');
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('tous');
  const [selectedCustomer, setSelectedCustomer] = useState<MapCustomer | null>(null);
  const [locating, setLocating] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [showFilters, setShowFilters] = useState(!isMobile);
  const [showList, setShowList] = useState(!isMobile);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const { data: revenueMap } = useAllCustomerRevenues();
  const queryClient = useQueryClient();

  const isAdmin = role === 'admin' || role === 'manager';

  // Geocoding state
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ total: 0, done: 0, success: 0, fail: 0 });

  // Fetch ALL customers (with and without coords) so we can report missing geolocation
  const { data: allCustomers = [], isLoading } = useQuery({
    queryKey: ['customers-map', activeUserId, role],
    queryFn: async () => {
      const selectFields = 'id, company_name, customer_type, city, latitude, longitude, number_of_vehicles, annual_revenue_potential, last_visit_date, phone, sales_potential, visit_frequency, address, postal_code';
      
      if (isAdmin) {
        // Admins/managers see ALL customers (RLS already allows it)
        const { data, error } = await supabase
          .from('customers')
          .select(selectFields);
        if (error) throw error;
        return (data || []) as (MapCustomer & { latitude: number | null; longitude: number | null })[];
      } else {
        // Sales reps: own clients only
        const { data, error } = await supabase
          .from('customers')
          .select(selectFields)
          .eq('assigned_rep_id', activeUserId!);
        if (error) throw error;
        return (data || []) as (MapCustomer & { latitude: number | null; longitude: number | null })[];
      }
    },
    enabled: !loading && !!activeUserId,
  });

  // Split into geolocated vs not
  const customers = useMemo(() =>
    allCustomers.filter(c => c.latitude != null && c.longitude != null) as MapCustomer[],
    [allCustomers]
  );
  const missingCoords = useMemo(() =>
    allCustomers.filter(c => c.latitude == null || c.longitude == null),
    [allCustomers]
  );

  // Geocode all clients without coordinates
  const handleBulkGeocode = useCallback(async () => {
    if (!window.google?.maps || missingCoords.length === 0) return;
    setGeocoding(true);
    const geocoder = new google.maps.Geocoder();
    const total = missingCoords.length;
    let done = 0, success = 0, fail = 0;
    setGeocodeProgress({ total, done: 0, success: 0, fail: 0 });

    for (const client of missingCoords) {
      const parts = [client.address, client.postal_code, client.city].filter(Boolean);
      const addressStr = parts.join(', ');
      if (!addressStr.trim()) {
        fail++;
        done++;
        setGeocodeProgress({ total, done, success, fail });
        continue;
      }

      try {
        const result = await new Promise<google.maps.GeocoderResult | null>((resolve) => {
          geocoder.geocode({ address: addressStr, region: 'fr' }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
              resolve(results[0]);
            } else {
              resolve(null);
            }
          });
        });

        if (result) {
          const lat = result.geometry.location.lat();
          const lng = result.geometry.location.lng();
          await supabase.from('customers').update({ latitude: lat, longitude: lng } as any).eq('id', client.id);
          success++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
      done++;
      setGeocodeProgress({ total, done, success, fail });

      // Small delay to avoid Google rate limits
      if (done < total) await new Promise(r => setTimeout(r, 150));
    }

    setGeocoding(false);
    // Refresh data
    queryClient.invalidateQueries({ queryKey: ['customers-map'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  }, [missingCoords, queryClient]);


  const perfMap = useMemo(() => {
    const m = new window.Map<string, PerformanceStatus>();
    customers.forEach(c => {
      const history = revenueMap?.get(c.id) || [];
      const perf = analyzeCustomerPerformance(c.annual_revenue_potential, history);
      m.set(c.id, perf.status);
    });
    return m;
  }, [customers, revenueMap]);

  // Apply filters + sort by priority
  const filtered = useMemo(() => {
    return customers
      .filter(c => {
        if (typeFilter === 'clients' && c.customer_type === 'prospect') return false;
        if (typeFilter === 'prospects' && c.customer_type !== 'prospect') return false;
        if (potentialFilter !== 'tous' && getPotential(c) !== potentialFilter) return false;
        if (visitFilter !== 'tous') {
          const vs = getVisitStatus(c);
          if (visitFilter === 'never' && vs !== 'never') return false;
          if (visitFilter === 'overdue' && vs !== 'overdue') return false;
          if (visitFilter === 'recent' && vs !== 'recent') return false;
        }
        return true;
      })
      .sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
  }, [customers, typeFilter, potentialFilter, visitFilter]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (!window.google?.maps) {
      const check = setInterval(() => {
        if (window.google?.maps && mapRef.current) {
          clearInterval(check);
          initMap();
        }
      }, 200);
      return () => clearInterval(check);
    }
    initMap();

    function initMap() {
      mapInstanceRef.current = new google.maps.Map(mapRef.current!, {
        center: FRANCE_CENTER,
        zoom: 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      });
    }
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }

    const markers = filtered.map(customer => {
      const color = getMarkerColor(customer, perfMap.get(customer.id));
      const ring = getVisitRing(customer);
      const priority = getPriorityScore(customer) >= 70;

      const marker = new google.maps.Marker({
        position: { lat: customer.latitude, lng: customer.longitude },
        icon: {
          url: getMarkerSVG(color, ring, priority),
          scaledSize: new google.maps.Size(32, 48),
          anchor: new google.maps.Point(16, 48),
        },
        title: customer.company_name,
        optimized: true,
      });

      marker.addListener('click', () => {
        setSelectedCustomer(customer);
        map.panTo({ lat: customer.latitude, lng: customer.longitude });
      });

      return marker;
    });

    markersRef.current = markers;
    clustererRef.current = new MarkerClusterer({ map, markers });

    if (markers.length > 0 && !userPos) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach(m => bounds.extend(m.getPosition()!));
      map.fitBounds(bounds, 60);
      if (markers.length === 1) map.setZoom(14);
    }
  }, [filtered, perfMap]);

  // Geolocate
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(coords);
        mapInstanceRef.current?.panTo(coords);
        mapInstanceRef.current?.setZoom(12);

        if (userMarkerRef.current) userMarkerRef.current.setMap(null);
        userMarkerRef.current = new google.maps.Marker({
          position: coords,
          map: mapInstanceRef.current!,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#4F46E5',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 3,
          },
          title: 'Ma position',
          zIndex: 999,
        });
        setLocating(false);
      },
      () => { setLocating(false); },
      { enableHighAccuracy: true }
    );
  }, []);

  const handleListItemClick = (c: MapCustomer) => {
    setSelectedCustomer(c);
    mapInstanceRef.current?.panTo({ lat: c.latitude, lng: c.longitude });
    mapInstanceRef.current?.setZoom(14);
    if (isMobile) setShowList(false);
  };

  const distanceTo = (c: MapCustomer) => {
    if (!userPos) return null;
    return haversineKm(userPos.lat, userPos.lng, c.latitude, c.longitude);
  };

  const notLocated = customers.length - filtered.length;

  // ── RENDER ──
  return (
    <div className="relative h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] flex flex-col animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background z-10 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-5 w-5 text-primary shrink-0" />
          <h1 className="font-heading text-base md:text-lg font-bold truncate">Carte clients</h1>
          <Badge variant="secondary" className="text-[10px] shrink-0">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant={showList ? 'default' : 'outline'} size="sm" className="h-8 px-2"
            onClick={() => setShowList(!showList)}>
            <ListChecks className="h-4 w-4" />
          </Button>
          <Button variant={showFilters ? 'default' : 'outline'} size="sm" className="h-8 px-2"
            onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2" onClick={handleLocateMe} disabled={locating}>
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      {showFilters && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 z-10 shrink-0 flex-wrap">
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as FilterType)}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous</SelectItem>
              <SelectItem value="clients">Clients</SelectItem>
              <SelectItem value="prospects">Prospects</SelectItem>
            </SelectContent>
          </Select>
          <Select value={potentialFilter} onValueChange={v => setPotentialFilter(v as PotentialFilter)}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tout potentiel</SelectItem>
              <SelectItem value="A">🔴 Fort (A)</SelectItem>
              <SelectItem value="B">🟠 Moyen (B)</SelectItem>
              <SelectItem value="C">⚪ Faible (C)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={visitFilter} onValueChange={v => setVisitFilter(v as VisitFilter)}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Toutes visites</SelectItem>
              <SelectItem value="never">Jamais visité</SelectItem>
              <SelectItem value="overdue">Visite en retard</SelectItem>
              <SelectItem value="recent">Visité récemment</SelectItem>
            </SelectContent>
          </Select>
          {/* Legend */}
          <div className="flex items-center gap-2 ml-auto text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] inline-block" />Optimisé</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#F97316] inline-block" />À dév.</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] inline-block" />Sous-exp.</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] inline-block" />Prospect</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-[#EF4444] inline-block" />Retard</span>
          </div>
        </div>
      )}

      {/* ── Missing geolocation banner ── */}
      {missingCoords.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-warning/10 text-warning text-xs z-10 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{missingCoords.length} client{missingCoords.length > 1 ? 's' : ''} non géolocalisé{missingCoords.length > 1 ? 's' : ''} (adresse à géocoder)</span>
        </div>
      )}

      {/* ── Empty state when all loaded but none geolocated ── */}
      {!isLoading && allCustomers.length > 0 && customers.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50 text-sm z-10 shrink-0">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span>Les clients existent mais ne sont pas encore géolocalisés. Vérifiez les adresses dans la fiche client.</span>
        </div>
      )}

      {/* ── Main area: list + map ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── List panel ── */}
        {showList && (
          <div className={`${isMobile ? 'absolute inset-0 z-20 bg-background' : 'w-80 border-r'} flex flex-col shrink-0`}>
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {filtered.length} résultats
              </span>
              {isMobile && (
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setShowList(false)}>
                  <Map className="h-4 w-4 mr-1" /> Carte
                </Button>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {filtered.map(c => {
                  const dist = distanceTo(c);
                  const vs = getVisitStatus(c);
                  const priority = getPriorityScore(c) >= 70;
                  const color = getMarkerColor(c);
                  const isSelected = selectedCustomer?.id === c.id;

                  return (
                    <button
                      key={c.id}
                      onClick={() => handleListItemClick(c)}
                      className={`w-full text-left px-3 py-2.5 transition-colors hover:bg-accent/5 ${isSelected ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium truncate">{c.company_name}</span>
                            {priority && (
                              <Badge className="text-[8px] px-1 py-0 bg-destructive/10 text-destructive border-0">
                                Prioritaire
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span>{c.city}</span>
                            <span>·</span>
                            <span className="font-medium">{formatMonthly(c.annual_revenue_potential)}</span>
                            {dist !== null && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-0.5">
                                  <Navigation className="h-3 w-3" />
                                  {dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {vs === 'never' && (
                              <span className="text-[10px] text-destructive flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" /> Jamais visité
                              </span>
                            )}
                            {vs === 'overdue' && (
                              <span className="text-[10px] text-warning flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" /> Visite en retard
                              </span>
                            )}
                            {vs === 'recent' && (
                              <span className="text-[10px] text-accent">Visité récemment</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                      </div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Aucun résultat avec ces filtres
                  </div>
                )}
              </div>
            </ScrollArea>
            {/* Optimize route button */}
            <div className="p-3 border-t">
              <Button size="sm" className="w-full font-semibold" onClick={() => setOptimizerOpen(true)}>
                <Sparkles className="h-4 w-4 mr-1.5" /> Optimiser ma tournée
              </Button>
            </div>
          </div>
        )}

        {/* ── Map ── */}
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />

          {/* ── Selected customer card ── */}
          {selectedCustomer && (
            <SelectedCustomerCard
              customer={selectedCustomer}
              distance={distanceTo(selectedCustomer)}
              onClose={() => setSelectedCustomer(null)}
            />
          )}

          {/* Not-located badge */}
          {notLocated > 0 && (
            <div className="absolute top-2 left-2 z-10">
              <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur">
                {notLocated} non localisés
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Route Optimizer Sheet */}
      <RouteOptimizerSheet
        open={optimizerOpen}
        onOpenChange={setOptimizerOpen}
        onRouteGenerated={(route) => {
          // Draw polyline on map
          if (routePolylineRef.current) {
            routePolylineRef.current.setMap(null);
          }
          const map = mapInstanceRef.current;
          if (map && route.customers.length > 1) {
            const path = userPos
              ? [userPos, ...route.customers.map(c => ({ lat: c.latitude, lng: c.longitude }))]
              : route.customers.map(c => ({ lat: c.latitude, lng: c.longitude }));
            routePolylineRef.current = new google.maps.Polyline({
              path,
              geodesic: true,
              strokeColor: '#4F46E5',
              strokeOpacity: 0.8,
              strokeWeight: 4,
              map,
            });
            const bounds = new google.maps.LatLngBounds();
            path.forEach(p => bounds.extend(p));
            map.fitBounds(bounds, 60);
          }
        }}
      />
    </div>
  );
}

// ── Selected Customer Card ──

function SelectedCustomerCard({
  customer: c,
  distance,
  onClose,
}: {
  customer: MapCustomer;
  distance: number | null;
  onClose: () => void;
}) {
  const vs = getVisitStatus(c);
  const priority = getPriorityScore(c) >= 70;

  return (
    <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[340px] z-30 animate-fade-in">
      <div className="rounded-xl border bg-background shadow-xl p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-bold text-sm truncate">{c.company_name}</h3>
              {priority && (
                <Badge className="text-[9px] px-1.5 py-0 bg-destructive/10 text-destructive border-0 shrink-0">
                  Prioritaire
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{c.city}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-muted/50 p-2 text-center">
            <span className="text-muted-foreground block">CA mensuel</span>
            <p className="font-bold text-sm">{formatMonthly(c.annual_revenue_potential)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2 text-center">
            <span className="text-muted-foreground block">Véhicules</span>
            <p className="font-bold text-sm">{c.number_of_vehicles || 0}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2 text-center">
            <span className="text-muted-foreground block">Dern. visite</span>
            <p className={`font-bold text-sm ${vs === 'never' || vs === 'overdue' ? 'text-destructive' : ''}`}>
              {formatLastVisit(c.last_visit_date)}
            </p>
          </div>
        </div>

        {/* Distance */}
        {distance !== null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Navigation className="h-3.5 w-3.5 text-primary" />
            <span>À {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} de votre position</span>
          </div>
        )}

        {/* Visit status alert */}
        {(vs === 'never' || vs === 'overdue') && (
          <div className={`flex items-center gap-1.5 text-xs rounded-lg p-2 ${vs === 'never' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {vs === 'never' ? 'Client jamais visité' : 'Visite en retard'}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to={`/clients/${c.id}`}>
              <Eye className="h-4 w-4 mr-1" /> Voir fiche
            </Link>
          </Button>
          <Button size="sm">
            <Play className="h-4 w-4 mr-1" /> Démarrer visite
          </Button>
          {c.phone && (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${c.phone}`}>
                <Phone className="h-4 w-4 mr-1" /> Appeler
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline">
            <ListChecks className="h-4 w-4 mr-1" /> Ajouter tâche
          </Button>
        </div>
      </div>
    </div>
  );
}
