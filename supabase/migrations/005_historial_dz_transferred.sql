-- Migración 005: tilde, monto y fecha de deducción transferida + tasas por año y fecha de inicio
-- Preparada, NO ejecutada. Revisar antes de correr en el SQL Editor de Supabase.
--
-- Por qué: historical_stays de la base real no tiene dz_transferred ni dz_transferred_amount. Al tildar
-- "transferida" en un registro archivado, la nube no lo guardaba y al releerla el tilde se perdía: las
-- deducciones volvían a aparecer como pendientes. Mientras no se aplique, la app guarda el tilde en el
-- teléfono y avisa que todavía no está en la nube.
--
-- Es seguro: sólo agrega columnas con valor por defecto; no cambia ni borra datos existentes.

-- ── APLICAR ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.historical_stays ADD COLUMN IF NOT EXISTS dz_transferred boolean DEFAULT false;
ALTER TABLE public.historical_stays ADD COLUMN IF NOT EXISTS dz_transferred_amount numeric DEFAULT 0;
ALTER TABLE public.historical_stays ADD COLUMN IF NOT EXISTS dz_transferred_at timestamptz;
-- dz_rate ya existe en historical_stays (migración 003); se deja por si alguna base no la tiene
ALTER TABLE public.historical_stays ADD COLUMN IF NOT EXISTS dz_rate numeric;

ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS dz_transferred_at timestamptz;

-- Ajustes > Deducciones: tasa por año de la fecha de fin ({"2026": 0.18, "2027": 0.19}) y fecha de inicio
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS dz_rates_by_year jsonb DEFAULT '{"2026": 0.18, "2027": 0.19}'::jsonb;
ALTER TABLE public.app_config ADD COLUMN IF NOT EXISTS dz_start_date date DEFAULT '2026-01-01';

-- Control (después de aplicar): tienen que aparecer las columnas nuevas
-- SELECT table_name, column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND column_name IN ('dz_transferred', 'dz_transferred_amount', 'dz_transferred_at', 'dz_rate', 'dz_rates_by_year', 'dz_start_date')
--  ORDER BY table_name, column_name;

-- ── DESHACER (sólo si hace falta volver atrás; borra los tildes y fechas guardados en esas columnas) ──
-- ALTER TABLE public.app_config DROP COLUMN IF EXISTS dz_start_date;
-- ALTER TABLE public.app_config DROP COLUMN IF EXISTS dz_rates_by_year;
-- ALTER TABLE public.stays DROP COLUMN IF EXISTS dz_transferred_at;
-- ALTER TABLE public.historical_stays DROP COLUMN IF EXISTS dz_transferred_at;
-- ALTER TABLE public.historical_stays DROP COLUMN IF EXISTS dz_transferred_amount;
-- ALTER TABLE public.historical_stays DROP COLUMN IF EXISTS dz_transferred;
-- (dz_rate de historical_stays no se borra: es de la migración 003)
