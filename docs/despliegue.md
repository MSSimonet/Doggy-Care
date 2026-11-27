# Guía de despliegue — Pensionado Doggy-Care

## Orden correcto (seguilo al pie de la letra)

### 1. Respaldar tablas a CSV
Antes de cualquier cambio en la base de datos:
- Dashboard Supabase → Table Editor → cada tabla → "Export to CSV"
- Guardá los CSV en un lugar seguro fuera del repo

### 2. Configurar URLs de autenticación en Supabase
Dashboard → Authentication → URL Configuration:
- **Site URL**: `https://tu-app.vercel.app` (o tu dominio)
- **Redirect URLs**: `https://tu-app.vercel.app` (mismo valor)

### 3. Cargar variables de entorno en Vercel
Dashboard Vercel → Settings → Environment Variables:
```
VITE_SUPABASE_URL     = https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY = <tu clave anon actual>
```
> ⚠ **`VITE_SUPABASE_URL` es solo la dirección base del proyecto**, sin ruta:
> `https://abcd1234.supabase.co` — **no** `https://abcd1234.supabase.co/rest/v1/`.
> Una ruta de más rompía el ingreso. La app ahora se queda solo con el origen
> (`new URL(valor).origin`), y si el valor no es una URL `https://` válida muestra
> "La dirección de la base de datos no es válida (ver docs/despliegue.md)".
> Copiala de Dashboard → Settings → API → **Project URL**.

> ⚠ Vercel despliega **desde GitHub**, no desde `dist/`.
> Asegurate de que el proyecto de Vercel apunte al repositorio correcto.

### 4. Fusionar la rama de cambios a main
```bash
git checkout main
git merge mejoras/auditoria
git push origin main
```
Vercel detecta el push y redespliega automáticamente.

### 5. Probar el ingreso antes de tocar RLS
- Abrí la app desplegada
- Ingresá con tu correo (el que registraste en Supabase Auth)
- Si funciona el envío del enlace/código, continuá

### 6. Ejecutar 001_auth_rls.sql con tu UUID
Solo si el paso 5 funcionó:
- Dashboard Supabase → SQL Editor
- Reemplazá las 4 ocurrencias de `'<UUID_DEL_DUEÑO>'` con tu UUID
  (Authentication → Users → copiá el UUID de tu usuario)
- Ejecutá el script

### 7. Verificar que los datos siguen accesibles
- Recargá la app y confirmá que se ven las estadías y el registro de estadías
- Si algo falla, revisá que el UUID sea exactamente el mismo de tu usuario

### 8. Rotar la clave anon (opcional pero recomendado)
- Dashboard → Settings → API → "Rotate anon key"
- Actualizá `VITE_SUPABASE_ANON_KEY` en Vercel con la nueva clave
- Vercel redespliega solo
- Limpiá el historial de git antes de publicar el repositorio y rotá la clave pública (ver docs/SEGURIDAD.md)

---

## Migración 002 (`supabase/migrations/002_limpieza.sql`)

### Pasos 1 y 2: borrar duplicados de Tobías y Zeus — **omitida: se borra a mano**

El dueño borra a mano los duplicados de Tobías (17/10 al 21/10) y Zeus (22/10 al 26/10).
**No ejecutar** los dos `DELETE` de la migración.

> Para el borrado a mano: los registros con id que empieza con `hist-agenda-` se crean al
> pasar una estadía al **Registro de estadías** (`src/App.tsx`), así que los duplicados están en
> el **Registro de estadías** (`historical_stays`), no en la agenda (`stays`), que es la tabla que miran
> los `DELETE` de la migración. Se pueden borrar desde la app (Cobros → Ver Registro de estadías → Borrar), que
> pide confirmación y deja 10 segundos para deshacer.

### Paso 3: agregar el año a `from_day` y `until_day`

Pendiente, sin ejecutar. Sólo toca filas de `stays` con **las dos** fechas en formato
`D/M` sin año. Según los datos del repo (`src/data/initialData.ts` y `src/data/demoData.ts`)
serían **0 registros**: todas las fechas ya están como `AAAA-MM-DD`. Antes de correrlo,
contar en Supabase cuántas filas cumplen la condición y ajustar el año (usa el año actual).

---

## Crear el usuario administrador (una sola vez)

La app usa **correo + contraseña** (`signInWithPassword`). No hay OTP ni enlaces mágicos.

### Pasos en Supabase Dashboard

1. **Crear el usuario:**
   - Authentication → Users → "Add user" → "Create new user"
   - Ingresá el correo y una contraseña fuerte
   - Marcá **"Auto Confirm User"** para que quede activo sin verificar el correo

