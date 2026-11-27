# Cálculos de cada estadía

## Cómo era antes

Relevado sobre `main` en el commit `22a2004`, antes de cambiar nada. Las líneas son de ese commit.

| Concepto | Dónde | Cómo se calculaba |
|---|---|---|
| Días | `src/App.tsx:2812-2825` (`handleDateChange`) | `(hasta - desde) + 1`, solo dentro del formulario. El campo "Días" es de solo lectura (`src/App.tsx:3260-3265`). `calculateStay` no miraba las fechas: usaba el número guardado en `stay.days` (`src/utils/calculations.ts:17`). |
| Total | `src/utils/calculations.ts:18` | `totalGross = días × tarifa diaria`. No incluía baño ni gastos. |
| Adelanto (`moneyAdvance`) | `src/utils/calculations.ts:60` | Se **restaba** de lo que debía el cliente, igual que un pago. En el formulario decía "Adelantos ($)" (`src/App.tsx:3419`). También se restaba en `extrasBalance` (`src/utils/calculations.ts:57`), un valor que no se muestra. |
| Ya cobrado (`amountPaid`) | `src/utils/calculations.ts:60` | Se restaba de lo que debía el cliente. Formulario: "Ya Cobrado ($)" (`src/App.tsx:3444`). |
| Falta cobrar | `src/utils/calculations.ts:60` | `totalAdeudado = máx(0, total + gastos + baño - adelanto - ya cobrado)`. Si el cliente pagaba de más, quedaba en 0 y el sobrante no se veía. Se mostraba como "Adeuda" (`src/App.tsx:1333-1335`), "Saldo" (`src/App.tsx:1665-1667`, `1909`) y "Saldo Adeudado" (`src/App.tsx:3467-3469`). |
| Deducción | `src/utils/calculations.ts:20-21` | `dzAmount = total × porcentaje`, **sobre el total**, no sobre lo cobrado, y sin baño ni gastos. El porcentaje es el de la estadía (`stay.dzRate`) o, si no tiene, el de Ajustes (`config.dzRate`, 18 %). |
| Porcentaje por estadía | `src/App.tsx:2948`; `src/lib/supabase.ts:65-89` y `100-123` | El formulario guarda `dzRate` en la estadía, pero la lectura y el guardado en Supabase no incluyen `dz_rate`: en la nube el porcentaje por estadía se pierde y vuelve al de Ajustes. |
| `dz_transferred` | `src/App.tsx:923-932`, `934-949`, `951-973` | Un tilde sí/no. Si estaba tildado, la deducción entera se daba por transferida aunque después se cobrara más. "Marcar todas" ponía el tilde en todas, de la agenda y del historial. |
| Deducciones pendientes | `src/App.tsx:738-756` | Suma de `dzAmount` (agenda) y `dz` (registro de estadías) de todo lo que no tenía el tilde. |
| Paso al registro de estadías | `src/App.tsx:887-910` | Guarda `dz = dzAmount` (sobre el total), `neto = netArs`, `fuel = costo del traslado` y copia el tilde. |
| Km del traslado | `src/utils/calculations.ts:24-26` | Capital: `defaultCapitalKm` (90). Fuera de Capital: los km cargados, pero si eran 0 o no había, también 90. El formulario no deja poner 0 (`min="1"`, `src/App.tsx:3383`) y al editar convierte 0 en 90 (`src/App.tsx:2729`). En Supabase, 0 se guarda como vacío (`src/lib/supabase.ts:111`). |
| Costo del traslado por km | `src/utils/calculations.ts:29-32` | `costo = km ÷ rendimiento × precio de la nafta`, con los dos valores de Ajustes (`fuelConsumptionKmPerLiter` 8,64 km/l y `fuelPricePerLiter` $2.200). Costo por km = 2.200 ÷ 8,64 = **$254,63**. Por ejemplo, 90 km = $22.917. |
| Neto | `src/utils/calculations.ts:35`, `41` | `netArs = total - deducción - transporte base`, donde transporte base = 16 l × precio de la nafta = **$35.200 fijos**, sean 0, 90 o 150 km. El costo por km se calculaba pero **no se restaba**: solo aparecía en el CSV (`src/App.tsx:1021`) y en el campo `fuel` del historial. |
| US$ | `src/utils/calculations.ts:44-45` | `netUsd = redondeo(netArs ÷ cotización)`. |

En resumen, los problemas eran:

1. El adelanto y lo cobrado restaban lo que faltaba cobrar, pero la deducción no dependía de lo cobrado.
2. Un tilde transferido no se enteraba de cobros posteriores.
3. El neto restaba un traslado fijo en vez de los km reales.
4. El pago de más desaparecía.

## Reglas actuales

Todo se calcula en `src/utils/calculations.ts` (`calculateStay`) y se prueba en `src/utils/calculations.test.ts`. Los ejemplos usan los valores de Ajustes por defecto: deducción 18 %, nafta $2.200 el litro, rendimiento 8,64 km por litro, Capital 90 km y dólar a $1.700.

