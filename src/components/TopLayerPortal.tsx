import React, { useState } from 'react';
import { createPortal } from 'react-dom';

// Avisos flotantes: con un <dialog> modal abierto, lo que está fuera queda inerte y debajo,
// así que se montan dentro del diálogo abierto más alto.
export function TopLayerPortal({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  React.useLayoutEffect(() => {
    const open = document.querySelectorAll('dialog[open]');
    const next = open.length ? open[open.length - 1] : document.body;
    if (next !== host) setHost(next);
  });
  return host && host.isConnected ? createPortal(children, host) : null;
}
