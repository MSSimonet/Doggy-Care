# Cómo generar el APK de Doggy-Care (Android)

Esta guía es para generar el archivo de instalación de Android (**APK**) sin experiencia previa.
El APK es la app instalada en el celular, con ícono propio e ingreso con huella.

> **Cada vez que cambie la app hay que repetir tres cosas:**
> 1. `npm run build`
> 2. `npx cap sync android`
> 3. Volver a generar el APK en Android Studio (paso 4) e instalarlo de nuevo.
>
> Si te saltás alguno, el APK sigue teniendo la versión vieja.

---

## 1. Instalar Android Studio (una sola vez)

1. Entrá a <https://developer.android.com/studio> y descargá **Android Studio**.
2. Instalalo con las opciones que vienen marcadas (incluye todo lo necesario para Android y Java).
3. Abrilo una vez. La primera vez descarga componentes (“SDK”): aceptá y esperá a que termine.
   Puede tardar varios minutos.

## 2. Preparar la app en la computadora

En la carpeta del proyecto tiene que estar el archivo `.env` con `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` (los mismos datos que usa Vercel). Sin ese archivo, la app instalada
no se conecta a la base de datos.

Abrí una terminal en la carpeta del proyecto y corré, en orden:

```bash
npm install
```

```bash
npm run build
```

```bash
npx cap sync android
```

- `npm run build` arma la app web.
- `npx cap sync android` copia esa app al proyecto de Android y conecta los complementos
  (por ejemplo, el de la huella).

## 3. Abrir el proyecto en Android Studio

1. En Android Studio: **File → Open**.
2. Elegí la carpeta **`android`** que está dentro del proyecto (no la carpeta del proyecto entera).
3. Esperá a que termine de cargar. Abajo a la derecha aparece una barra de progreso
   (“Gradle sync”); la primera vez tarda. Cuando termina, no hay mensajes en rojo.

## 4. Generar el APK

1. Menú **Build → Build App Bundle(s) / APK(s) → Build APK(s)**
   (en algunas versiones aparece como **Build → Build APK**).
2. Esperá. Al terminar aparece un aviso abajo a la derecha que dice que el APK está listo,
   con el enlace **locate**: tocalo para abrir la carpeta.
3. El archivo queda en:

   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

Este APK es de “depuración” (*debug*): sirve para instalarlo en tu propio celular. No sirve para
publicarlo en Google Play (eso requiere un APK firmado, que es otro paso).

## 5. Instalarlo en el celular

1. Pasá `app-debug.apk` al celular: por cable USB, Google Drive, o mandátelo por correo.
2. En el celular, abrí el archivo (desde **Archivos** o **Descargas**).
3. Android va a avisar que es de un **origen desconocido**. Tocá **Configuración** y activá
   **Permitir de esta fuente** para la app con la que lo abriste (Archivos, Drive o Chrome).
   Volvé atrás y tocá **Instalar**.
4. Si ya tenías una versión instalada, se actualiza sin borrar nada.
5. Aparece **Doggy-Care** con su ícono en el cajón de aplicaciones.

Si dice “App no instalada”, borrá la versión anterior y volvé a instalar
(pasa si el APK anterior se generó en otra computadora).

## 6. Probar la huella en el APK

Antes: el celular tiene que tener **una huella cargada** (Ajustes del celular → Seguridad →
Huella digital).

1. Abrí **Doggy-Care** e ingresá con tu correo y contraseña.
2. Aparece **“¿Activar ingreso con huella?”**: tocá **Sí, activar** y apoyá el dedo.
   - Si no aparece, andá a **Ajustes → Seguridad → Ingreso con huella** y activalo ahí.
     Si el interruptor está gris, el texto de abajo dice por qué (por ejemplo, que no hay huella cargada).
3. Cerrá la app del todo (deslizala fuera de las apps recientes) y volvé a abrirla:
   tiene que pedir la huella.
4. Probá también:
   - Dejar la app en segundo plano **más de 5 minutos** y volver: pide la huella.
   - Tocar **Cancelar** en el pedido de huella: aparece **“Ingresar con contraseña”**.
   - Apoyar un dedo no registrado **3 veces**: aparece **“Ingresar con contraseña”**.
5. **Ajustes → Seguridad → Cerrar sesión** apaga la huella; al volver a entrar con
   contraseña se ofrece de nuevo.

Si algo falla, la app muestra el error real en pantalla (por ejemplo `biometryNotEnrolled`
o `userCancel`). Anotalo tal cual para revisarlo.

La huella es un **candado de pantalla**: si se olvida o falla, siempre se puede entrar con la
contraseña. Más detalles en `docs/despliegue.md`, sección “Ingreso con huella”.

---

## Ícono y pantalla de inicio

- Fuente única: `assets/logo.png` ("perro feliz en casa", 1254 × 1254). Todo lo demás se genera desde ahí.
- Color de fondo del logo, del ícono adaptativo y de la pantalla de inicio: **#095F58** (teal).
- Para regenerar todo después de cambiar `assets/logo.png`:

  ```bash
  node scripts/generar-iconos.mjs
  npx @capacitor/assets@3.0.5 generate --android --iconBackgroundColor "#095F58" --iconBackgroundColorDark "#095F58" --splashBackgroundColor "#095F58" --splashBackgroundColorDark "#095F58"
  ```

  El primer comando escribe `assets/icon*.png`, `assets/splash*.png`, los íconos de `public/icons/` y el
  ícono monocromo de Android 13+ (`ic_launcher_monochrome.png`). El segundo arma los `mipmap` y la pantalla
  de inicio de Android. Si `@capacitor/assets` reescribe `AndroidManifest.xml` (sólo espacios en blanco),
  descartá ese cambio. Después, `npx cap sync android` y volver a generar el APK.
- Si cambia el logo de la web, subir `CACHE` en `public/sw.js` para que las apps instaladas refresquen los íconos.
