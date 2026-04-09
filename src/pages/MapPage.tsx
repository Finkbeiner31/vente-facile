import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Locate, X, Eye, Play, Loader2, MapPin, Filter,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMonthly } from '@/lib/revenueUtils';
import { MarkerClusterer } from '@googlemaps/markerclusterer';

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
}

type FilterType = 'tous' | 'clients' | 'prospects';
type PotentialFilter = 'tous' | 'A' | 'B' | 'C';

// ── Helpers ──

const FRANCE_CENTER = { lat: 46.6, lng: 2.5 };

function getMonthly(annual: number) {
  return annual / 12;
}

function getMarkerColor(customer: MapCustomer): string {
  if (customer.customer_type === 'prospect') return '#3B82F6'; // blue
  const monthly = getMonthly(customer.annual_revenue_potential);
  if (monthly >= 5000) return '#EF4444'; // red — high
  if (monthly >= 2000) return '#F97316'; // orange — medium
  return '#9CA3AF'; // grey — low
}

function getMarkerSVG(color: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="42">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/>
      <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
    </svg>
  `)}`;
}

function formatLastVisit(d: string | null) {
  if (!d) return 'Jamais';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getPotential(customer: MapCustomer): string {
  const sp = customer.sales_potential;
  if (sp === 'A' || sp === 'B' || sp === 'C') return sp;
  const m = getMonthly(customer.annual_revenue_potential);
  if (m >= 5000) return 'A';
  if (m >= 2000) return 'B';
  return 'C';
}

// ── Component ──

export default function MapPage() {
  const { user, loading } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [typeFilter, setTypeFilter] = useState<FilterType>('tous');
  const [potentialFilter, setPotentialFilter] = useState<PotentialFilter>('tous');
  const [selectedCustomer, setSelectedCustomer] = useState<MapCustomer | null>(null);
  const [locating, setLocating] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch customers with coordinates
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers-map', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, company_name, customer_type, city, latitude, longitude, number_of_vehicles, annual_revenue_potential, last_visit_date, phone, sales_potential')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (error) throw error;
      return (data || []) as MapCustomer[];
    },
    enabled: !loading && !!user,
  });

  // Apply filters
  const filtered = useMemo(() => {
    return customers.filter(c => {
      if (typeFilter === 'clients' && c.customer_type === 'prospect') return false;
      if (typeFilter === 'prospects' && c.customer_type !== 'prospect') return false;
      if (potentialFilter !== 'tous' && getPotential(c) !== potentialFilter) return false;
      return true;
    });
  }, [customers, typeFilter, potentialFilter]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if (!window.google?.maps) return;

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center: FRANCE_CENTER,
      zoom: 6,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
    });

    infoWindowRef.current = new google.maps.InfoWindow();
  }, []);

  // Update markers when filtered data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }

    const markers = filtered.map(customer => {
      const color = getMarkerColor(customer);
      const marker = new google.maps.Marker({
        position: { lat: customer.latitude, lng: customer.longitude },
        icon: {
          url: getMarkerSVG(color),
          scaledSize: new google.maps.Size(28, 42),
          anchor: new google.maps.Point(14, 42),
        },
        title: customer.company_name,
      });

      marker.addListener('click', () => {
        setSelectedCustomer(customer);
      });

      return marker;
    });

    markersRef.current = markers;

    // Cluster
    clustererRef.current = new MarkerClusterer({
      map,
      markers,
    });

    // Fit bounds if we have markers
    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach(m => bounds.extend(m.getPosition()!));
      map.fitBounds(bounds, 60);
      if (markers.length === 1) map.setZoom(14);
    }
  }, [filtered]);

  // Geolocate
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapInstanceRef.current?.panTo({ lat: latitude, lng: longitude });
        mapInstanceRef.current?.setZoom(12);

        // Add a blue dot for user location
        new google.maps.Marker({
          position: { lat: latitude, lng: longitude },
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
      () => setLocating(false),
      { enableHighAccuracy: true }
    );
  }, []);

  const notLocated = customers.length - customers.filter(c => c.latitude && c.longitude).length;

  return (
    <div className="relative h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] flex flex-col animate-fade-in">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background z-10 shrink-0">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h1 className="font-heading text-lg font-bold">Carte clients</h1>
          <Badge variant="secondary" className="text-[10px]">{filtered.length} affichés</Badge>
          {notLocated > 0 && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">{notLocated} non localisés</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-1" /> Filtres
          </Button>
          <Button variant="outline" size="sm" onClick={handleLocateMe} disabled={locating}>
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
            <span className="hidden sm:inline ml-1">Ma position</span>
          </Button>
        </div>
      </div>

      {/* ── Filters panel ── */}
      {showFilters && (
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 z-10 shrink-0 flex-wrap">
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as FilterType)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous</SelectItem>
              <SelectItem value="clients">Clients</SelectItem>
              <SelectItem value="prospects">Prospects</SelectItem>
            </SelectContent>
          </Select>

          <Select value={potentialFilter} onValueChange={v => setPotentialFilter(v as PotentialFilter)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Potentiel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tout potentiel</SelectItem>
              <SelectItem value="A">🔴 Potentiel A</SelectItem>
              <SelectItem value="B">🟠 Potentiel B</SelectItem>
              <SelectItem value="C">⚪ Potentiel C</SelectItem>
            </SelectContent>
          </Select>

          {/* Legend */}
          <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#EF4444] inline-block" /> Fort</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#F97316] inline-block" /> Moyen</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#9CA3AF] inline-block" /> Faible</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#3B82F6] inline-block" /> Prospect</span>
          </div>
        </div>
      )}

      {/* ── Map container ── */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* ── Selected customer card ── */}
        {selectedCustomer && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-30">
            <div className="rounded-xl border bg-background shadow-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-heading font-bold text-sm">{selectedCustomer.company_name}</h3>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.city}</p>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">CA mensuel</span>
                  <p className="font-bold text-sm">{formatMonthly(selectedCustomer.annual_revenue_potential)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Véhicules</span>
                  <p className="font-bold text-sm">{selectedCustomer.number_of_vehicles || 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Dernière visite</span>
                  <p className="font-medium">{formatLastVisit(selectedCustomer.last_visit_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="secondary" className="text-[10px] mt-0.5">
                    {selectedCustomer.customer_type === 'prospect' ? 'Prospect' : 'Client'}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <Link to={`/clients/${selectedCustomer.id}`}>
                    <Eye className="h-4 w-4 mr-1" /> Voir fiche
                  </Link>
                </Button>
                <Button size="sm" className="flex-1">
                  <Play className="h-4 w-4 mr-1" /> Démarrer visite
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
