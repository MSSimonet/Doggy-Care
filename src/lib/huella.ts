/**
 * Ingreso con huella: un candado de pantalla sobre la sesión de Supabase.
 *
 * - En el APK (Capacitor.isNativePlatform()) usa @aparajita/capacitor-biometric-auth.
 * - En el navegador del celular usa WebAuthn con el autenticador del propio
 *   teléfono (huella o rostro) y verificación de usuario obligatoria.
 *
 * No reemplaza la contraseña: la sesión sigue en localStorage (la guarda
 * Supabase) y la contraseña es la forma de recuperación. Ver docs/despliegue.md.
 *
 * App.tsx usa sólo esta interfaz: disponible, activar, desbloquear, desactivar.
 */
import { Capacitor } from '@capacitor/core';

const ACTIVA_KEY = 'pensionados_huella_activa';
const CREDENCIAL_KEY = 'pensionados_huella_credencial';
// "Ahora no" se guarda por usuario: sólo cuenta si esa cuenta lo eligió en este dispositivo
const RECHAZADA_KEY = 'pensionados_huella_rechazada';
// Marca vieja (sin usuario) que dejaban versiones anteriores o pruebas: se ignora y se borra
const OFRECIDA_VIEJA_KEY = 'pensionados_huella_ofrecida';

export const MINUTOS_SEGUNDO_PLANO = 5;
const SEGUNDO_PLANO_MS = MINUTOS_SEGUNDO_PLANO * 60 * 1000;
export const MAX_FALLOS = 3;

export type MotivoFallo = 'cancelado' | 'fallo' | 'bloqueado' | 'no-disponible';

export type HuellaResultado =
  | { ok: true }
  // detalle: el error real (name y message de WebAuthn, o código y mensaje del plugin)
  | { ok: false; motivo: MotivoFallo; mensaje: string; detalle?: string };

// Por qué no se puede usar la huella en este dispositivo
export type MotivoNoDisponible = 'sin_webauthn' | 'sin_https' | 'sin_sensor_o_huella' | 'iframe' | 'error';

export type Disponibilidad =
  | { disponible: true }
  | { disponible: false; motivo: MotivoNoDisponible; detalle?: string };

/** Causa y qué hacer, en lenguaje simple, para mostrar debajo del interruptor. */
export function explicarNoDisponible(d: Exclude<Disponibilidad, { disponible: true }>): string {
  switch (d.motivo) {
    case 'sin_webauthn':
      return 'Este navegador no permite usar la huella. Suele pasar al abrir el enlace desde WhatsApp, Instagram u otra app. Abrí la app directamente en Chrome (no desde WhatsApp).';
    case 'sin_https':
      return 'La huella sólo funciona en una dirección segura. Abrí la app con una dirección que empiece con https://.';
    case 'sin_sensor_o_huella':
      return 'Este celular no tiene una huella cargada o no tiene sensor. Cargá una huella en los ajustes del celular (Seguridad > Huella digital) y volvé a abrir la app.';
    case 'iframe':
      return 'La app está abierta dentro de otra página. Abrila sola, en una pestaña de Chrome.';
    case 'error':
      return `No se pudo comprobar si hay huella${d.detalle ? ` (${d.detalle})` : ''}. Cerrá y volvé a abrir la app.`;
  }
}

const MENSAJES: Record<MotivoFallo, string> = {
  cancelado: 'Cancelaste la huella. Podés intentar de nuevo o ingresar con tu contraseña.',
  fallo: 'No se reconoció la huella. Probá de nuevo.',
  bloqueado: 'Hubo demasiados intentos con la huella. Ingresá con tu contraseña.',
  'no-disponible': 'La huella no está disponible en este teléfono. Ingresá con tu contraseña.'
};

const fallo = (motivo: MotivoFallo, detalle?: string): HuellaResultado =>
  detalle ? { ok: false, motivo, mensaje: MENSAJES[motivo], detalle } : { ok: false, motivo, mensaje: MENSAJES[motivo] };

const detalleWebAuthn = (err: any) =>
  err && (err.name || err.message) ? `${err.name || 'Error'}: ${err.message || '(sin mensaje)'}` : String(err);
const detallePlugin = (err: any) =>
  err && (err.code || err.message) ? `${err.code || 'Error'}: ${err.message || '(sin mensaje)'}` : String(err);

