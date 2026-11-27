// Genera todos los íconos y la pantalla de inicio desde assets/logo.png ("perro feliz en casa").
//
//   node scripts/generar-iconos.mjs
//
// Escribe:
//   assets/icon.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png
//       fuentes para @capacitor/assets (ver docs/android.md)
//   public/icons/icon-{32,180,192,512}.png y maskable-512.png
//   android/app/src/main/res/mipmap-*/ic_launcher_monochrome.png   ícono temático de Android 13+
//
// El logo es un cuadrado de un solo color de fondo (teal). Para el primer plano adaptativo, el monocromo
// y la pantalla de inicio se separa la marca del fondo por distancia de color.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (...p) => resolve(raiz, ...p);
const FUENTE = ruta('assets/logo.png');

// Color de fondo del logo (esquinas del PNG). Lo usan el fondo adaptativo y el splash.
export const FONDO = { r: 9, g: 95, b: 88 };
const FONDO_HEX = '#095F58';

// Margen del lienzo ocupado por la marca. El logo llega hasta ~50 % del radio de su cuadrado.
const ESCALA_ICONO = 1; // ícono completo: el PNG tal cual
// @capacitor/assets ya inserta el primer plano en la zona segura (inset 16,7 %): la marca ocupa todo el PNG.
const ESCALA_FOREGROUND_CAPACITOR = 1;
// El monocromo (Android 13+) se usa sin inset: se reduce a la zona segura de 66 % del ícono adaptativo.
const ESCALA_MONOCROMO = 0.66;
const ESCALA_MASCARABLE = 0.8; // zona segura de 80 % de los íconos "maskable"
const ESCALA_SPLASH = 0.34; // ancho del logo / ancho de la pantalla de inicio

function guardado(destino) {
  console.log('  ' + destino.replace(raiz, '.').replaceAll('\\', '/'));
}

async function guardar(img, destino) {
  mkdirSync(dirname(destino), { recursive: true });
  await img.png({ compressionLevel: 9 }).toFile(destino);
  guardado(destino);
}

const lienzoLiso = (px) =>
  sharp({ create: { width: px, height: px, channels: 3, background: FONDO } });

/** El logo escalado a `lado` px, sobre su propio fondo. */
const logoEscalado = (lado) => sharp(FUENTE).resize(lado, lado, { kernel: 'lanczos3' }).png().toBuffer();

/** La marca sin fondo: alfa según qué tan lejos está cada píxel del color de fondo. */
async function marcaSinFondo(lado) {
  const { data, info } = await sharp(FUENTE)
    .resize(lado, lado, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
    const d = Math.max(Math.abs(data[i] - FONDO.r), Math.abs(data[i + 1] - FONDO.g), Math.abs(data[i + 2] - FONDO.b));
    const alfa = Math.min(1, Math.max(0, (d - 10) / 40));
    out[o] = data[i];
    out[o + 1] = data[i + 1];
    out[o + 2] = data[i + 2];
    out[o + 3] = Math.round(alfa * 255);
  }
  return { buffer: out, ancho: info.width, alto: info.height };
}

const aPng = ({ buffer, ancho, alto }, monocromo = false) => {
  let datos = buffer;
  if (monocromo) {
    datos = Buffer.from(buffer);
    for (let o = 0; o < datos.length; o += 4) {
      datos[o] = datos[o + 1] = datos[o + 2] = 0;
    }
  }
  return sharp(datos, { raw: { width: ancho, height: alto, channels: 4 } }).png().toBuffer();
};

/** Pone `capa` (cuadrada) centrada y escalada a `escala` del lienzo de `px`, sobre `base`. */
async function componer(px, escala, capa, { base = null } = {}) {
  const lado = Math.round(px * escala);
  const capaEscalada = await sharp(capa).resize(lado, lado).png().toBuffer();
  const lienzo = base
    ? sharp(base)
    : sharp({ create: { width: px, height: px, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  const margen = Math.round((px - lado) / 2);
  return lienzo.composite([{ input: capaEscalada, left: margen, top: margen }]);
}

const redondear = (px, buf) =>
  sharp(buf).composite([
    {
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"><rect width="${px}" height="${px}" rx="${px * 0.22}" fill="#fff"/></svg>`),
      blend: 'dest-in'
    }
  ]);

console.log('Fuentes para @capacitor/assets');
const icono1024 = await logoEscalado(1024);
await guardar(sharp(icono1024), ruta('assets/icon.png'));

const marca = await marcaSinFondo(1024);
const marcaPng = await aPng(marca);
const marcaMono = await aPng(marca, true);

await guardar(await componer(1024, ESCALA_FOREGROUND_CAPACITOR, marcaPng), ruta('assets/icon-foreground.png'));
await guardar(lienzoLiso(1024), ruta('assets/icon-background.png'));

const lienzoSplash = await lienzoLiso(2732).png().toBuffer();
const splash = await componer(2732, ESCALA_SPLASH, marcaPng, { base: lienzoSplash });
const splashBuf = await splash.png().toBuffer();
await guardar(sharp(splashBuf), ruta('assets/splash.png'));
await guardar(sharp(splashBuf), ruta('assets/splash-dark.png'));

console.log('Web / PWA');
for (const px of [512, 192]) {
  const base = await logoEscalado(px);
  await guardar(redondear(px, await sharp(base).ensureAlpha().png().toBuffer()), ruta(`public/icons/icon-${px}.png`));
}
await guardar(sharp(await logoEscalado(180)), ruta('public/icons/icon-180.png')); // iOS redondea solo
const maskableBase = await lienzoLiso(512).png().toBuffer();
await guardar(await componer(512, ESCALA_MASCARABLE, await logoEscalado(1024), { base: maskableBase }), ruta('public/icons/maskable-512.png'));
const base32 = await logoEscalado(128);
await guardar(redondear(32, await sharp(base32).resize(32, 32).ensureAlpha().png().toBuffer()), ruta('public/icons/icon-32.png'));

console.log('Android: ícono monocromo (temático)');
const DENSIDADES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [densidad, px] of Object.entries(DENSIDADES)) {
  await guardar(
    await componer(px, ESCALA_MONOCROMO, marcaMono),
    ruta(`android/app/src/main/res/mipmap-${densidad}/ic_launcher_monochrome.png`)
  );
}
console.log('Listo. Fondo del logo', FONDO_HEX);
