# Seguridad

Resumen de la revisión de seguridad del proyecto (noviembre de 2026). Se revisó el código de `src/`, las
migraciones y políticas de `supabase/`, la configuración de Capacitor y Android, los scripts y las dependencias.
No incluye detalles explotables ni datos del despliegue.

## Modelo

- **Un solo administrador.** La app se usa con un único usuario de Supabase Auth.
- **Clave pública en el cliente.** El cliente web y Android usa la clave pública de Supabase, que está pensada para estar en el cliente.
- **Protección de los datos.** Las tablas tienen Row Level Security. Las políticas sólo permiten leer y escribir al administrador autenticado (`auth.uid()` fijo). El rol `anon` no tiene permisos sobre las tablas.
- **Escrituras.** Todas pasan por una cola persistente (`src/lib/colaPendientes.ts`), que reintenta sin conexión y nunca descarta cambios en silencio.

## Corregido en esta revisión

| Área | Cambio |
|---|---|
| Android | `allowBackup="false"`: la copia local de la agenda y el directorio ya no entra en los respaldos automáticos del sistema. |
| Web (Vercel) | Encabezados `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Strict-Transport-Security`. |
| Dependencias | `npm audit` sin vulnerabilidades conocidas. Se quitaron 4 dependencias sin uso. |
| Esquema inicial | `supabase_schema.sql` ya no crea políticas abiertas. Crea las mismas políticas de sólo-administrador que `001_auth_rls.sql`. |
| Datos | Los datos de ejemplo, las pruebas y la documentación usan nombres, teléfonos y direcciones ficticios. |

## Límites conocidos

- **Datos en el dispositivo.** La app guarda una copia local de los datos para funcionar sin conexión (`localStorage` del WebView). Se borra al cerrar sesión. Quien tenga el teléfono desbloqueado puede verla.
- **Bloqueo con huella.** Es un candado de la interfaz. No cifra los datos.
- **Modo privacidad.** Oculta teléfonos, direcciones, familiares y dueños en pantalla y en las exportaciones. Es una ayuda visual, no un control de acceso.

## Reportar un problema

Ver [`SECURITY.md`](../SECURITY.md).
