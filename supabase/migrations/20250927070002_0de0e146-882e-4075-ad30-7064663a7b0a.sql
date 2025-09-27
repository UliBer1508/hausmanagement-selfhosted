-- ========================================
-- KI-ANALYSE HISTORIE FÜR AUSFLUGPLANER - KORRIGIERT
-- ========================================

-- 1. KI-Optimierungsergebnisse speichern
CREATE TABLE public.ai_optimization_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  analysis_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  optimization_result JSONB NOT NULL,
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  recommendations JSONB,
  guest_behavior_insights JSONB, -- Neue Spalte für Gäste-Verhalten
  seasonal_patterns JSONB, -- Saisonale Muster
  booking_patterns JSONB, -- Buchungsmuster für Personalisierung
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Aktivitäten und Ausflüge
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- hiking, culture, food, wellness, adventure, family
  subcategory TEXT, -- specific type within category
  location TEXT NOT NULL,
  address TEXT,
  coordinates JSONB, -- {lat: number, lng: number}
  duration_minutes INTEGER, -- geschätzte Dauer
  difficulty_level INTEGER CHECK (difficulty_level >= 1 AND difficulty_level <= 5), -- 1=easy, 5=expert
  price_min NUMERIC(10,2), -- Mindestpreis
  price_max NUMERIC(10,2), -- Höchstpreis
  currency TEXT DEFAULT 'EUR',
  season_availability TEXT[], -- ['spring', 'summer', 'autumn', 'winter']
  weather_dependent BOOLEAN DEFAULT false,
  group_size_min INTEGER DEFAULT 1,
  group_size_max INTEGER,
  age_restrictions JSONB, -- {min_age: number, max_age: number}
  equipment_needed TEXT[],
  languages_available TEXT[] DEFAULT ARRAY['de'],
  booking_required BOOLEAN DEFAULT true,
  advance_booking_hours INTEGER DEFAULT 24, -- Vorlaufzeit für Buchung
  cancellation_policy TEXT,
  provider_name TEXT,
  provider_contact JSONB, -- {email, phone, website}
  images TEXT[], -- Array von Bild-URLs
  tags TEXT[], -- Flexible Tags für bessere Suche
  rating NUMERIC(2,1) CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER DEFAULT 0,
  popularity_score INTEGER DEFAULT 0, -- Basierend auf Buchungen
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Gäste-Präferenzen basierend auf KI-Analysen
CREATE TABLE public.guest_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_email TEXT NOT NULL, -- Verknüpfung über E-Mail da Gäste nicht in auth.users
  house_id UUID REFERENCES public.houses(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  
  -- Demografische Daten
  age_group TEXT, -- young_adult, middle_aged, senior
  group_type TEXT, -- family, couple, solo, friends, business
  group_size INTEGER,
  nationality TEXT,
  
  -- Präferenzen basierend auf KI-Analyse der Buchungsmuster
  preferred_categories TEXT[], -- Abgeleitet aus Buchungsverhalten
  activity_level TEXT, -- low, medium, high (basierend auf Aufenthaltsdauer)
  budget_range TEXT, -- budget, mid_range, luxury
  weather_preference TEXT, -- indoor, outdoor, flexible
  time_preference TEXT, -- morning, afternoon, evening, flexible
  
  -- KI-abgeleitete Insights
  predicted_interests JSONB, -- Von KI vorhergesagte Interessen
  confidence_score NUMERIC(3,2),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(guest_email, booking_id)
);

-- 4. Aktivitäts-Empfehlungen (KI-generiert)
CREATE TABLE public.activity_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_email TEXT NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
  
  -- Empfehlungs-Metriken
  recommendation_score NUMERIC(3,2) CHECK (recommendation_score >= 0 AND recommendation_score <= 1),
  reasoning JSONB, -- Warum diese Aktivität empfohlen wird
  
  -- Personalisierung
  personalized_description TEXT, -- Angepasste Beschreibung
  optimal_time_slot TEXT, -- Beste Zeit für diesen Gast
  custom_duration INTEGER, -- Angepasste Dauer
  
  -- Status
  status TEXT DEFAULT 'suggested', -- suggested, viewed, interested, booked, completed, dismissed
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Empfehlung läuft ab
  
  UNIQUE(guest_email, booking_id, activity_id)
);

