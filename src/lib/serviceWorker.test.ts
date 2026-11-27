import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Se carga public/sw.js tal cual lo carga el navegador, con un `self` simulado,
// y se mira qué pedidos intercepta.

const ORIGEN = 'https://doggy-care.example.com';
const codigo = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

type Oyente = (event: any) => void;
let oyentes: Record<string, Oyente>;

function cargarSw() {
  oyentes = {};
  const self = {
    location: { origin: ORIGEN },
    addEventListener: (tipo: string, fn: Oyente) => { oyentes[tipo] = fn; },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() }
  };
  const respuesta = { ok: true, clone() { return this; } };
  const cache = { put: vi.fn(), addAll: vi.fn(() => Promise.resolve()) };
  const caches = {
    match: vi.fn(() => Promise.resolve(undefined)),
    open: vi.fn(() => Promise.resolve(cache)),
    keys: vi.fn(() => Promise.resolve([])),
    delete: vi.fn()
  };
  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', codigo)(self, caches, vi.fn(() => Promise.resolve(respuesta)));
}

function pedido(url: string, { method = 'GET', mode = 'cors', auth = '' } = {}) {
  return {
    url,
    method,
    mode,
    headers: { get: (h: string) => (h === 'Authorization' && auth ? auth : null) }
  };
}

function intercepta(req: ReturnType<typeof pedido>): boolean {
  const respondWith = vi.fn();
  oyentes.fetch({ request: req, respondWith });
  return respondWith.mock.calls.length > 0;
}

beforeEach(cargarSw);

describe('service worker: sólo la carcasa de la app', () => {
  it('registra install, activate y fetch', () => {
    expect(Object.keys(oyentes).sort()).toEqual(['activate', 'fetch', 'install']);
  });

  it('nunca intercepta Supabase (datos ni ingreso)', () => {
    expect(intercepta(pedido('https://abcdefgh.supabase.co/rest/v1/stays?select=*'))).toBe(false);
    expect(intercepta(pedido('https://abcdefgh.supabase.co/auth/v1/token?grant_type=password', { method: 'POST' }))).toBe(false);
    expect(intercepta(pedido('https://abcdefgh.supabase.co/rest/v1/clients_directory', { auth: 'Bearer x' }))).toBe(false);
  });

  it('no intercepta otros dominios (fuentes de Google)', () => {
    expect(intercepta(pedido('https://fonts.googleapis.com/css2?family=Atkinson'))).toBe(false);
  });

  it('no intercepta pedidos que no son GET ni con credenciales, aunque sean del propio sitio', () => {
    expect(intercepta(pedido(`${ORIGEN}/assets/index.js`, { method: 'POST' }))).toBe(false);
    expect(intercepta(pedido(`${ORIGEN}/assets/index.js`, { auth: 'Bearer x' }))).toBe(false);
  });

  it('sí maneja la carcasa: páginas, JS/CSS, íconos y manifest del propio sitio', () => {
    expect(intercepta(pedido(`${ORIGEN}/`, { mode: 'navigate' }))).toBe(true);
    expect(intercepta(pedido(`${ORIGEN}/assets/index-CWMPUEtE.js`))).toBe(true);
    expect(intercepta(pedido(`${ORIGEN}/icons/icon-192.png`))).toBe(true);
    expect(intercepta(pedido(`${ORIGEN}/manifest.webmanifest`))).toBe(true);
  });

  it('no guarda otras rutas del propio sitio que no sean la carcasa', () => {
    expect(intercepta(pedido(`${ORIGEN}/api/algo`))).toBe(false);
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../public/manifest.webmanifest'), 'utf8'));

  it('nombre, colores y modo de app instalable', () => {
    expect(manifest.name).toBe('Doggy Care');
    expect(manifest.short_name).toBe('Doggy Care');
    expect(manifest.background_color).toBe('#222A37');
    expect(manifest.theme_color).toBe('#ffffff');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
  });

  it('íconos de 192 y 512 y uno enmascarable', () => {
    const tam = manifest.icons.map((i: any) => i.sizes);
    expect(tam).toContain('192x192');
    expect(tam).toContain('512x512');
    expect(manifest.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);
  });
});
