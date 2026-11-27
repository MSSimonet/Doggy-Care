import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Simulaciones: Capacitor, el plugin biométrico y WebAuthn ────────────────

const capacitor = vi.hoisted(() => ({ nativo: false }));
const plugin = vi.hoisted(() => ({
  checkBiometry: vi.fn(),
  authenticate: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => capacitor.nativo }
}));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({ BiometricAuth: plugin }));

import * as huella from './huella';

const credenciales = { create: vi.fn(), get: vi.fn() };
const uvpaa = vi.fn();

function errorDom(name: string) {
  const e = new Error(name);
  e.name = name;
  return e;
}

function errorPlugin(code: string) {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  localStorage.clear();
  capacitor.nativo = false;
  plugin.checkBiometry.mockReset().mockResolvedValue({ isAvailable: true });
  plugin.authenticate.mockReset().mockResolvedValue(undefined);
  credenciales.create.mockReset();
  credenciales.get.mockReset();
  uvpaa.mockReset().mockResolvedValue(true);
  vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: uvpaa });
  Object.defineProperty(navigator, 'credentials', { value: credenciales, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('base64url', () => {
  it('ida y vuelta del identificador de la credencial', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
    const texto = huella.aBase64Url(bytes);
    expect(texto).not.toMatch(/[+/=]/);
    expect(Array.from(huella.deBase64Url(texto))).toEqual(Array.from(bytes));
  });
});

describe('APK (plugin biométrico)', () => {
  beforeEach(() => { capacitor.nativo = true; });

  it('disponible según checkBiometry', async () => {
    expect(await huella.disponible()).toEqual({ disponible: true });
    plugin.checkBiometry.mockResolvedValue({ isAvailable: false });
    expect(await huella.disponible()).toMatchObject({ disponible: false, motivo: 'sin_sensor_o_huella' });
  });

  it('sin huella cargada no se ofrece', async () => {
    plugin.checkBiometry.mockResolvedValue({ isAvailable: false });
    const r = await huella.activar('admin@correo.com');
    expect(r.ok).toBe(false);
    expect(huella.estaActivada()).toBe(false);
  });

  it('activar pide la huella una vez y queda activada', async () => {
    const r = await huella.activar('admin@correo.com');
    expect(r.ok).toBe(true);
    expect(plugin.authenticate).toHaveBeenCalledTimes(1);
    expect(plugin.authenticate.mock.calls[0][0]).toMatchObject({ allowDeviceCredential: false });
    expect(huella.estaActivada()).toBe(true);
  });

  it('desbloquear: bien, cancelado, falla y bloqueo', async () => {
    await huella.activar('admin@correo.com');
    expect(await huella.desbloquear()).toEqual({ ok: true });

    plugin.authenticate.mockRejectedValueOnce(errorPlugin('userCancel'));
    expect(await huella.desbloquear()).toMatchObject({ ok: false, motivo: 'cancelado' });

    plugin.authenticate.mockRejectedValueOnce(errorPlugin('authenticationFailed'));
    expect(await huella.desbloquear()).toMatchObject({ ok: false, motivo: 'fallo' });

    plugin.authenticate.mockRejectedValueOnce(errorPlugin('biometryLockout'));
    expect(await huella.desbloquear()).toMatchObject({ ok: false, motivo: 'bloqueado' });
  });

  it('no usa WebAuthn', async () => {
    await huella.activar('admin@correo.com');
    await huella.desbloquear();
    expect(credenciales.create).not.toHaveBeenCalled();
    expect(credenciales.get).not.toHaveBeenCalled();
  });
});

describe('navegador (WebAuthn)', () => {
  const rawId = new Uint8Array([9, 8, 7, 6, 5]).buffer;

  it('sólo se ofrece si hay autenticador del teléfono con verificación', async () => {
    expect(await huella.disponible()).toEqual({ disponible: true });
    uvpaa.mockResolvedValue(false);
    expect(await huella.disponible()).toMatchObject({ disponible: false });
  });

  it('activar crea la credencial del teléfono con verificación obligatoria', async () => {
    credenciales.create.mockResolvedValue({ rawId });
    const r = await huella.activar('admin@correo.com');
    expect(r.ok).toBe(true);

    const opts = credenciales.create.mock.calls[0][0].publicKey;
    expect(opts.rp.id).toBe(window.location.hostname);
    expect(opts.authenticatorSelection).toMatchObject({
      authenticatorAttachment: 'platform',
      userVerification: 'required'
    });
    expect(opts.user.name).toBe('admin@correo.com');
    expect(plugin.authenticate).not.toHaveBeenCalled();
  });

  it('en localStorage queda sólo el identificador de la credencial', async () => {
    credenciales.create.mockResolvedValue({ rawId });
    await huella.activar('admin@correo.com');
    const guardado = Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]));
    expect(guardado).toEqual({
      pensionados_huella_activa: '1',
      pensionados_huella_credencial: huella.aBase64Url(rawId)
    });
  });

  it('desbloquear pide esa credencial con verificación obligatoria', async () => {
    credenciales.create.mockResolvedValue({ rawId });
    await huella.activar('admin@correo.com');
    credenciales.get.mockResolvedValue({ id: 'x' });

    expect(await huella.desbloquear()).toEqual({ ok: true });
    const opts = credenciales.get.mock.calls[0][0].publicKey;
    expect(opts.userVerification).toBe('required');
    expect(opts.rpId).toBe(window.location.hostname);
    expect(Array.from(new Uint8Array(opts.allowCredentials[0].id))).toEqual([9, 8, 7, 6, 5]);
  });

  it('cancelar o no reconocer (NotAllowedError) cuenta como cancelado', async () => {
    credenciales.create.mockResolvedValue({ rawId });
    await huella.activar('admin@correo.com');
    credenciales.get.mockRejectedValue(errorDom('NotAllowedError'));
    expect(await huella.desbloquear()).toMatchObject({ ok: false, motivo: 'cancelado' });
  });

  it('si cancela al activar, no queda activada', async () => {
    credenciales.create.mockRejectedValue(errorDom('NotAllowedError'));
    const r = await huella.activar('admin@correo.com');
    expect(r).toMatchObject({ ok: false, motivo: 'cancelado' });
    expect(huella.estaActivada()).toBe(false);
  });

  it('desactivar borra la credencial guardada', async () => {
    credenciales.create.mockResolvedValue({ rawId });
    await huella.activar('admin@correo.com');
    huella.desactivar();
    expect(huella.estaActivada()).toBe(false);
    expect(localStorage.getItem('pensionados_huella_credencial')).toBeNull();
    expect(await huella.desbloquear()).toMatchObject({ ok: false, motivo: 'no-disponible' });
  });
});