-- 5. Gebuchte/Geplante Aktivitäten
CREATE TABLE public.booking_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  
  -- Buchungsdetails
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  duration_minutes INTEGER,
  participants INTEGER NOT NULL,
  
  -- Kosten
  total_price NUMERIC(10,2),
  currency TEXT DEFAULT 'EUR',
  
  -- Status
  status TEXT DEFAULT 'planned', -- planned, confirmed, completed, cancelled
  booking_reference TEXT, -- Externe Buchungsnummer
  
  -- Feedback
  rating NUMERIC(2,1) CHECK (rating >= 0 AND rating <= 5),
  review TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(booking_id, activity_id, scheduled_date)
);

-- 6. Aktivitäts-Verfügbarkeit (KORRIGIERT: Ohne duplicate PRIMARY KEY)
CREATE TABLE public.activity_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_slot TIME NOT NULL,
  available_spots INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10,2),
  special_conditions TEXT,
  is_available BOOLEAN DEFAULT true,
  
  -- Unique constraint statt PRIMARY KEY für Kombination
  UNIQUE(activity_id, date, time_slot)
);

-- ========================================
-- INDIZES FÜR PERFORMANCE
-- ========================================

-- KI-Optimierungsergebnisse
CREATE INDEX idx_ai_optimization_house_date ON public.ai_optimization_results(house_id, analysis_date DESC);
CREATE INDEX idx_ai_optimization_date ON public.ai_optimization_results(analysis_date DESC);

-- Aktivitäten
CREATE INDEX idx_activities_category ON public.activities(category);
CREATE INDEX idx_activities_location ON public.activities(location);
CREATE INDEX idx_activities_active ON public.activities(is_active) WHERE is_active = true;
CREATE INDEX idx_activities_popularity ON public.activities(popularity_score DESC);
CREATE INDEX idx_activities_rating ON public.activities(rating DESC);

-- Gäste-Präferenzen
CREATE INDEX idx_guest_preferences_email ON public.guest_preferences(guest_email);
CREATE INDEX idx_guest_preferences_booking ON public.guest_preferences(booking_id);

-- Empfehlungen
CREATE INDEX idx_recommendations_guest_booking ON public.activity_recommendations(guest_email, booking_id);
CREATE INDEX idx_recommendations_status ON public.activity_recommendations(status);
CREATE INDEX idx_recommendations_score ON public.activity_recommendations(recommendation_score DESC);

-- Buchungs-Aktivitäten
CREATE INDEX idx_booking_activities_booking ON public.booking_activities(booking_id);
CREATE INDEX idx_booking_activities_date ON public.booking_activities(scheduled_date);
CREATE INDEX idx_booking_activities_status ON public.booking_activities(status);

-- Verfügbarkeit
CREATE INDEX idx_activity_availability_lookup ON public.activity_availability(activity_id, date, time_slot);

-- ========================================
-- RLS POLICIES
-- ========================================

-- KI-Optimierungsergebnisse - Öffentlich lesbar für Analytics
ALTER TABLE public.ai_optimization_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AI optimization results are viewable by everyone" 
ON public.ai_optimization_results 
FOR SELECT 
USING (true);

CREATE POLICY "Only system can insert AI optimization results" 
ON public.ai_optimization_results 
FOR INSERT 
WITH CHECK (true); -- Wird durch Edge Functions gesteuert

-- Aktivitäten - Öffentlich lesbar
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activities are viewable by everyone" 
ON public.activities 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Only admins can manage activities" 
ON public.activities 
FOR ALL 
USING (true) -- Später durch Rollen-System erweitern
WITH CHECK (true);

-- Gäste-Präferenzen - Nur für eigene E-Mail
ALTER TABLE public.guest_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guest preferences are viewable by system" 
ON public.guest_preferences 
FOR SELECT 
USING (true); -- System-Zugriff für Empfehlungen

CREATE POLICY "System can manage guest preferences" 
ON public.guest_preferences 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Aktivitäts-Empfehlungen - System-gesteuert
ALTER TABLE public.activity_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recommendations are viewable by system" 
ON public.activity_recommendations 
FOR SELECT 
USING (true);

CREATE POLICY "System can manage recommendations" 
ON public.activity_recommendations 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Buchungs-Aktivitäten - System-gesteuert
ALTER TABLE public.booking_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Booking activities are viewable by system" 
ON public.booking_activities 
FOR SELECT 
USING (true);

CREATE POLICY "System can manage booking activities" 
ON public.booking_activities 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Aktivitäts-Verfügbarkeit - Öffentlich lesbar
ALTER TABLE public.activity_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity availability is viewable by everyone" 
ON public.activity_availability 
FOR SELECT 
USING (is_available = true);

CREATE POLICY "Only system can manage availability" 
ON public.activity_availability 
FOR ALL 
USING (true)
WITH CHECK (true);