function esApk(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function leer(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function escribir(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

// ── base64url para guardar el identificador de la credencial ────────────────

export function aBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64Url(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texto.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function aleatorio(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

// ── APK: plugin biométrico ───────────────────────────────────────────────────

async function plugin() {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  return BiometricAuth;
}

function motivoDelPlugin(code: unknown): MotivoFallo {
  switch (code) {
    case 'userCancel':
    case 'systemCancel':
    case 'appCancel':
    case 'userFallback':
      return 'cancelado';
    case 'biometryLockout':
      return 'bloqueado';
    case 'biometryNotAvailable':
    case 'biometryNotEnrolled':
    case 'noDeviceCredential':
    case 'passcodeNotSet':
      return 'no-disponible';
    default:
      return 'fallo';
  }
}

async function pedirHuellaApk(): Promise<HuellaResultado> {
  try {
    const auth = await plugin();
    await auth.authenticate({
      reason: 'Usá tu huella para entrar a Doggy Care',
      androidTitle: 'Ingreso con huella',
      androidSubtitle: 'Doggy Care',
      cancelTitle: 'Cancelar',
      allowDeviceCredential: false
    });
    return { ok: true };
  } catch (err: any) {
    return fallo(motivoDelPlugin(err?.code), detallePlugin(err));
  }
}

// ── Navegador: WebAuthn con el autenticador del teléfono ─────────────────────

function hayWebAuthn(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as any).PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.credentials;
}

function motivoWebAuthn(err: any): MotivoFallo {
  // El navegador no distingue "canceló" de "no se reconoció": ambos son NotAllowedError
  if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return 'cancelado';
  if (err?.name === 'InvalidStateError' || err?.name === 'NotSupportedError' || err?.name === 'SecurityError') {
    return 'no-disponible';
  }
  return 'fallo';
}

async function crearCredencialWeb(email: string): Promise<HuellaResultado> {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { id: window.location.hostname, name: 'Doggy Care' },
        user: { id: aleatorio(16) as BufferSource, name: email || 'administrador', displayName: email || 'Administrador' },
        challenge: aleatorio(32) as BufferSource,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged'
        },
        attestation: 'none',
        timeout: 60000
      }
    }) as PublicKeyCredential | null;
    if (!cred) return fallo('cancelado', 'El navegador no devolvió ninguna credencial');
    escribir(CREDENCIAL_KEY, aBase64Url(cred.rawId));
    return { ok: true };
  } catch (err) {
    return fallo(motivoWebAuthn(err), detalleWebAuthn(err));
  }
}

async function pedirHuellaWeb(): Promise<HuellaResultado> {
  const id = leer(CREDENCIAL_KEY);
  if (!id) return fallo('no-disponible', 'No hay una credencial guardada en este dispositivo');
  if (!hayWebAuthn()) return fallo('no-disponible', 'Este navegador no tiene WebAuthn');
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        rpId: window.location.hostname,
        challenge: aleatorio(32) as BufferSource,
        allowCredentials: [{ type: 'public-key', id: deBase64Url(id) as BufferSource, transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    return cred ? { ok: true } : fallo('cancelado', 'El navegador no devolvió ninguna credencial');
  } catch (err) {
    return fallo(motivoWebAuthn(err), detalleWebAuthn(err));
  }
}

// ── Interfaz pública ─────────────────────────────────────────────────────────

function enIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Acceder a window.top desde otro origen da error: también está embebida
    return true;
  }
}

/** Si se puede usar la huella acá y, si no, por qué. */
export async function disponible(): Promise<Disponibilidad> {
  if (esApk()) {
    try {
      const info: any = await (await plugin()).checkBiometry();
      if (info.isAvailable) return { disponible: true };
      const detalle = [info.code, info.reason].filter(Boolean).join(': ');
      return detalle
        ? { disponible: false, motivo: 'sin_sensor_o_huella', detalle }
        : { disponible: false, motivo: 'sin_sensor_o_huella' };
    } catch (err) {
      return { disponible: false, motivo: 'error', detalle: detallePlugin(err) };
    }
  }
  if (typeof window === 'undefined') return { disponible: false, motivo: 'sin_webauthn' };
  // Sin https el navegador esconde WebAuthn: se avisa por https y no por "navegador"
  if (window.isSecureContext === false) return { disponible: false, motivo: 'sin_https' };
  if (enIframe()) return { disponible: false, motivo: 'iframe' };
  const pkc = (window as any).PublicKeyCredential;
  if (!hayWebAuthn() || typeof pkc?.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return { disponible: false, motivo: 'sin_webauthn' };
  }
  try {
    const ok = await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
    return ok === true ? { disponible: true } : { disponible: false, motivo: 'sin_sensor_o_huella' };
  } catch (err) {
    return { disponible: false, motivo: 'error', detalle: detalleWebAuthn(err) };
  }
}

