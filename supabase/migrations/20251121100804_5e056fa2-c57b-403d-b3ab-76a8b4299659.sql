-- Erweitere task_status ENUM um 'draft' Status
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'draft';

COMMENT ON TYPE task_status IS 'Task status: draft (automatisch erstellt, muss geprüft werden), scheduled (geplant), in_progress, completed, cancelled, delayed';