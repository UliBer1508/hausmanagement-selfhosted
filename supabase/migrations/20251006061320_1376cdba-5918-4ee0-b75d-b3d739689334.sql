-- Remove all RLS policies from the database

-- recommendation_feedback policies
DROP POLICY IF EXISTS "Anyone can insert feedback" ON recommendation_feedback;
DROP POLICY IF EXISTS "Feedback viewable by system" ON recommendation_feedback;

-- recommendation_metrics policies
DROP POLICY IF EXISTS "Metrics viewable by everyone" ON recommendation_metrics;
DROP POLICY IF EXISTS "System can manage metrics" ON recommendation_metrics;

-- saved_trip_plans policies
DROP POLICY IF EXISTS "Anyone can access saved plans with valid token" ON saved_trip_plans;
DROP POLICY IF EXISTS "Anyone can create saved plans" ON saved_trip_plans;
DROP POLICY IF EXISTS "Anyone can update their own saved plans with token" ON saved_trip_plans;

-- search_algorithm_config policies
DROP POLICY IF EXISTS "Algorithm config is viewable by everyone" ON search_algorithm_config;
DROP POLICY IF EXISTS "Only system can manage algorithm config" ON search_algorithm_config;

-- seasonal_adjustments policies
DROP POLICY IF EXISTS "Allow all operations on seasonal_adjustments" ON seasonal_adjustments;