-- Migración 003: Agregar dz_rate y dog_id a stays e historical_stays
-- Ejecutar SOLO después de 002_limpieza.sql y verificar en staging primero
-- NO ejecutar en producción sin revisar primero los datos existentes

-- 1. Agregar dz_rate a stays (porcentaje de deducción guardado por estadía)
ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS dz_rate numeric(5,4) DEFAULT 0.18;

-- Poblar con el valor actual de config para estadías existentes
UPDATE public.stays
SET dz_rate = 0.18
WHERE dz_rate IS NULL;

-- 2. Agregar dog_id a stays (referencia al perro en directorio)
ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS dog_id text;

-- 3. Agregar dz_rate a historical_stays
ALTER TABLE public.historical_stays
  ADD COLUMN IF NOT EXISTS dz_rate numeric(5,4) DEFAULT 0.18;

UPDATE public.historical_stays
SET dz_rate = 0.18
WHERE dz_rate IS NULL;

-- 4. Agregar dog_id a historical_stays
ALTER TABLE public.historical_stays
  ADD COLUMN IF NOT EXISTS dog_id text;

-- Nota: el índice de dog_id se agrega solo cuando se empiece a usar la vinculación
-- CREATE INDEX IF NOT EXISTS idx_stays_dog_id ON public.stays(dog_id);
-- CREATE INDEX IF NOT EXISTS idx_historical_stays_dog_id ON public.historical_stays(dog_id);