describe('segundo plano', () => {
  it('pide la huella sólo si pasaron más de 5 minutos', () => {
    const t0 = 1_000_000;
    huella.marcarSegundoPlano(t0);
    expect(huella.debePedirAlVolver(t0 + 4 * 60_000)).toBe(false);

    huella.marcarSegundoPlano(t0);
    expect(huella.debePedirAlVolver(t0 + 5 * 60_000 + 1)).toBe(true);
  });

  it('sin haber ido a segundo plano no pide', () => {
    expect(huella.debePedirAlVolver()).toBe(false);
  });
});

describe('pantalla de desbloqueo', () => {
  const fallo = { ok: false as const, motivo: 'fallo' as const, mensaje: '' };
  const cancelado = { ok: false as const, motivo: 'cancelado' as const, mensaje: 'Cancelaste la huella.' };

  it('al cancelar aparece "Ingresar con contraseña" y se puede reintentar', () => {
    const e = huella.despuesDeIntentar(huella.ESTADO_INICIAL, cancelado);
    expect(e.ofrecerContrasena).toBe(true);
    expect(e.puedeReintentar).toBe(true);
  });

  it('después de 3 fallos sólo queda la contraseña', () => {
    let e = huella.despuesDeIntentar(huella.ESTADO_INICIAL, fallo);
    expect(e).toMatchObject({ fallos: 1, ofrecerContrasena: false });
    expect(e.mensaje).toBe('No se reconoció la huella. Intento 1 de 3.');
    e = huella.despuesDeIntentar(e, fallo);
    expect(e).toMatchObject({ fallos: 2, ofrecerContrasena: false });
    e = huella.despuesDeIntentar(e, fallo);
    expect(e).toMatchObject({ fallos: 3, ofrecerContrasena: true, puedeReintentar: false });
  });

  it('bloqueo del sistema: sólo la contraseña', () => {
    const e = huella.despuesDeIntentar(huella.ESTADO_INICIAL, { ok: false, motivo: 'bloqueado', mensaje: 'x' });
    expect(e).toMatchObject({ ofrecerContrasena: true, puedeReintentar: false });
  });

  it('un ingreso correcto vuelve al estado inicial', () => {
    const e = huella.despuesDeIntentar({ fallos: 2, ofrecerContrasena: true, puedeReintentar: true, mensaje: 'x', detalle: 'y' }, { ok: true });
    expect(e).toEqual(huella.ESTADO_INICIAL);
  });
});

