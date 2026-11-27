-- =============================================================
-- 001_auth_rls.sql
-- Cierra las tablas a anon, exige auth y restringe al dueño.
-- SUSTITUYE las políticas "Permitir todo..." del schema inicial.
--
-- Antes de ejecutar:
--   1. Crear tu usuario en Supabase Auth (magic link o email+pwd).
--   2. Reemplazar '00000000-0000-0000-0000-000000000000' (marcador) con el UUID de ese usuario
--      (Dashboard → Authentication → Users → copiar el UUID).
--   3. Rotar la clave anon en Dashboard → Settings → API → Rotate.
-- =============================================================

-- 1. Quitar acceso al rol anon en las 4 tablas
REVOKE ALL ON public.stays             FROM anon;
REVOKE ALL ON public.historical_stays  FROM anon;
REVOKE ALL ON public.app_config        FROM anon;
REVOKE ALL ON public.clients_directory FROM anon;

-- 2. Eliminar políticas permisivas heredadas
DROP POLICY IF EXISTS "Permitir todo a usuarios anon en stays"              ON public.stays;
DROP POLICY IF EXISTS "Permitir todo a usuarios anon en historical_stays"   ON public.historical_stays;
DROP POLICY IF EXISTS "Permitir todo a usuarios anon en app_config"         ON public.app_config;
DROP POLICY IF EXISTS "Permitir todo a usuarios anon en clients_directory"  ON public.clients_directory;

-- 3. Crear políticas que exigen estar autenticado Y ser el dueño
--    Reemplazar '00000000-0000-0000-0000-000000000000' con el UUID real.

CREATE POLICY "Solo el dueño puede operar stays"
  ON public.stays FOR ALL TO authenticated
  USING      ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

CREATE POLICY "Solo el dueño puede operar historical_stays"
  ON public.historical_stays FOR ALL TO authenticated
  USING      ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

CREATE POLICY "Solo el dueño puede operar app_config"
  ON public.app_config FOR ALL TO authenticated
  USING      ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

CREATE POLICY "Solo el dueño puede operar clients_directory"
  ON public.clients_directory FOR ALL TO authenticated
  USING      ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid)
  WITH CHECK ((SELECT auth.uid()) = '00000000-0000-0000-0000-000000000000'::uuid);

-- 4. Agregar columna usd_rate que faltaba en app_config
ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS usd_rate NUMERIC DEFAULT 1700;
