// Respaldo completo: las 4 tablas en un archivo JSON. Sólo lee; nunca escribe en la base.

export const TABLAS_RESPALDO = ['stays', 'historical_stays', 'app_config', 'clients_directory'] as const;
export type TablaRespaldo = (typeof TABLAS_RESPALDO)[number];

export type LecturaTabla = { data: unknown[] | null; error: { message: string } | null };
export type LectorTabla = (tabla: TablaRespaldo) => Promise<LecturaTabla>;

export type Respaldo = {
  app: 'Doggy-Care';
  version: 1;
  generado: string; // ISO
  conteo: Record<TablaRespaldo, number>;
  tablas: Record<TablaRespaldo, unknown[]>;
};

export type ResultadoRespaldo =
  | { ok: true; nombre: string; contenido: string; total: number; conteo: Record<TablaRespaldo, number> }
  | { ok: false; error: string };

const dos = (n: number) => String(n).padStart(2, '0');

/** doggy-care-respaldo-2026-11-01-0930.json (fecha y hora locales) */
export function nombreRespaldo(ahora: Date): string {
  const fecha = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
  return `doggy-care-respaldo-${fecha}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}.json`;
}

/**
 * Lee las 4 tablas. Si alguna falla no se arma el archivo: un respaldo incompleto
 * que parece completo es peor que ninguno. Devuelve el mensaje real del error.
 */
export async function armarRespaldo(leer: LectorTabla, ahora = new Date()): Promise<ResultadoRespaldo> {
  const lecturas = await Promise.all(TABLAS_RESPALDO.map(async t => [t, await leer(t)] as const));
  const fallidas = lecturas.filter(([, r]) => r.error);
  if (fallidas.length > 0) {
    return {
      ok: false,
      error: fallidas.map(([t, r]) => `${t}: ${r.error!.message}`).join(' · ')
    };
  }
  const tablas = Object.fromEntries(lecturas.map(([t, r]) => [t, r.data ?? []])) as Record<TablaRespaldo, unknown[]>;
  const conteo = Object.fromEntries(TABLAS_RESPALDO.map(t => [t, tablas[t].length])) as Record<TablaRespaldo, number>;
  const respaldo: Respaldo = { app: 'Doggy-Care', version: 1, generado: ahora.toISOString(), conteo, tablas };
  return {
    ok: true,
    nombre: nombreRespaldo(ahora),
    contenido: JSON.stringify(respaldo, null, 2),
    total: Object.values(conteo).reduce((a, b) => a + b, 0),
    conteo
  };
}

/** Baja el archivo en el navegador (o en el WebView del APK). */
export function descargarArchivo(nombre: string, contenido: string, tipo = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
