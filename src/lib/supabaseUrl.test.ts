import { describe, it, expect } from 'vitest';
import { normalizeSupabaseUrl, SUPABASE_URL_INVALID_MESSAGE } from './supabase';

describe('normalizeSupabaseUrl', () => {
  it('deja una URL correcta igual', () => {
    expect(normalizeSupabaseUrl('https://abcd.supabase.co')).toEqual({ url: 'https://abcd.supabase.co', error: null });
  });

  it('quita la ruta /rest/v1/ que rompía el ingreso', () => {
    expect(normalizeSupabaseUrl('https://abcd.supabase.co/rest/v1/').url).toBe('https://abcd.supabase.co');
  });

  it('quita barra final, consulta y espacios', () => {
    expect(normalizeSupabaseUrl('  https://abcd.supabase.co/?x=1  ').url).toBe('https://abcd.supabase.co');
  });

  it('vacía o de ejemplo cuenta como sin configurar, sin error', () => {
    expect(normalizeSupabaseUrl('')).toEqual({ url: null, error: null });
    expect(normalizeSupabaseUrl(undefined)).toEqual({ url: null, error: null });
    expect(normalizeSupabaseUrl('https://tu-proyecto.supabase.co')).toEqual({ url: null, error: null });
  });

  it('texto que no es URL da el aviso', () => {
    expect(normalizeSupabaseUrl('abcd.supabase.co')).toEqual({ url: null, error: SUPABASE_URL_INVALID_MESSAGE });
    expect(normalizeSupabaseUrl('no es una url')).toEqual({ url: null, error: SUPABASE_URL_INVALID_MESSAGE });
  });

  it('rechaza http sin cifrar', () => {
    expect(normalizeSupabaseUrl('http://abcd.supabase.co').error).toBe(SUPABASE_URL_INVALID_MESSAGE);
  });

  it('el aviso menciona docs/despliegue.md', () => {
    expect(SUPABASE_URL_INVALID_MESSAGE).toBe('La dirección de la base de datos no es válida (ver docs/despliegue.md)');
  });
});