### 1. Días

**Días = (hasta − desde) + 1.** Cuentan el día de llegada y el de salida. El cálculo usa las fechas, no un número guardado aparte.

> Llega el 1/10 y se va el 5/10: (5 − 1) + 1 = **5 días**. Del 30/10 al 3/11 también son 5.

### 2. Total, cobrado y lo que falta

- **Total** = días × tarifa + baño + gastos. La propina no suma.
- **Seña o adelanto** es plata que el cliente ya dio, al retirar la mascota o para reservar. Cuenta como cobrada.
- **Cobrado** = seña o adelanto + ya cobrado.
- **Falta cobrar** = total − cobrado. Nunca es negativo: si el cliente pagó de más, la app muestra **"A favor del cliente: $X"**.

> 5 días a $20.000 = total **$100.000**. Dejó una seña de $30.000 y después pagó $20.000: cobrado = **$50.000**, falta cobrar = **$50.000**.
>
> Si en cambio pagó $20.000 de seña y $100.000 al retirar: cobrado = $120.000, falta cobrar = **$0** y **a favor del cliente $20.000**.

### 3. Deducción

- **Deducción generada** = porcentaje × mínimo(cobrado, total). Se genera sobre lo que entró, hasta el total: lo cobrado de más no genera deducción.
- **Porcentaje** = el guardado en la estadía (`dz_rate`); si viene vacío, el de Ajustes.
- **Transferida** es el monto ya transferido (`dz_transferred_amount`). Al tildar "Transferida", pasa a ser igual a la deducción generada en ese momento.
- **Por transferir** = generada − transferida.
- Si después se cobra más, la diferencia vuelve a aparecer como pendiente.
- Una estadía que pasa al Registro de estadías sin transferir sigue sumando en **Cobros > Deducciones por transferir**.
- "Marcar todas" transfiere la diferencia de cada estadía pendiente.
- El tilde no se puede marcar mientras no haya nada cobrado.

> Cobrado $50.000 → generada 18 % × 50.000 = **$9.000**. Se tilda "Transferida": transferida $9.000, por transferir **$0**.
>
> Después cobra $30.000 más → cobrado $80.000, generada **$14.400**, transferida $9.000, por transferir **$5.400**.
>
> Total $100.000 y cobrado $120.000 → generada 18 % × 100.000 = **$18.000**, no $21.600. Si ya se habían transferido $9.000, quedan **$9.000** por transferir y **$20.000 a favor del cliente**.

### 4. Traslado

- **Costo por km** = precio de la nafta ÷ rendimiento, los dos de Ajustes. Es la misma fuente que antes (`src/utils/calculations.ts`, ver "Cómo era antes"): 2.200 ÷ 8,64 = **$254,63 por km**.
- **Costo del traslado** = km × costo por km. Los km siempre restan.
- En Capital se usan los km fijos de Ajustes (90). Fuera de Capital se usan los km cargados, y **0 km vale 0**: antes se convertía en 90.

> 90 km × $254,63 = **$22.917**. 120 km = $30.556. 0 km = $0.

### 5. Lo que te queda

- **Te queda** = total − porcentaje × total − costo del traslado. Es lo que te quedaría con todo cobrado.
- **Te queda hasta ahora** = mínimo(cobrado, total) − deducción generada − costo del traslado. Es lo que te queda con lo que ya entró, y puede ser negativo si todavía no cobraste nada. Lo que está a favor del cliente no cuenta: con todo cobrado, o cobrado de más, es igual a "Te queda".
- **US$** = Te queda ÷ cotización, redondeado.

> Total $100.000, cobrado $50.000, Capital 90 km:
>
> - Te queda = 100.000 − 18.000 − 22.917 = **$59.083** (US$ 35).
> - Te queda hasta ahora = 50.000 − 9.000 − 22.917 = **$18.083**.
>
> Si en cambio se cobraron $120.000: Te queda hasta ahora = mínimo(120.000, 100.000) − 18.000 − 22.917 = **$59.083**, igual que "Te queda". Los $20.000 de más quedan como "A favor del cliente".

### 6. Registro de estadías (historial viejo)

Las estadías del Registro de estadías no cambian de estado:

- Las tildadas como transferidas siguen así, aunque no tengan monto guardado: un tilde sin monto se toma como transferido por completo.
- Las no tildadas siguen pendientes por su deducción guardada (`dz`).

Cobros muestra cuántas quedan con deducción pendiente en el recuadro "Registro de estadías". La migración `supabase/migrations/004_dz_transferred_amount.sql` está preparada y **no se ejecutó**: agrega la columna y trae comentado el `UPDATE` que completa el monto de las tildadas.

### Baño y gastos

Baño y gastos son **precios que se cobran al cliente**, no reintegros: se suman al total a pagar.

