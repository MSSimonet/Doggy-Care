-- Migración 004: monto de deducción ya transferido (dz_transferred_amount)
-- Preparada, NO ejecutada. Revisar antes de correr en el SQL Editor de Supabase.
-- Ver docs/calculos.md, sección "Reglas actuales".
--
-- Hasta ahora la deducción transferida era un tilde sí/no (dz_transferred).
-- Con el nuevo cálculo la deducción se genera sobre lo cobrado, y si se cobra
-- más después de transferir, la diferencia vuelve a quedar pendiente. Para eso
-- hace falta guardar cuánto se transfirió.
--
-- La app ya funciona sin esta columna: si no existe, guarda sin el monto y
-- avisa; un registro tildado sin monto se toma como transferido por completo.

-- =============================================================
-- PASO 1: agregar la columna (seguro, no cambia datos existentes)
-- =============================================================

ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS dz_transferred_amount numeric DEFAULT 0;

ALTER TABLE public.historical_stays
  ADD COLUMN IF NOT EXISTS dz_transferred_amount numeric DEFAULT 0;

-- =============================================================
-- PASO 2 (opcional, aparte): completar el monto en los registros viejos
-- que ya tienen el tilde de transferida. Está comentado a propósito.
-- Correrlo sólo después de revisar el resultado del SELECT de control.
-- =============================================================

-- Total = días × tarifa + baño + gastos (días = hasta - desde + 1, como en la app).
-- Deducción generada = dz_rate × mínimo(cobrado, total): lo cobrado de más no genera deducción.
-- Si dz_rate está vacío (migración 003 sin correr), se usa 0.18; si en Ajustes
-- hay otro porcentaje, cambiar el 0.18 por ese valor antes de correrlo.
-- Las fechas de stays tienen que estar como AAAA-MM-DD (así las guarda la app);
-- si alguna no lo está, el SELECT de control da error y no se toca nada.

-- Control: cuántos registros se tocarían y con qué montos
-- SELECT id, dog_name, dz_rate, money_advance, amount_paid,
--        ROUND(COALESCE(dz_rate, 0.18) * LEAST(
--          COALESCE(money_advance, 0) + COALESCE(amount_paid, 0),
--          (until_day::date - from_day::date + 1) * COALESCE(daily_rate, 0) + COALESCE(bath, 0) + COALESCE(expenses, 0)
--        )) AS monto_nuevo
--   FROM public.stays
--  WHERE dz_transferred = true AND COALESCE(dz_transferred_amount, 0) = 0;

-- Estadías activas
-- UPDATE public.stays
--    SET dz_transferred_amount = ROUND(COALESCE(dz_rate, 0.18) * LEAST(
--          COALESCE(money_advance, 0) + COALESCE(amount_paid, 0),
--          (until_day::date - from_day::date + 1) * COALESCE(daily_rate, 0) + COALESCE(bath, 0) + COALESCE(expenses, 0)
--        ))
--  WHERE dz_transferred = true
--    AND COALESCE(dz_transferred_amount, 0) = 0;

-- Historial: no guarda lo cobrado (ni el adelanto ni "ya cobrado"), sólo la
-- deducción calculada al cerrar la estadía en la columna dz. Se toma ese valor
-- para no cambiar el estado de las estadías viejas: las tildadas siguen
-- transferidas por completo y las no tildadas siguen pendientes.
-- UPDATE public.historical_stays
--    SET dz_transferred_amount = COALESCE(dz, 0)
--  WHERE dz_transferred = true
--    AND COALESCE(dz_transferred_amount, 0) = 0;
