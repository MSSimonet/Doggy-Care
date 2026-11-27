// Versión de 384 px reducida con Lanczos: nítida en pantallas de alta densidad y mucho más liviana que el original de 1254 px
import logoSrc from '../assets/logo-384.png';

/** Logo de la app ("perro feliz en casa"). Decorativo: el nombre ya está escrito al lado. */
export function AppLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={logoSrc}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 rounded-[22%] shadow-md shadow-black/25 ring-1 ring-black/10 ${className}`}
      data-testid="logo-app"
    />
  );
}
