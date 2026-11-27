// Tasa de deducción por año (el de la fecha de FIN de la estadía) y fecha de inicio de deducciones.
// Los valores viven en la configuración (Ajustes); acá sólo están los de por defecto.
import type { AppConfig } from '../types';

/** 2026 → 18 %, 2027 → 19 %. Años posteriores usan la última definida. */
export const TASAS_POR_AÑO_DEFECTO: Record<string, number> = { '2026': 0.18, '2027': 0.19 };
/** Registros que terminan antes de esta fecha se consideran resueltos (no entran en pendientes). */
export const INICIO_DEDUCCIONES_DEFECTO = '2026-01-01';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Configuración con los campos nuevos completos (las guardadas antes no los tienen). */
export function completarConfig(config: AppConfig): AppConfig {
  const tabla = config.dzRatesByYear && Object.keys(config.dzRatesByYear).length ? config.dzRatesByYear : TASAS_POR_AÑO_DEFECTO;
  const inicio = config.dzStartDate && ISO.test(config.dzStartDate) ? config.dzStartDate : INICIO_DEDUCCIONES_DEFECTO;
  if (tabla === config.dzRatesByYear && inicio === config.dzStartDate) return config;
  return { ...config, dzRatesByYear: tabla, dzStartDate: inicio };
}

/** Tasa de un año: la del año; si no está, la del último año anterior definido; si es anterior a todos, la del primero. */
export function tasaPorAño(año: number, tabla: Record<string, number> | undefined): number | undefined {
  if (!tabla) return undefined;
  const años = Object.keys(tabla)
    .map(Number)
    .filter(a => Number.isInteger(a) && Number.isFinite(tabla[String(a)]))
    .sort((a, b) => a - b);
  if (!años.length) return undefined;
  const anteriores = años.filter(a => a <= año);
  const elegido = anteriores.length ? anteriores[anteriores.length - 1] : años[0];
  return tabla[String(elegido)];
}

/** Tasa para una estadía según el año de su fecha de fin ("AAAA-MM-DD"). undefined si no hay tabla o fecha. */
export function tasaParaFin(fin: string | undefined, config: Pick<AppConfig, 'dzRatesByYear'>): number | undefined {
  if (!fin || !ISO.test(fin)) return undefined;
  return tasaPorAño(Number(fin.slice(0, 4)), config.dzRatesByYear);
}
