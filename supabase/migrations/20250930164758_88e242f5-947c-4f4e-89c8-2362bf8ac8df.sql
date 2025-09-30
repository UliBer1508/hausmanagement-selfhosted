-- Tabelle für historischen Wäscheverbrauch
CREATE TABLE IF NOT EXISTS public.linen_usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  actual_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted_usage JSONB DEFAULT '{}'::jsonb,
  number_of_guests INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  season TEXT,
  weather_condition TEXT,
  guest_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabelle für Vorhersage-Genauigkeit und Model Performance
CREATE TABLE IF NOT EXISTS public.prediction_accuracy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  prediction_date TIMESTAMPTZ NOT NULL,
  actual_date TIMESTAMPTZ,
  predicted_values JSONB NOT NULL,
  actual_values JSONB,
  accuracy_score DECIMAL(5,4),
  mae DECIMAL(10,2), -- Mean Absolute Error
  rmse DECIMAL(10,2), -- Root Mean Squared Error
  model_version TEXT,
  parameters_used JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabelle für saisonale Anpassungen
CREATE TABLE IF NOT EXISTS public.seasonal_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES public.houses(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  month INTEGER,
  adjustment_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  based_on_samples INTEGER DEFAULT 0,
  confidence_score DECIMAL(5,4),
  last_calculated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabelle für Gästetyp-spezifische Verhaltensmuster
CREATE TABLE IF NOT EXISTS public.guest_behavior_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_type TEXT NOT NULL,
  nationality TEXT,
  avg_linen_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage_multiplier DECIMAL(5,2) DEFAULT 1.0,
  sample_size INTEGER DEFAULT 0,
  confidence_level DECIMAL(5,4),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guest_type, nationality)
);

-- Tabelle für dynamische ML-Modell-Parameter
CREATE TABLE IF NOT EXISTS public.model_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID REFERENCES public.houses(id) ON DELETE CASCADE,
  parameter_set_name TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  learning_rate DECIMAL(5,4) DEFAULT 0.01,
  seasonal_weights JSONB DEFAULT '{}'::jsonb,
  guest_type_multipliers JSONB DEFAULT '{}'::jsonb,
  booking_pattern_influence DECIMAL(5,2) DEFAULT 1.0,
  weather_impact_factor DECIMAL(5,2) DEFAULT 1.0,
  performance_score DECIMAL(5,4),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabelle für User-Feedback zur Optimierung
CREATE TABLE IF NOT EXISTS public.optimization_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  optimization_result_id UUID REFERENCES public.ai_optimization_results(id) ON DELETE CASCADE,
  house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('accurate', 'too_high', 'too_low', 'good', 'bad')),
  actual_order JSONB,
  comments TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Erweiterte Indexes für Performance
CREATE INDEX idx_linen_usage_history_house_date ON public.linen_usage_history(house_id, date DESC);
CREATE INDEX idx_linen_usage_history_season ON public.linen_usage_history(season, house_id);
CREATE INDEX idx_prediction_accuracy_house ON public.prediction_accuracy(house_id, prediction_date DESC);
CREATE INDEX idx_seasonal_adjustments_house_season ON public.seasonal_adjustments(house_id, season);
CREATE INDEX idx_guest_behavior_type ON public.guest_behavior_patterns(guest_type);
CREATE INDEX idx_model_parameters_house_active ON public.model_parameters(house_id, is_active);
CREATE INDEX idx_optimization_feedback_house ON public.optimization_feedback(house_id, created_at DESC);

-- Trigger für updated_at
CREATE TRIGGER update_seasonal_adjustments_updated_at
  BEFORE UPDATE ON public.seasonal_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_guest_behavior_patterns_updated_at
  BEFORE UPDATE ON public.guest_behavior_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_model_parameters_updated_at
  BEFORE UPDATE ON public.model_parameters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.linen_usage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_accuracy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_behavior_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on linen_usage_history"
  ON public.linen_usage_history FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on prediction_accuracy"
  ON public.prediction_accuracy FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on seasonal_adjustments"
  ON public.seasonal_adjustments FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on guest_behavior_patterns"
  ON public.guest_behavior_patterns FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on model_parameters"
  ON public.model_parameters FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on optimization_feedback"
  ON public.optimization_feedback FOR ALL USING (true) WITH CHECK (true);