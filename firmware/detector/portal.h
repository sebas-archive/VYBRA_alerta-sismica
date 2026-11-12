// Página del portal de configuración WiFi (la placa crea su propia red y esta página
// deja elegir la red y escribir la contraseña). HTML autocontenido, sin recursos externos.
#pragma once

static const char PORTAL_CABECERA[] = R"HTML(<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configurar WiFi</title>
<style>
:root{--fondo:#f4f5f7;--tarjeta:#fff;--texto:#1b1f24;--suave:#5c6570;--linea:#d5d9de;--acento:#2563c9}
@media(prefers-color-scheme:dark){:root{--fondo:#14171a;--tarjeta:#1d2125;--texto:#e8eaed;--suave:#9aa3ad;--linea:#323941;--acento:#6ea0f5}}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--texto);font:16px/1.4 system-ui,sans-serif;padding:16px}
main{max-width:440px;margin:0 auto}
h1{font-size:20px;margin:8px 0 4px}
p{color:var(--suave);margin:4px 0 16px}
form,.caja{background:var(--tarjeta);border:1px solid var(--linea);border-radius:12px;padding:16px}
.red{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--linea);border-radius:10px;margin-bottom:8px;cursor:pointer}
.red:has(input:checked){border-color:var(--acento);box-shadow:0 0 0 1px var(--acento)}
.red input{accent-color:var(--acento);width:18px;height:18px;margin:0}
.red b{flex:1;overflow-wrap:anywhere;font-weight:600}
.red small{color:var(--suave);white-space:nowrap}
label.campo{display:block;font-weight:600;margin:16px 0 6px}
input[type=text],input[type=password]{width:100%;padding:12px;border:1px solid var(--linea);border-radius:10px;background:var(--fondo);color:var(--texto);font:inherit}
button{width:100%;margin-top:16px;padding:14px;border:0;border-radius:10px;background:var(--acento);color:#fff;font:600 16px system-ui}
a{color:var(--acento)}
.ver{display:flex;gap:8px;align-items:center;margin-top:8px;color:var(--suave);font-size:14px}
</style></head><body><main>
)HTML";

static const char PORTAL_PIE[] = R"HTML(
</main></body></html>
)HTML";