- **Total** = días × tarifa + baño + gastos.
- Por eso entran en la base de la deducción: la deducción generada es porcentaje × mínimo(cobrado, total), y "Te queda" resta el porcentaje sobre ese total.

> 5 días × $20.000 + baño $3.000 + gastos $2.000 = total **$105.000**. Con todo cobrado, la deducción es 18 % × 105.000 = **$18.900**.

Decidido así por el dueño; el código ya lo calcula de esta forma.

### Decisiones y puntos abiertos

- **Baño y gastos**: ver la sección "Baño y gastos". Son precios del total y entran en la deducción.
- **Porcentaje por estadía**: ahora se guarda y se lee en la columna `dz_rate` de `stays` y `historical_stays`, junto con `dog_id` (`src/lib/mapeoDb.ts`, probado en `src/lib/mapeoDb.test.ts`). Si viene vacío se usa el de Ajustes. Esas columnas son de la migración 003: si todavía no está corrida, la app guarda sin ellas y avisa "faltan las columnas dz_rate y dog_id (migración 003)".
- **Te queda hasta ahora con pago de más**: usa mínimo(cobrado, total), así que lo que está a favor del cliente no cuenta. En Coco da $59.083, igual que "Te queda" (antes de este cambio daba $79.083).
- **Sin la migración 004**: la app guarda igual, sin el monto, y avisa "falta la columna dz_transferred_amount (migración 004)". En ese caso, un cobro posterior a la transferencia no se puede volver a mostrar como pendiente después de recargar.

## Antes y después (modo demo)

Son las 5 estadías de `src/data/demoData.ts`, con hoy = 31/10/2026. "Antes" es el cálculo de `main` (`22a2004`) y "Después" es el de esta rama.

| Estadía | Concepto | Antes | Después |
|---|---|---|---|
| Firulais: 8 días × $24.000 + baño $2.000; seña $50.000, ya cobrado $50.000; Capital 90 km | Total | $192.000 | $194.000 |
| | Cobrado | — | $100.000 |
| | Falta cobrar | $94.000 | $94.000 |
| | Deducción | $34.560 (sobre el total) | $18.000 generada |
| | Deducción por transferir | $34.560 | $18.000 |
| | Traslado restado | $35.200 (16 l fijos) | $22.917 (90 km) |
| | Neto / Te queda | $122.240 | $136.163 |
| | Te queda hasta ahora | — | $59.083 |
| | US$ | US$ 72 | US$ 80 |
| Max: 1 días × $22.000; seña $0, ya cobrado $0; Capital 90 km | Total | $22.000 | $22.000 |
| | Cobrado | — | $0 |
| | Falta cobrar | $22.000 | $22.000 |
| | Deducción | $3.960 (sobre el total) | $0 generada |
| | Deducción por transferir | $3.960 | $0 |
| | Traslado restado | $35.200 (16 l fijos) | $22.917 (90 km) |
| | Neto / Te queda | $-17.160 | $-4.877 |
| | Te queda hasta ahora | — | $-22.917 |
| | US$ | US$ -10 | US$ -3 |
| Luna: 5 días × $20.000 + gastos $500; seña $0, ya cobrado $100.000; 120 km; tildada | Total | $100.000 | $100.500 |
| | Cobrado | — | $100.000 |
| | Falta cobrar | $500 | $500 |
| | Deducción | $18.000 (sobre el total) | $18.000 generada |
| | Deducción por transferir | $0 | $0 |
| | Traslado restado | $35.200 (16 l fijos) | $30.556 (120 km) |
| | Neto / Te queda | $46.800 | $51.854 |
| | Te queda hasta ahora | — | $51.444 |
| | US$ | US$ 28 | US$ 31 |
| Tony: 5 días × $23.000; seña $30.000, ya cobrado $0; 0 km | Total | $115.000 | $115.000 |
| | Cobrado | — | $30.000 |
| | Falta cobrar | $85.000 | $85.000 |
| | Deducción | $20.700 (sobre el total) | $5.400 generada |
| | Deducción por transferir | $20.700 | $5.400 |
| | Traslado restado | $35.200 (16 l fijos) | $0 (0 km) |
| | Neto / Te queda | $59.100 | $94.300 |
| | Te queda hasta ahora | — | $24.600 |
| | US$ | US$ 35 | US$ 55 |
| Coco: 5 días × $20.000; seña $20.000, ya cobrado $100.000; Capital 90 km; tildada ($9.000) | Total | $100.000 | $100.000 |
| | Cobrado | — | $120.000 |
| | Falta cobrar | $0 | $0 (a favor del cliente $20.000) |
| | Deducción | $18.000 (sobre el total) | $18.000 generada |
| | Deducción por transferir | $0 | $9.000 |
| | Traslado restado | $35.200 (16 l fijos) | $22.917 (90 km) |
| | Neto / Te queda | $46.800 | $59.083 |
| | Te queda hasta ahora | — | $59.083 |
| | US$ | US$ 28 | US$ 35 |