// ── Diagnóstico: por qué no está disponible ─────────────────────────────────

describe('disponible(): motivo cuando no hay huella', () => {
  it('sin_webauthn: navegador sin PublicKeyCredential (por ejemplo, el de WhatsApp)', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    const d = await huella.disponible();
    expect(d).toEqual({ disponible: false, motivo: 'sin_webauthn' });
    expect(huella.explicarNoDisponible(d as any)).toContain('Abrí la app directamente en Chrome (no desde WhatsApp)');
  });

  it('sin_webauthn: existe PublicKeyCredential pero sin la consulta del autenticador', async () => {
    vi.stubGlobal('PublicKeyCredential', {});
    expect(await huella.disponible()).toEqual({ disponible: false, motivo: 'sin_webauthn' });
  });

  it('sin_https: la página no es segura', async () => {
    vi.stubGlobal('isSecureContext', false);
    const d = await huella.disponible();
    expect(d).toEqual({ disponible: false, motivo: 'sin_https' });
    expect(huella.explicarNoDisponible(d as any)).toContain('https://');
    expect(uvpaa).not.toHaveBeenCalled();
  });

  it('sin_sensor_o_huella: isUserVerifyingPlatformAuthenticatorAvailable da false', async () => {
    uvpaa.mockResolvedValue(false);
    const d = await huella.disponible();
    expect(d).toEqual({ disponible: false, motivo: 'sin_sensor_o_huella' });
    expect(huella.explicarNoDisponible(d as any)).toContain('Cargá una huella en los ajustes del celular');
  });

  it('iframe: la página está embebida en otra', async () => {
    vi.stubGlobal('top', {});
    const d = await huella.disponible();
    expect(d).toEqual({ disponible: false, motivo: 'iframe' });
    expect(huella.explicarNoDisponible(d as any)).toContain('Abrila sola');
  });

  it('iframe: embebida en otro origen (leer window.top da error)', async () => {
    Object.defineProperty(window, 'top', { get: () => { throw new Error('cross-origin'); }, configurable: true });
    try {
      expect(await huella.disponible()).toEqual({ disponible: false, motivo: 'iframe' });
    } finally {
      Object.defineProperty(window, 'top', { get: () => window, configurable: true });
    }
  });

  it('error: la consulta falla y se devuelve el mensaje real', async () => {
    uvpaa.mockRejectedValue(Object.assign(new Error('Operation is insecure'), { name: 'SecurityError' }));
    const d = await huella.disponible();
    expect(d).toEqual({ disponible: false, motivo: 'error', detalle: 'SecurityError: Operation is insecure' });
    expect(huella.explicarNoDisponible(d as any)).toContain('SecurityError: Operation is insecure');
  });

  it('APK: error del plugin con su código y mensaje', async () => {
    capacitor.nativo = true;
    plugin.checkBiometry.mockRejectedValue(errorPlugin('invalidContext'));
    expect(await huella.disponible()).toEqual({ disponible: false, motivo: 'error', detalle: 'invalidContext: invalidContext' });
  });

  it('APK: sin huella cargada trae el motivo del plugin', async () => {
    capacitor.nativo = true;
    plugin.checkBiometry.mockResolvedValue({ isAvailable: false, code: 'biometryNotEnrolled', reason: 'No hay huellas' });
    expect(await huella.disponible()).toEqual({
      disponible: false, motivo: 'sin_sensor_o_huella', detalle: 'biometryNotEnrolled: No hay huellas'
    });
  });

  it('activar sin huella disponible explica por qué', async () => {
    uvpaa.mockResolvedValue(false);
    const r = await huella.activar('admin@correo.com');
    expect(r).toMatchObject({ ok: false, motivo: 'no-disponible' });
    expect((r as any).detalle).toContain('Cargá una huella');
    expect(credenciales.create).not.toHaveBeenCalled();
  });
});