/** Pide la huella una vez para confirmar y deja el ingreso con huella activado. */
export async function activar(email: string): Promise<HuellaResultado> {
  const d = await disponible();
  if (!d.disponible) return fallo('no-disponible', explicarNoDisponible(d));
  const resultado = esApk() ? await pedirHuellaApk() : await crearCredencialWeb(email);
  if (resultado.ok) escribir(ACTIVA_KEY, '1');
  return resultado;
}

/** Pide la huella para sacar el candado. */
export async function desbloquear(): Promise<HuellaResultado> {
  if (!estaActivada()) return fallo('no-disponible', 'El ingreso con huella no está activado en este dispositivo');
  return esApk() ? pedirHuellaApk() : pedirHuellaWeb();
}

/** Apaga el ingreso con huella y olvida la credencial guardada. */
export function desactivar(): void {
  escribir(ACTIVA_KEY, null);
  escribir(CREDENCIAL_KEY, null);
}

export function estaActivada(): boolean {
  if (leer(ACTIVA_KEY) !== '1') return false;
  // En el navegador hace falta además el identificador de la credencial
  return esApk() || leer(CREDENCIAL_KEY) !== null;
}

// "Ahora no": esa cuenta no vuelve a ver la oferta en este dispositivo; se puede activar desde Ajustes.
// Sólo lo marca el botón "Ahora no" (no un error, ni cerrar el cuadro, ni una marca vieja).
export function yaSeRechazo(userId: string | null | undefined): boolean {
  limpiarMarcaVieja();
  return Boolean(userId) && leer(RECHAZADA_KEY) === userId;
}
export function marcarRechazada(userId: string | null | undefined): void {
  if (userId) escribir(RECHAZADA_KEY, userId);
}
/** Cerrar sesión vuelve a ofrecerla en el próximo ingreso. */
export function olvidarRechazo(): void {
  escribir(RECHAZADA_KEY, null);
  limpiarMarcaVieja();
}
function limpiarMarcaVieja(): void {
  if (leer(OFRECIDA_VIEJA_KEY) !== null) escribir(OFRECIDA_VIEJA_KEY, null);
}

// ── Segundo plano: pedir la huella al volver después de 5 minutos ────────────

let enSegundoPlanoDesde: number | null = null;

export function marcarSegundoPlano(ahora = Date.now()): void {
  enSegundoPlanoDesde = ahora;
}

/** Al volver: true si pasaron más de 5 minutos. Limpia la marca. */
export function debePedirAlVolver(ahora = Date.now()): boolean {
  const desde = enSegundoPlanoDesde;
  enSegundoPlanoDesde = null;
  return desde !== null && ahora - desde > SEGUNDO_PLANO_MS;
}

// ── Pantalla de desbloqueo: cuándo ofrecer la contraseña ─────────────────────

export type EstadoDesbloqueo = {
  fallos: number;
  ofrecerContrasena: boolean; // muestra "Ingresar con contraseña"
  puedeReintentar: boolean; // muestra "Desbloquear con huella"
  mensaje: string;
  detalle: string; // error real del último intento (WebAuthn o plugin), visible en pantalla
};

export const ESTADO_INICIAL: EstadoDesbloqueo = { fallos: 0, ofrecerContrasena: false, puedeReintentar: true, mensaje: '', detalle: '' };

/** Si cancela, o falla 3 veces, aparece "Ingresar con contraseña". */
export function despuesDeIntentar(estado: EstadoDesbloqueo, r: HuellaResultado): EstadoDesbloqueo {
  if (r.ok) return ESTADO_INICIAL;
  const detalle = r.detalle ?? '';
  if (r.motivo === 'fallo') {
    const fallos = estado.fallos + 1;
    if (fallos >= MAX_FALLOS) {
      return {
        fallos,
        ofrecerContrasena: true,
        puedeReintentar: false,
        mensaje: `No se reconoció la huella ${MAX_FALLOS} veces. Ingresá con tu contraseña.`,
        detalle
      };
    }
    return { ...estado, fallos, mensaje: `No se reconoció la huella. Intento ${fallos} de ${MAX_FALLOS}.`, detalle };
  }
  if (r.motivo === 'cancelado') {
    return { ...estado, ofrecerContrasena: true, mensaje: r.mensaje, detalle };
  }
  // Bloqueada por el sistema o sin huella cargada: sólo queda la contraseña
  return { ...estado, ofrecerContrasena: true, puedeReintentar: false, mensaje: r.mensaje, detalle };
}
