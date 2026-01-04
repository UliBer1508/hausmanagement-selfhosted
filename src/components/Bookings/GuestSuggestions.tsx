import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User, Phone, Mail, Globe, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeGermanName, generateNameVariants } from '@/lib/nameNormalization';

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  city: string | null;
}

interface GuestSuggestionsProps {
  searchTerm: string;
  onSelect: (guest: Guest) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const GuestSuggestions = ({ searchTerm, onSelect, isOpen, onClose }: GuestSuggestionsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['guest-suggestions', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      
      // Generiere Suchvarianten (z.B. "Schlueter" -> ["Schlueter", "Schlüter"])
      const nameVariants = generateNameVariants(searchTerm);
      
      // Suche nach allen Varianten
      let allGuests: Guest[] = [];
      
      for (const variant of nameVariants) {
        const { data, error } = await supabase
          .from('guests')
          .select('id, name, email, phone, nationality, city')
          .ilike('name', `%${variant}%`)
          .order('updated_at', { ascending: false })
          .limit(10);
        
        if (error) {
          console.error('Error fetching guest suggestions:', error);
          continue;
        }
        
        if (data) {
          allGuests = [...allGuests, ...data];
        }
      }
      
      // Duplikate entfernen (nach ID)
      const uniqueGuests = allGuests.filter((guest, index, self) =>
        index === self.findIndex(g => g.id === guest.id)
      );
      
      // Nach Relevanz sortieren (exakte Treffer zuerst, dann normalisierte Treffer)
      const normalizedSearch = normalizeGermanName(searchTerm);
      const searchLower = searchTerm.toLowerCase();
      
      return uniqueGuests
        .sort((a, b) => {
          const aNameLower = a.name.toLowerCase();
          const bNameLower = b.name.toLowerCase();
          const aNormalized = normalizeGermanName(a.name);
          const bNormalized = normalizeGermanName(b.name);
          
          // Exakte Übereinstimmung zuerst
          const aExact = aNameLower.includes(searchLower);
          const bExact = bNameLower.includes(searchLower);
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          
          // Dann normalisierte Übereinstimmung
          const aMatch = aNormalized.includes(normalizedSearch);
          const bMatch = bNormalized.includes(normalizedSearch);
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
          
          return 0;
        })
        .slice(0, 5);
    },
    enabled: searchTerm.length >= 2 && isOpen,
    staleTime: 10000,
  });

  // Check if a suggestion is a "similar name" (umlaut variant)
  const isSimilarName = (guestName: string): boolean => {
    const searchLower = searchTerm.toLowerCase();
    const nameLower = guestName.toLowerCase();
    
    // If the name contains the exact search term, it's not a "similar" match
    if (nameLower.includes(searchLower)) return false;
    
    // Check if normalized versions match
    const normalizedSearch = normalizeGermanName(searchTerm);
    const normalizedName = normalizeGermanName(guestName);
    
    return normalizedName.includes(normalizedSearch);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || searchTerm.length < 2) return null;
  if (isLoading) {
    return (
      <div 
        ref={containerRef}
        className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-3"
      >
        <p className="text-sm text-muted-foreground">Suche Gäste...</p>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg overflow-hidden"
    >
      <div className="px-3 py-2 bg-muted/50 border-b">
        <p className="text-xs text-muted-foreground font-medium">
          {suggestions.length} bestehende{suggestions.length === 1 ? 'r' : ''} Gast gefunden:
        </p>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {suggestions.map((guest) => {
          const similar = isSimilarName(guest.name);
          
          return (
            <button
              key={guest.id}
              type="button"
              onClick={() => {
                onSelect(guest);
                onClose();
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 hover:bg-accent transition-colors",
                "flex flex-col gap-1 border-b last:border-b-0",
                similar && "bg-orange-50 dark:bg-orange-950/20"
              )}
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <span className="font-medium">{guest.name}</span>
                {similar && (
                  <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/40 px-1.5 py-0.5 rounded">
                    <AlertCircle className="h-3 w-3" />
                    Ähnlicher Name
                  </span>
                )}
                {guest.nationality && (
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {guest.nationality}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground ml-6">
                {guest.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {guest.email}
                  </span>
                )}
                {guest.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {guest.phone}
                  </span>
                )}
                {guest.city && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {guest.city}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