2. **Cambiar la contraseña:**
   - Authentication → Users → clic en el usuario → "Send password reset email"
   - O desde el SQL Editor: `UPDATE auth.users SET encrypted_password = crypt('nueva_clave', gen_salt('bf')) WHERE email = 'tu@correo.com';`

---

## Ingreso con huella (celular)

> **Es un candado de pantalla, no un ingreso nuevo.** La sesión de Supabase sigue guardada
> en `localStorage` del teléfono (es lo que hace el cliente Supabase JS) y la huella **no** la
> cifra ni la protege: sólo tapa la app hasta que la huella se confirma. Quien pueda leer el
> almacenamiento del navegador o del APK puede leer la sesión igual que antes.
>
> **La contraseña es la forma de recuperación.** Si la huella falla, se cancela, el teléfono
> la bloquea o se borran las huellas, siempre queda "Ingresar con contraseña".

Todo está en `src/lib/huella.ts`, con cuatro funciones: `disponible`, `activar`,
`desbloquear` y `desactivar`. `App.tsx` usa sólo esas (y las ayudas de segundo plano y de
la pantalla de desbloqueo del mismo archivo).

### En el APK

- Si `Capacitor.isNativePlatform()` da `true`, usa `@aparajita/capacitor-biometric-auth`
  (compatible con Capacitor 8, se carga con `import()` dinámico).
- `disponible` = `checkBiometry().isAvailable`: hay sensor **y** una huella cargada.
- Pide sólo huella o rostro (`allowDeviceCredential: false`), no el PIN del teléfono.
- `android/app/src/main/AndroidManifest.xml` ya tiene
  `<uses-permission android:name="android.permission.USE_BIOMETRIC" />`.

### En el navegador del celular (WebAuthn)

- Se ofrece sólo si `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
  da `true` y la página es segura (https).
- Activar: `navigator.credentials.create` con `rp.id = window.location.hostname` y
  `authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" }`.
- Desbloquear: `navigator.credentials.get` con `userVerification: "required"` y esa credencial.
- En `localStorage` se guarda **sólo el identificador de la credencial**
  (`pensionados_huella_credencial`), más dos marcas: activada y ya ofrecida. La clave privada
  queda en el teléfono y nunca sale de ahí.
- La firma no se verifica en un servidor: por eso es un candado de pantalla y no un ingreso.
- La credencial queda atada al dominio. Si cambia el dominio de Vercel, hay que volver a activarla.
- Al desactivar se olvida el identificador; la credencial puede seguir en el teléfono
  (se borra desde los ajustes de llaves de acceso del celular).

### Flujo

1. El primer ingreso es con correo y contraseña.
2. Si hay sensor y huella cargada, aparece **"¿Activar ingreso con huella?"** con
   **"Sí, activar"** y **"Ahora no"**. Aparece con cualquier sesión abierta sin huella
   activada, también si la sesión ya estaba guardada de antes. Sólo **"Ahora no"** la
   descarta, y sólo para esa cuenta en ese teléfono. Un error al activar, cerrar el cuadro
   o una marca vieja de una prueba no la descartan. Si activar falla, el cuadro queda
   abierto con el error real (por ejemplo `NotAllowedError: …`) y "Probar de nuevo".
3. Con la huella activada, la app la pide **al abrirse** y **al volver de segundo plano
   después de 5 minutos**.
4. Si se cancela, o falla **3 veces**, aparece **"Ingresar con contraseña"**. Si el teléfono
   bloquea la huella por intentos o ya no hay huella cargada, queda sólo la contraseña.
   Entrar con contraseña cierra la sesión guardada y deja la huella activada para la próxima.
5. **Ajustes → Seguridad → "Ingreso con huella"** la prende o la apaga. El interruptor
   siempre se ve; si no se puede usar, queda desactivado y abajo dice la causa y qué hacer:

   | Motivo (`disponible()`) | Qué dice |
   |---|---|
   | `sin_webauthn` | El navegador no lo permite (pasa al abrir el enlace desde WhatsApp u otra app): "Abrí la app directamente en Chrome (no desde WhatsApp)". |
   | `sin_https` | Abrir la app con una dirección `https://`. |
   | `sin_sensor_o_huella` | "Cargá una huella en los ajustes del celular" y volver a abrir la app. |
   | `iframe` | La app está dentro de otra página: abrirla sola en una pestaña de Chrome. |
   | `error` | Muestra el mensaje real y pide cerrar y volver a abrir la app. |

   Si activar o desbloquear fallan, el error real (`name: message` de WebAuthn, o el código
   del plugin en el APK) se muestra en pantalla, no sólo en la consola.
