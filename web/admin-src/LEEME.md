# Fuente de VYBRA ADMIN

Interfaz React/Vite de ADMIN. Se compila hacia `web/public/admin/` y la sirve `web/server.js`.

    npm ci        # primera vez
    npm run build # genera ../public/admin

- Modo en vivo: si `/api/estado` responde, usa la foto real del clúster (`/api/stream`, `src/live.ts`).
- Sin servidor (o con `?demo`), usa el simulador de escenarios, rotulado DEMOSTRACIÓN.
- CLIENTE (`web/public/cliente/`) usa la misma fuente (`js/vivo.js`); `?demo=ok|warn|err` fuerza el modo de ensayo.
- Rutas: `/` → `/admin/`, `/publico` → `/cliente/`; las vistas anteriores siguen en `/operador.html` y `/cliente.html`.
