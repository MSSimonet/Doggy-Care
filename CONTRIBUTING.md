# Cómo contribuir

1. Hacé un fork y una rama desde `main` (`feat/…`, `fix/…`).
2. `npm install` y `npm run demo` para trabajar con datos ficticios.
3. Antes de abrir el PR: `npm run typecheck`, `npm test` y `npm run build` en verde.
4. Commits en formato *conventional commits* (`feat:`, `fix:`, `refactor:`, `docs:`…), en español.
5. Nunca subas datos reales de clientes, `.env*` con valores, respaldos ni planillas: el `.gitignore` los cubre, revisalo igual.
6. Si tocás la interfaz, corré `npm run medir` con el demo levantado: contraste, foco y controles de 44 px no pueden empeorar.
