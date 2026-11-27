import { useEffect } from 'react';
import { Fingerprint } from 'lucide-react';
import { AppLogo } from './AppLogo';
import * as huella from '../lib/huella';

// Error real de la huella (WebAuthn: name y message), visible y no sólo en la consola
export function AvisoErrorHuella({ texto }: { texto: string }) {
  return (
    <div role="alert" data-testid="aviso-error-huella" className="rounded-xl border border-error/50 bg-error/10 p-3 text-base text-texto text-left break-words">
      {texto}
    </div>
  );
}
// Candado de pantalla: se muestra al abrir la app y al volver de segundo plano con la huella activada
export function PantallaDesbloqueo({
  estado,
  pidiendo,
  pedirAlAbrir,
  onHuella,
  onContrasena
}: {
  estado: huella.EstadoDesbloqueo;
  pidiendo: boolean;
  pedirAlAbrir: boolean;
  onHuella: (automatico?: boolean) => void;
  onContrasena: () => void;
}) {
  useEffect(() => {
    if (pedirAlAbrir) onHuella(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-fondo text-texto flex items-center justify-center p-4" data-testid="pantalla-desbloqueo">
      <div className="w-full max-w-sm bg-superficie border border-borde rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
        <div className="space-y-3">
          <AppLogo size={88} className="mx-auto" />
          <h1 className="text-xl font-bold text-texto">Doggy Care está bloqueada</h1>
          <p className="text-texto-sec text-base">Usá tu huella para entrar.</p>
        </div>
        <p role="status" aria-live="polite" className="text-base text-texto min-h-6">
          {estado.mensaje}
        </p>
        {estado.detalle && <AvisoErrorHuella texto={`Error: ${estado.detalle}`} />}
        <div className="flex flex-col gap-3">
          {estado.puedeReintentar && (
            <button
              type="button"
              data-testid="desbloquear-huella"
              disabled={pidiendo}
              onClick={() => onHuella()}
              className="w-full min-h-12 px-4 rounded-xl bg-acento hover:bg-acento-hover disabled:opacity-60 text-acento-fg font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Fingerprint className="w-5 h-5" aria-hidden="true" />
              <span>{pidiendo ? 'Esperando la huella…' : 'Desbloquear con huella'}</span>
            </button>
          )}
          {estado.ofrecerContrasena && (
            <button
              type="button"
              data-testid="ingresar-con-contrasena"
              onClick={onContrasena}
              className={`w-full min-h-12 px-4 rounded-xl font-semibold text-base transition-colors cursor-pointer ${
                estado.puedeReintentar
                  ? 'border border-borde-fuerte bg-superficie-alt hover:bg-realce text-texto'
                  : 'bg-acento hover:bg-acento-hover text-acento-fg font-bold'
              }`}
            >
              Ingresar con contraseña
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
