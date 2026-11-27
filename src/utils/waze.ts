import type { Stay } from '../types';
import type { ClientProfile } from '../data/clientsDirectory';
import { normalizeDogName } from '../data/historialData';

/**
 * Normaliza una dirección y genera el Deep Link oficial de Waze
 * con `navigate=yes` para iniciar automáticamente la mejor ruta disponible.
 */
export function buildWazeNavigationUrl(rawAddress: string, isCapital?: boolean): string {
  const cleaned = rawAddress
    .replace(/^direcci[oó]n:\s*/i, '')
    .trim();

  if (!cleaned) return '';

  const lower = cleaned.toLowerCase();
  let query = cleaned;

  if (!lower.includes('argentina')) {
    const hasCaba = /\bcaba\b/i.test(cleaned) || lower.includes('capital federal') || lower.includes('ciudad autónoma') || lower.includes('ciudad autonoma');
    if (isCapital && !hasCaba && !lower.includes('buenos aires')) {
      query = `${cleaned}, CABA, Argentina`;
    } else {
      query = `${cleaned}, Argentina`;
    }
  }

  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

/**
 * Obtiene la dirección de destino para una estadía buscando primero en el
 * directorio de clientes (por dogId o nombre normalizado) y luego en `notes`.
 */
export function resolveStayAddress(stay: Stay, directoryClients: ClientProfile[]): string | undefined {
  const normStayName = normalizeDogName(stay.dogName);
  const match = directoryClients.find(
    c => (stay.dogId && c.id === stay.dogId) || (!stay.dogId && normalizeDogName(c.dogName) === normStayName)
  ) || directoryClients.find(c => normalizeDogName(c.dogName) === normStayName);

  const dirAddress = match?.address?.trim();
  if (dirAddress) return dirAddress;

  if (stay.notes) {
    const notesMatch = stay.notes.match(/Direcci[oó]n:\s*([^|\n]+)/i);
    const extracted = notesMatch?.[1]?.trim();
    if (extracted) return extracted;
  }

  return undefined;
}
