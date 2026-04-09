import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Building2, Loader2, MapPin } from 'lucide-react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
  };
}

export interface BusinessSelection {
  companyName: string;
  fullAddress: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
}

interface BusinessSearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: BusinessSelection) => void;
  placeholder?: string;
  className?: string;
}

export function BusinessSearchAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Tapez le nom de l'entreprise...",
  className = '',
}: BusinessSearchAutocompleteProps) {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: '6',
        countrycodes: 'fr',
      });

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { 'Accept-Language': 'fr' } }
      );

      if (!res.ok) return;
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setIsOpen(data.length > 0);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (result: NominatimResult) => {
    const addr = result.address;
    const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const postalCode = addr.postcode || '';
    const name = result.name || result.display_name.split(',')[0];

    onChange(name);
    onSelect({
      companyName: name,
      fullAddress: street || result.display_name.split(',')[0],
      city,
      postalCode,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    });
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className={`h-12 text-base pr-10 ${className}`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {results.map(r => {
            const parts = r.display_name.split(',');
            const main = r.name || parts[0];
            const sub = parts.slice(1, 3).join(',').trim();
            return (
              <button
                key={r.place_id}
                type="button"
                onClick={() => handleSelect(r)}
                className="flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-accent/10 transition-colors border-b last:border-b-0"
              >
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{main}</p>
                  <p className="text-xs text-muted-foreground truncate">{sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
