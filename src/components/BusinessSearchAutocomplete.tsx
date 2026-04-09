/// <reference types="google.maps" />
import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Building2, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    google?: typeof google;
  }
}

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
  const skipNextChangeRef = useRef(false);

  // Keep refs to avoid stale closures in the Google listener
  const onSelectRef = useRef(onSelect);
  const onChangeRef = useRef(onChange);
  onSelectRef.current = onSelect;
  onChangeRef.current = onChange;

  // Sync external value → DOM (only when typing, not after selection)
  useEffect(() => {
    if (inputRef.current && !skipNextChangeRef.current) {
      inputRef.current.value = value;
    }
    skipNextChangeRef.current = false;
  }, [value]);

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

  // Initialize autocomplete — run once
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
      if (!place.geometry?.location) return;

      let streetNumber = '';
      let route = '';
      let city = '';
      let postalCode = '';

      if (place.address_components) {
        place.address_components.forEach((c) => {
          const t = c.types;
          if (t.includes('street_number')) streetNumber = c.long_name;
          if (t.includes('route')) route = c.long_name;
          if (t.includes('locality')) city = c.long_name;
          if (t.includes('postal_code')) postalCode = c.long_name;
        });
      }

      const streetAddress = [streetNumber, route].filter(Boolean).join(' ');
      const name = place.name || '';

      // Force the DOM input to show only the company name
      // (Google sets it to formatted_address by default)
      if (inputRef.current) {
        inputRef.current.value = name;
      }

      // Tell React about the new company name value
      skipNextChangeRef.current = true;
      onChangeRef.current(name);

      onSelectRef.current({
        companyName: name,
        fullAddress: streetAddress || place.formatted_address || '',
        city,
        postalCode,
        latitude: place.geometry!.location!.lat(),
        longitude: place.geometry!.location!.lng(),
        phone: place.formatted_phone_number,
        website: place.website,
      });
    });

    autocompleteRef.current = ac;

    return () => {
      google.maps.event.clearInstanceListeners(ac);
      autocompleteRef.current = null;
    };
  }, [isReady]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChangeRef.current(e.target.value);
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          defaultValue={value}
          onChange={handleInput}
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
