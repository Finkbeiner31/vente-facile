import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Building2, Loader2 } from 'lucide-react';

export interface BusinessSelection {
  companyName: string;
  fullAddress: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  phone?: string;
  website?: string;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Wait for Google Maps to load
  useEffect(() => {
    const check = () => {
      if (window.google?.maps?.places) {
        setIsReady(true);
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  }, []);

  // Initialize autocomplete
  useEffect(() => {
    if (!isReady || !inputRef.current || autocompleteRef.current) return;

    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment'],
      componentRestrictions: { country: 'fr' },
      fields: [
        'name',
        'address_components',
        'geometry',
        'formatted_address',
        'formatted_phone_number',
        'website',
      ],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.address_components || !place.geometry?.location) return;

      let streetNumber = '';
      let route = '';
      let city = '';
      let postalCode = '';

      place.address_components.forEach((c) => {
        const t = c.types;
        if (t.includes('street_number')) streetNumber = c.long_name;
        if (t.includes('route')) route = c.long_name;
        if (t.includes('locality')) city = c.long_name;
        if (t.includes('postal_code')) postalCode = c.long_name;
      });

      const address = [streetNumber, route].filter(Boolean).join(' ');
      const name = place.name || '';

      onChange(name);
      onSelect({
        companyName: name,
        fullAddress: address || place.formatted_address || '',
        city,
        postalCode,
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
        phone: place.formatted_phone_number,
        website: place.website,
      });
    });

    autocompleteRef.current = ac;

    return () => {
      google.maps.event.clearInstanceListeners(ac);
      autocompleteRef.current = null;
    };
  }, [isReady, onChange, onSelect]);

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`h-12 text-base pr-10 ${className}`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {!isReady ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
        </div>
      </div>
    </div>
  );
}
