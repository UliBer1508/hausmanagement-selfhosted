-- Phase 1g: Lösche ungenutzte ML-Tabellen (alle leer, keine aktiven Referenzen)
DROP TABLE IF EXISTS linen_usage_history;
DROP TABLE IF EXISTS prediction_accuracy;
DROP TABLE IF EXISTS model_parameters;
DROP TABLE IF EXISTS seasonal_adjustments;