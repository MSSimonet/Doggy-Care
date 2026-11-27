// Número con la palabra en singular o plural: "1 día", "2 días", "0 estadías".
export function cantidad(n: number, singular: string, plural: string): string {
  const valor = Number.isFinite(n) ? n : 0;
  return `${valor.toLocaleString('es-AR')} ${valor === 1 ? singular : plural}`;
}

export const dias = (n: number) => cantidad(n, 'día', 'días');
export const estadias = (n: number) => cantidad(n, 'estadía', 'estadías');
