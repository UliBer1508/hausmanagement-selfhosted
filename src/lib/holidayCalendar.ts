import { parseISO } from 'date-fns';

export interface Holiday {
  start: string;
  end: string;
  name: string;
  countries: string[];
  type: 'school_holiday' | 'public_holiday';
  boost: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface HolidayMatch {
  isHoliday: boolean;
  holidays: Holiday[];
  maxBoost: number;
  targetCountries: string[];
}

// Umfassender Ferienkalender für DE, NL, BE, AT (2025-2026)
export const HOLIDAY_CALENDAR_2025_2026: Holiday[] = [
  // ═══════════════════ WEIHNACHTEN/NEUJAHR ═══════════════════
  { 
    start: '2025-12-20', 
    end: '2026-01-06', 
    name: 'Weihnachtsferien', 
    countries: ['DE', 'NL', 'BE', 'AT'],
    type: 'school_holiday',
    boost: 1.5,
    priority: 'critical'
  },
  
  // ═══════════════════ WINTER/KROKUS 2026 ═══════════════════
  { 
    start: '2026-02-14', 
    end: '2026-02-22', 
    name: '🇳🇱 NL Voorjaarsvakantie (Nord)', 
    countries: ['NL'],
    type: 'school_holiday',
    boost: 1.4,
    priority: 'high'
  },
  { 
    start: '2026-02-21', 
    end: '2026-03-01', 
    name: '🇳🇱 NL Voorjaarsvakantie (Süd/Mitte)', 
    countries: ['NL'],
    type: 'school_holiday',
    boost: 1.4,
    priority: 'high'
  },
  { 
    start: '2026-02-14', 
    end: '2026-02-22', 
    name: '🇧🇪 BE Krokusferien', 
    countries: ['BE'],
    type: 'school_holiday',
    boost: 1.4,
    priority: 'high'
  },
  { 
    start: '2026-02-07', 
    end: '2026-02-15', 
    name: '🇦🇹 AT Semesterferien (Wien/NÖ)', 
    countries: ['AT'],
    type: 'school_holiday',
    boost: 1.3,
    priority: 'medium'
  },
  { 
    start: '2026-02-02', 
    end: '2026-02-14', 
    name: '🇩🇪 DE Winterferien (div. Bundesländer)', 
    countries: ['DE'],
    type: 'school_holiday',
    boost: 1.3,
    priority: 'medium'
  },
  
  // ═══════════════════ OSTERN 2026 ═══════════════════
  { 
    start: '2026-03-28', 
    end: '2026-04-12', 
    name: 'Osterferien', 
    countries: ['DE', 'NL', 'BE', 'AT'],
    type: 'school_holiday',
    boost: 1.35,
    priority: 'high'
  },
  
  // ═══════════════════ MAI-BRÜCKEN 2026 ═══════════════════
  { 
    start: '2026-04-25', 
    end: '2026-05-10', 
    name: '🇳🇱 NL Meivakantie', 
    countries: ['NL'],
    type: 'school_holiday',
    boost: 1.25,
    priority: 'medium'
  },
  { 
    start: '2026-05-01', 
    end: '2026-05-03', 
    name: 'Tag der Arbeit (Brückentag)', 
    countries: ['DE', 'AT'],
    type: 'public_holiday',
    boost: 1.2,
    priority: 'medium'
  },
  { 
    start: '2026-05-14', 
    end: '2026-05-17', 
    name: 'Himmelfahrt + Brückentag', 
    countries: ['DE', 'NL', 'BE', 'AT'],
    type: 'public_holiday',
    boost: 1.3,
    priority: 'high'
  },
  
  // ═══════════════════ PFINGSTEN 2026 ═══════════════════
  { 
    start: '2026-05-23', 
    end: '2026-06-07', 
    name: 'Pfingstferien', 
    countries: ['DE', 'AT'],
    type: 'school_holiday',
    boost: 1.3,
    priority: 'high'
  },
  
  // ═══════════════════ SOMMER 2026 ═══════════════════
  { 
    start: '2026-07-04', 
    end: '2026-07-19', 
    name: '🇳🇱 NL Sommerferien (Nord)', 
    countries: ['NL'],
    type: 'school_holiday',
    boost: 1.0,
    priority: 'low'
  },
  { 
    start: '2026-07-18', 
    end: '2026-08-30', 
    name: '🇳🇱 NL Sommerferien (Süd/Mitte)', 
    countries: ['NL'],
    type: 'school_holiday',
    boost: 1.0,
    priority: 'low'
  },
  { 
    start: '2026-07-01', 
    end: '2026-08-31', 
    name: '🇧🇪 BE Sommerferien', 
    countries: ['BE'],
    type: 'school_holiday',
    boost: 1.0,
    priority: 'low'
  },
  { 
    start: '2026-07-30', 
    end: '2026-09-12', 
    name: '🇩🇪 DE Sommerferien (Baden-W.)', 
    countries: ['DE'],
    type: 'school_holiday',
    boost: 1.0,
    priority: 'low'
  },
  { 
    start: '2026-08-03', 
    end: '2026-09-14', 
    name: '🇩🇪 DE Sommerferien (Bayern)', 
    countries: ['DE'],
    type: 'school_holiday',
    boost: 1.0,
    priority: 'low'
  },
  
  // ═══════════════════ HERBST 2026 ═══════════════════
  { 
    start: '2026-10-17', 
    end: '2026-10-25', 
    name: '🇳🇱 NL Herbstferien', 
    countries: ['NL'],
    type: 'school_holiday',
    boost: 1.2,
    priority: 'medium'
  },
  { 
    start: '2026-10-26', 
    end: '2026-11-02', 
    name: '🇦🇹 AT Herbstferien', 
    countries: ['AT'],
    type: 'school_holiday',
    boost: 1.15,
    priority: 'medium'
  },
  { 
    start: '2026-11-02', 
    end: '2026-11-06', 
    name: '🇩🇪 DE Herbstferien (Bayern)', 
    countries: ['DE'],
    type: 'school_holiday',
    boost: 1.15,
    priority: 'medium'
  },
  
  // ═══════════════════ EINZELNE FEIERTAGE ═══════════════════
  { 
    start: '2026-04-25', 
    end: '2026-04-27', 
    name: '🇳🇱 Koningsdag', 
    countries: ['NL'],
    type: 'public_holiday',
    boost: 1.25,
    priority: 'medium'
  },
  { 
    start: '2026-06-04', 
    end: '2026-06-07', 
    name: '🇦🇹 Fronleichnam + Brücke', 
    countries: ['AT'],
    type: 'public_holiday',
    boost: 1.2,
    priority: 'medium'
  },
];

export const checkHolidayPeriod = (
  startDate: Date, 
  endDate: Date,
  relevantCountries: string[]
): HolidayMatch => {
  const matchingHolidays = HOLIDAY_CALENDAR_2025_2026.filter(holiday => {
    const hStart = parseISO(holiday.start);
    const hEnd = parseISO(holiday.end);
    
    // Prüfe Überlappung
    const hasOverlap = startDate <= hEnd && endDate >= hStart;
    
    // Prüfe ob mindestens ein Land relevant ist
    const hasRelevantCountry = holiday.countries.some(c => relevantCountries.includes(c));
    
    return hasOverlap && hasRelevantCountry;
  });
  
  if (matchingHolidays.length === 0) {
    return { 
      isHoliday: false, 
      holidays: [], 
      maxBoost: 1.0, 
      targetCountries: [] 
    };
  }
  
  const maxBoost = Math.max(...matchingHolidays.map(h => h.boost));
  const targetCountries = [...new Set(matchingHolidays.flatMap(h => h.countries))];
  
  return {
    isHoliday: true,
    holidays: matchingHolidays,
    maxBoost,
    targetCountries
  };
};
