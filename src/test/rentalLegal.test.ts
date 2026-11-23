import { describe, expect, it } from 'vitest';
import { capFromLegal, findKnownRegime, type LegalCheck } from '../../supabase/functions/rental-ai-analysis/legal';

const legal = (o: Partial<LegalCheck>): LegalCheck => ({
  municipality: null, state: null, regime: null, applies: null, regulation: null, valid_until: null,
  confirmed: false, reference_per_sqm: null, reference_range: null, reference_source: null,
  mietspiegel_url: null, notes: [], sources: [], ...o,
});

describe('findKnownRegime', () => {
  it('„Berlin Falkensee“ ist Falkensee (Brandenburg), nicht Berlin', () => {
    expect(findKnownRegime('Einsteinstrasse 13\nBerlin Falkensee')?.municipality).toBe('Falkensee');
  });
  it('erkennt München und Berlin', () => {
    expect(findKnownRegime('Winthirstrasse 4, 80639 München')?.state).toBe('Bayern');
    expect(findKnownRegime('Hauptstr. 1, 10827 Berlin')?.municipality).toBe('Berlin');
  });
  it('Österreich bleibt ohne Treffer', () => {
    expect(findKnownRegime('Venedigersiedlung 316, 5741 Neukirchen am GV')).toBeNull();
  });
});

describe('capFromLegal', () => {
  it('erfasste Obergrenze hat Vorrang', () => {
    expect(capFromLegal(3500, legal({ applies: true, reference_per_sqm: 15 }), 180, 'DE')).toEqual({ cap: 3500, basis: 'manual' });
  });
  it('Mietpreisbremse: Vergleichsmiete + 10 %, abgerundet auf 10 €', () => {
    // 15,38 × 1,1 × 180 = 3045,24 → 3040
    expect(capFromLegal(null, legal({ applies: true, reference_per_sqm: 15.38 }), 180, 'DE')).toEqual({ cap: 3040, basis: 'mietpreisbremse' });
  });
  it('ohne Mietpreisbremse: § 5 WiStG + 20 %', () => {
    expect(capFromLegal(null, legal({ applies: false, reference_per_sqm: 10 }), 100, 'DE')).toEqual({ cap: 1200, basis: 'wistg' });
  });
  it('ohne Vergleichsmiete oder in Österreich keine automatische Grenze', () => {
    expect(capFromLegal(null, legal({ applies: true }), 145, 'DE').cap).toBeNull();
    expect(capFromLegal(null, legal({ reference_per_sqm: 12 }), 140, 'AT').cap).toBeNull();
  });
});
