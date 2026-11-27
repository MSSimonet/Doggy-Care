import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { enmascarar, loadPrivacyMode, savePrivacyMode, type DatoPrivado } from '../lib/privacidad';

interface PrivacyValue {
  isPrivacyMode: boolean;
  togglePrivacy: () => void;
  /** Devuelve el dato, o su máscara si el modo privacidad está activo. */
  mask: (tipo: DatoPrivado, valor: string | null | undefined) => string;
}

const PrivacyContext = createContext<PrivacyValue | null>(null);

/** Estado global del modo privacidad, guardado en el dispositivo. */
export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(loadPrivacyMode);

  const togglePrivacy = useCallback(() => {
    setIsPrivacyMode(prev => {
      const next = !prev;
      savePrivacyMode(next);
      return next;
    });
  }, []);

  const value = useMemo<PrivacyValue>(() => ({
    isPrivacyMode,
    togglePrivacy,
    mask: (tipo, valor) => enmascarar(tipo, valor, isPrivacyMode)
  }), [isPrivacyMode, togglePrivacy]);

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy debe usarse dentro de <PrivacyProvider>');
  return ctx;
}
