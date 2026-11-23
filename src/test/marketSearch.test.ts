import { describe, it, expect } from 'vitest';
import {
  readSearchParams, writeSearchParams, portalsForCountry, possibleColdRent, marketOf, rentalCountryOf,
} from '@/lib/marketSearch';

describe('marketSearch', () => {
  it('Altformat touristisch (Venediger Chalet) landet unter tourist', () => {
    const r = readSearchParams({ guests: 6, location: '5741 Neukirchen am GV', platforms: ['alle'] });
    expect(r.tourist?.guests).toBe(6);
    expect(r.rental).toBeUndefined();
  });

  it('Altformat Langzeit landet unter rental, m² wird verworfen', () => {
    const r = readSearchParams({ sqm: 60, rooms: 3, radius_km: 10, platforms: ['immowelt'] });
    expect(r.rental).toEqual({ rooms: 3, radius_km: 10, platforms: ['immowelt'] });
    expect(r.tourist).toBeUndefined();
  });

  it('Speichern eines Marktes lässt den anderen stehen', () => {
    const raw = { guests: 6, location: 'Neukirchen', platforms: ['alle'] };
    const next = writeSearchParams(raw, 'long_term', { rooms: 4, radius_km: 15, platforms: ['willhaben'] });
    expect(next.tourist?.location).toBe('Neukirchen');
    expect(next.rental?.rooms).toBe(4);
  });

  it('leere/kaputte Werte ergeben leere Parameter', () => {
    expect(readSearchParams(null)).toEqual({});
    expect(readSearchParams('x')).toEqual({});
  });

  it('Portale je Land: deutsche Portale fallen in AT weg', () => {
    expect(portalsForCountry(['immowelt'], 'AT')).toEqual(['alle']);
    expect(portalsForCountry(['willhaben', 'immowelt'], 'AT')).toEqual(['willhaben']);
    expect(portalsForCountry(undefined, 'DE')).toEqual(['alle']);
  });

  it('mögliche Kaltmiete nur mit m² und €/m²', () => {
    expect(possibleColdRent(145, 9.4)).toBe(1360);
    expect(possibleColdRent(null, 9.4)).toBeNull();
    expect(possibleColdRent(145, 0)).toBeNull();
  });

  it('Markt und Land', () => {
    expect(marketOf('long_term')).toBe('long_term');
    expect(marketOf(null)).toBe('tourist');
    expect(rentalCountryOf('AT')).toBe('AT');
    expect(rentalCountryOf(null)).toBe('DE');
  });
});
