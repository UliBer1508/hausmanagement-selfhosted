-- Drop all existing RLS policies
DROP POLICY IF EXISTS "Allow all operations on optimization_feedback" ON optimization_feedback;
DROP POLICY IF EXISTS "Allow all operations on prediction_accuracy" ON prediction_accuracy;