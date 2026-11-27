import { MessageCircle } from 'lucide-react';
import { usePrivacy } from './PrivacyProvider';

export function whatsappUrl(contact: string): string {
  return `https://wa.me/549${contact.replace(/\D/g, '')}`;
}

/**
 * Acceso a WhatsApp. Con el modo privacidad activo no hay href ni texto con el número en la página:
 * es un botón que arma la dirección recién al tocarlo.
 */
export function WhatsAppLink({ contact }: { contact: string }) {
  const { isPrivacyMode } = usePrivacy();
  const className =
    'text-sm px-2 py-0.5 rounded-lg bg-exito/15 hover:bg-exito/20 text-exito border border-exito flex items-center gap-1 font-semibold transition-colors cursor-pointer';
  const content = (
    <>
      <MessageCircle className="w-3.5 h-3.5 text-exito" aria-hidden="true" />
      <span>WhatsApp</span>
    </>
  );

  if (isPrivacyMode) {
    return (
      <button
        type="button"
        onClick={() => window.open(whatsappUrl(contact), '_blank', 'noopener,noreferrer')}
        aria-label="Abrir WhatsApp"
        data-testid="whatsapp"
        className={className}
      >
        {content}
      </button>
    );
  }
  return (
    <a href={whatsappUrl(contact)} target="_blank" rel="noreferrer" title="Abrir WhatsApp" data-testid="whatsapp" className={className}>
      {content}
    </a>
  );
}
