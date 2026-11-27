// Modo privacidad: oculta datos personales de la pantalla (para compartir pantalla o hacer demos).
// Enmascara con un texto fijo: no deja dígitos, letras ni largo del dato original, y no sirve de nada
// inspeccionar el DOM (title, href, texto para lectores de pantalla).

export const PRIVACY_STORAGE_KEY = 'pensionados_privacy_mode';

export type DatoPrivado = 'telefono' | 'direccion' | 'familiares' | 'dueno';

export const MASCARAS: Record<DatoPrivado, string> = {
  telefono: '•••• ••••••',
  direccion: 'Dirección oculta',
  familiares: 'Familiares ocultos',
  dueno: 'Dueño/a oculto/a'
};

export function loadPrivacyMode(): boolean {
  try {
    return localStorage.getItem(PRIVACY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function savePrivacyMode(activo: boolean): void {
  try {
    if (activo) localStorage.setItem(PRIVACY_STORAGE_KEY, '1');
    else localStorage.removeItem(PRIVACY_STORAGE_KEY);
  } catch {
    // sin almacenamiento disponible: el modo vale sólo para esta sesión
  }
}

/** Con el modo activo devuelve la máscara; un dato vacío se deja vacío para que la pantalla muestre su "Sin registrar". */
export function enmascarar(tipo: DatoPrivado, valor: string | null | undefined, activo: boolean): string {
  if (!activo) return valor ?? '';
  if (!valor || !valor.trim()) return '';
  return MASCARAS[tipo];
}