describe('errores reales de WebAuthn (name y message)', () => {
  const rawId = new Uint8Array([1, 2, 3]).buffer;

  it('activar devuelve el error real', async () => {
    credenciales.create.mockRejectedValue(Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' }));
    const r = await huella.activar('admin@correo.com');
    expect(r).toMatchObject({ ok: false, motivo: 'cancelado', detalle: 'NotAllowedError: The operation either timed out or was not allowed.' });
  });

  it('desbloquear devuelve el error real y la pantalla lo guarda para mostrarlo', async () => {
    credenciales.create.mockResolvedValue({ rawId });
    await huella.activar('admin@correo.com');
    credenciales.get.mockRejectedValue(Object.assign(new Error('The relying party ID is not a registrable domain suffix'), { name: 'SecurityError' }));
    const r = await huella.desbloquear();
    expect(r).toMatchObject({ ok: false, motivo: 'no-disponible', detalle: 'SecurityError: The relying party ID is not a registrable domain suffix' });
    const e = huella.despuesDeIntentar(huella.ESTADO_INICIAL, r);
    expect(e.detalle).toBe('SecurityError: The relying party ID is not a registrable domain suffix');
  });
});

describe('oferta "¿Activar ingreso con huella?"', () => {
  it('una marca vieja sin usuario (de una prueba anterior) no la esconde y se borra', () => {
    localStorage.setItem('pensionados_huella_ofrecida', '1');
    expect(huella.yaSeRechazo('usuario-1')).toBe(false);
    expect(localStorage.getItem('pensionados_huella_ofrecida')).toBeNull();
  });

  it('"Ahora no" vale sólo para esa cuenta', () => {
    huella.marcarRechazada('usuario-1');
    expect(huella.yaSeRechazo('usuario-1')).toBe(true);
    expect(huella.yaSeRechazo('usuario-2')).toBe(false);
  });

  it('un error al activar no la da por rechazada', async () => {
    credenciales.create.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await huella.activar('admin@correo.com');
    expect(huella.yaSeRechazo('usuario-1')).toBe(false);
  });

  it('cerrar sesión vuelve a ofrecerla', () => {
    huella.marcarRechazada('usuario-1');
    huella.olvidarRechazo();
    expect(huella.yaSeRechazo('usuario-1')).toBe(false);
  });

  it('sin usuario no hay rechazo guardado', () => {
    huella.marcarRechazada(null);
    expect(localStorage.length).toBe(0);
    expect(huella.yaSeRechazo(null)).toBe(false);
  });
});
