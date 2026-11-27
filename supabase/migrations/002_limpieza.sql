-- Migración 002: Limpieza de duplicados en agenda
-- Ejecutar SOLO después de 001_auth_rls.sql y verificar en staging primero
-- Los ids que empiezan con 'hist-agenda-' son los registros importados desde el HTML de agenda

-- Pasos 1 y 2: borrado puntual de duplicados (ejemplo con nombres ficticios; se hizo a mano y NO se ejecuta).
-- 1. Eliminar estadías duplicadas de Tobías (17/10 - 21/10) importadas desde agenda HTML
-- DELETE FROM public.stays
-- WHERE id LIKE 'hist-agenda-%'
--   AND dog_name ILIKE '%tobias%'
--   AND from_day = '17/10'
--   AND until_day = '21/10';

-- 2. Eliminar estadías duplicadas de Zeus (22/10 - 26/10) importadas desde agenda HTML
-- DELETE FROM public.stays
-- WHERE id LIKE 'hist-agenda-%'
--   AND dog_name ILIKE '%zeus%'
--   AND from_day = '22/10'
--   AND until_day = '26/10';

-- 3. Agregar año a from_day y until_day donde solo tienen día/mes (formato DD/MM sin año)
-- ATENCIÓN: ajustar el año (2024 o 2025) según corresponda antes de ejecutar
UPDATE public.stays
SET
  from_day  = EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
              LPAD(SPLIT_PART(from_day, '/', 2), 2, '0') || '-' ||
              LPAD(SPLIT_PART(from_day, '/', 1), 2, '0'),
  until_day = EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
              LPAD(SPLIT_PART(until_day, '/', 2), 2, '0') || '-' ||
              LPAD(SPLIT_PART(until_day, '/', 1), 2, '0')
WHERE from_day ~ '^\d{1,2}/\d{1,2}$'
  AND until_day ~ '^\d{1,2}/\d{1,2}$';
