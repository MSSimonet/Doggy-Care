// Cambiar la dirección de un perro: su ficha del directorio y las notas de sus estadías ("Dirección: …").
import type { Stay } from '../types';
import type { ClientProfile } from '../data/clientsDirectory';
import { normalizeDogName } from '../data/historialData';

const NOTA_DIRECCION = /Direcci[oó]n:\s*[^|\n]*/i;

/** ¿La ficha es de este perro? (por id si la estadía lo tiene; si no, por nombre sin tildes ni mayúsculas) */
function esFichaDe(c: ClientProfile, dogName: string, dogId?: string): boolean {
  return (dogId !== undefined && c.id === dogId) || normalizeDogName(c.dogName) === normalizeDogName(dogName);
}

/** Notas de una estadía con la dirección nueva (si tenían una). Sin dirección nueva, se quita esa parte. */
export function notasConDireccion(notas: string | undefined, direccion: string): string | undefined {
  if (!notas || !NOTA_DIRECCION.test(notas)) return notas;
  if (direccion) return notas.replace(NOTA_DIRECCION, `Dirección: ${direccion} `).replace(/\s+\|/g, ' |').trim();
  return notas.replace(NOTA_DIRECCION, '').replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').trim() || undefined;
}

export interface CambioDireccion {
  /** ficha a guardar (existente actualizada, o nueva si el perro no tenía) */
  ficha: ClientProfile;
  esNueva: boolean;
  /** estadías cuyas notas cambiaron */
  estadias: Stay[];
}

/** Calcula qué cambia al poner `direccion` a un perro. No modifica las listas recibidas. */
export function cambiarDireccion(opciones: {
  dogName: string;
  dogId?: string;
  direccion: string;
  fichas: ClientProfile[];
  estadias: Stay[];
  nuevoId?: () => string;
}): CambioDireccion {
  const { dogName, dogId, direccion, fichas, estadias } = opciones;
  const existente = fichas.find(c => dogId !== undefined && c.id === dogId) ?? fichas.find(c => esFichaDe(c, dogName));
  const deEstePerro = estadias.filter(s => (dogId !== undefined && s.dogId === dogId) || normalizeDogName(s.dogName) === normalizeDogName(dogName));
  const conDatos = deEstePerro[0];
  const ficha: ClientProfile = existente
    ? { ...existente, address: direccion || undefined }
    : {
        id: (opciones.nuevoId ?? (() => `client-${Date.now()}`))(),
        dogName: dogName.trim(),
        breed: conDatos?.dogBreed || undefined,
        ownerName: conDatos?.clientName || '',
        contact: conDatos?.clientPhone || undefined,
        address: direccion || undefined
      };
  const cambiadas = deEstePerro
    .map(s => ({ s, notas: notasConDireccion(s.notes, direccion) }))
    .filter(({ s, notas }) => notas !== s.notes)
    .map(({ s, notas }) => ({ ...s, notes: notas }));
  return { ficha, esNueva: !existente, estadias: cambiadas };
}
