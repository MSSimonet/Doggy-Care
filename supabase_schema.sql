-- =========================================================
-- ESQUEMA COMPLETO DE BASE DE DATOS SUPABASE - PENSIONADOS
-- Para una base NUEVA. Copiá todo en Supabase Dashboard -> SQL Editor -> New Query -> Run,
-- después de reemplazar el UUID del administrador (sección 5). Luego, las migraciones 003 a 005.
-- =========================================================

-- 1. TABLA: ESTADÍAS ACTIVAS (AGENDA)
CREATE TABLE IF NOT EXISTS public.stays (
  id TEXT PRIMARY KEY,
  dog_name TEXT NOT NULL,
  client_name TEXT,
  client_phone TEXT,
  dog_breed TEXT,
  from_day TEXT NOT NULL,
  until_day TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 1,
  daily_rate NUMERIC NOT NULL DEFAULT 21000,
  is_capital BOOLEAN NOT NULL DEFAULT true,
  custom_km NUMERIC,
  expenses NUMERIC DEFAULT 0,
  bath NUMERIC DEFAULT 0,
  money_advance NUMERIC DEFAULT 0,
  tip NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  dz_transferred BOOLEAN DEFAULT false,
  notes TEXT,
  saved_to_history BOOLEAN DEFAULT false,
  history_record_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Si la tabla ya existía, asegurarse de que tenga la columna history_record_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'stays' AND column_name = 'history_record_id'
  ) THEN
    ALTER TABLE public.stays ADD COLUMN history_record_id TEXT;
  END IF;
END $$;

-- 2. TABLA: HISTORIAL COMPLETO DE ESTADÍAS (278+ DEL EXCEL)
CREATE TABLE IF NOT EXISTS public.historical_stays (
  id TEXT PRIMARY KEY,
  row_index INTEGER NOT NULL DEFAULT 0,
  dog_name TEXT NOT NULL,
  raw_dog_name TEXT,
  from_day TEXT NOT NULL,
  until_day TEXT NOT NULL,
  days INTEGER NOT NULL DEFAULT 1,
  daily_rate NUMERIC NOT NULL,
  daily_rate_raw TEXT,
  total_pagar NUMERIC NOT NULL,
  total_pagar_raw TEXT,
  dz NUMERIC NOT NULL,
  neto NUMERIC NOT NULL,
  fuel NUMERIC DEFAULT 0,
  mixta NUMERIC DEFAULT 0,
  solo_usd NUMERIC DEFAULT 0,
  pure_rate NUMERIC NOT NULL,
  pure_rate_raw TEXT,
  ifm_daily NUMERIC NOT NULL DEFAULT 0,
  total_ifm NUMERIC NOT NULL DEFAULT 0,
  neto_euros NUMERIC DEFAULT 0,
  dz_transferred BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA: CONFIGURACIÓN GENERAL Y COTIZACIONES
CREATE TABLE IF NOT EXISTS public.app_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  fuel_price_per_liter NUMERIC DEFAULT 2200,
  fuel_consumption_km_per_liter NUMERIC DEFAULT 7.5,
  base_transport_liters NUMERIC DEFAULT 16,
  default_capital_km NUMERIC DEFAULT 90,
  dz_rate NUMERIC DEFAULT 0.18,
  maintenance_rate NUMERIC DEFAULT 0.05,
  usd_reference_daily NUMERIC DEFAULT 5.5,
  fuel_fixed_component NUMERIC DEFAULT 7810,
  promedio_usd NUMERIC DEFAULT 1347,
  blue NUMERIC DEFAULT 1400,
  mep NUMERIC DEFAULT 1330,
  bna NUMERIC DEFAULT 1045,
  ccl NUMERIC DEFAULT 1360,
  tarjeta NUMERIC DEFAULT 1672,
  euro_blue NUMERIC DEFAULT 1550,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar configuración inicial por defecto si no existe
INSERT INTO public.app_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 4. TABLA: DIRECTORIO DE CLIENTES (31 HUÉSPEDES)
CREATE TABLE IF NOT EXISTS public.clients_directory (
  id TEXT PRIMARY KEY,
  dog_name TEXT NOT NULL,
  breed TEXT,
  birth_year INTEGER,
  owner_name TEXT NOT NULL,
  owner_last_name TEXT,
  relatives TEXT,
  contact TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ROW LEVEL SECURITY: SÓLO EL ADMINISTRADOR AUTENTICADO
-- Antes de correr: crear el usuario en Authentication → Users y reemplazar el marcador
-- 00000000-0000-0000-0000-000000000000 por su UUID. Nunca se da acceso al rol anon.
ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients_directory ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stays             FROM anon;
REVOKE ALL ON public.historical_stays  FROM anon;
REVOKE ALL ON public.app_config        FROM anon;
REVOKE ALL ON public.clients_directory FROM anon;

DROP POLICY IF EXISTS "Solo el dueño puede operar stays" ON public.stays;
CREATE POLICY "Solo el dueño puede operar stays"
  ON public.stays FOR ALL TO authenticated
  USING      ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

DROP POLICY IF EXISTS "Solo el dueño puede operar historical_stays" ON public.historical_stays;
CREATE POLICY "Solo el dueño puede operar historical_stays"
  ON public.historical_stays FOR ALL TO authenticated
  USING      ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

DROP POLICY IF EXISTS "Solo el dueño puede operar app_config" ON public.app_config;
CREATE POLICY "Solo el dueño puede operar app_config"
  ON public.app_config FOR ALL TO authenticated
  USING      ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

DROP POLICY IF EXISTS "Solo el dueño puede operar clients_directory" ON public.clients_directory;
CREATE POLICY "Solo el dueño puede operar clients_directory"
  ON public.clients_directory FOR ALL TO authenticated
  USING      ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

-- 6. HABILITAR REALTIME EN LAS TABLAS PRINCIPALES
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stays;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.historical_stays;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clients_directory;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