6. **Cerrar sesión** (Ajustes → Seguridad) también la desactiva, y la oferta vuelve a
   aparecer en el próximo ingreso.

### Para después: Passkeys de Supabase (beta)

Supabase tiene ingreso con passkeys en beta. Sería la opción más fuerte: la firma de la huella
la verifica el servidor y reemplaza a la contraseña, en vez de ser sólo un candado sobre una
sesión guardada. Conviene revisarlo cuando salga de beta.

### Cómo se prueba

- `src/lib/huella.test.ts` simula el plugin y WebAuthn (no hay huella real en las pruebas).
- `scripts/medir.mjs` mide las pantallas "Activar huella" y "Desbloquear" en modo demo
  (`?huella=activar`, `?huella=desbloquear`, `?huella=contrasena`), en 360 y 1280 px,
  claro y oscuro.
- **La huella real sólo se prueba en un celular**: en el APK instalado y en Chrome de Android
  con la app publicada en https.

---

## App instalable desde Chrome

Además del APK, la versión web se puede instalar desde Chrome (en el celular: menú **⋮ →
Instalar aplicación** o **Agregar a la pantalla principal**). Queda con su ícono, se abre a
pantalla completa y se llama **Doggy-Care**.

### Archivos

| Archivo | Para qué |
|---|---|
| `public/manifest.webmanifest` | Nombre "Doggy-Care", colores `#222A37`, abre en pantalla completa (`standalone`). |
| `public/icons/` | Íconos generados desde `assets/icon.png`: 192 y 512 px, uno **enmascarable** de 512 (el ícono al 80 % sobre el azul, para que Android lo recorte en círculo sin cortar el perro), 180 px para iPhone y 32 px de favicon. |
| `public/sw.js` | Service worker mínimo. |
| `src/main.tsx` | Registra el service worker **sólo** en el build de producción y **no** en el APK. |
| `index.html` | Enlaces al manifest, al favicon y al ícono de iPhone. |

### Qué guarda el service worker (y qué no)

- **Guarda sólo la carcasa de la app**: `index.html`, los JS y CSS de `/assets/`, los íconos y
  el manifest, todos del propio sitio. Sirve para poder instalarla y abrirla rápido.
- **No guarda datos.** No toca ningún pedido a otro dominio, así que nunca guarda respuestas de
  Supabase (ni estadías, ni historial, ni el ingreso), ni las fuentes de Google. Tampoco guarda
  pedidos que no sean GET ni nada que lleve el encabezado `Authorization`.
- Las páginas van **primero a la red**: siempre se ve la última versión publicada. Sólo sin
  conexión muestra la carcasa guardada (sin datos: los datos siempre vienen de Supabase).
- Al publicar una versión nueva no hay que hacer nada: `index.html` se pide a la red y los JS y
  CSS tienen el hash en el nombre. Si algún día se cambia `public/sw.js` para guardar otras
  cosas, subir el número de `CACHE` (`doggy-care-carcasa-v1` → `v2`) para que se borre lo viejo.
- Probado en `src/lib/serviceWorker.test.ts`: no intercepta Supabase, otros dominios, pedidos
  que no son GET ni con credenciales.

### Verificación

Con el build de producción servido localmente (`npm run build` y `npx vite preview`):

- Chrome (`Page.getInstallabilityErrors`): **instalable, 0 errores**; el service worker queda
  activo y en la caché sólo están `/`, el manifest, los íconos, el CSS y el JS.
- **Lighthouse 11.7.1, categoría PWA: 100** (`installable-manifest`, pantalla de inicio, color del
  tema e ícono enmascarable en verde). Lighthouse 12 o más nuevo ya no trae esa categoría; para
  repetirlo:

  ```bash
  npx lighthouse@11.7.1 http://localhost:4173 --only-categories=pwa --view
  ```

---

## Variables de entorno requeridas

| Variable                | Descripción                          |
|-------------------------|--------------------------------------|
| `VITE_SUPABASE_URL`     | URL del proyecto Supabase            |
| `VITE_SUPABASE_ANON_KEY`| Clave anon (pública) de Supabase     |

Sin estas variables la app muestra un mensaje de configuración en lugar de abrirse.

---

## Comandos útiles de desarrollo

```bash
npm run dev        # Servidor local
npm run build      # Build de producción
npm run preview    # Vista previa del build
npm test           # Tests con Vitest
```
