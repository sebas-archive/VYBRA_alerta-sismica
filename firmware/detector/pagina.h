// Página de estado de cada nodo (GET /): HTML autocontenido, sin fuentes ni CDN externos.
// Lee /estado cada 3 s; el número de nodo va fijo al compilar.
#pragma once

#define PAGINA_TXT2(x) #x
#define PAGINA_TXT(x) PAGINA_TXT2(x)

static const char PAGINA[] = R"HTML(<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Detector )HTML" PAGINA_TXT(NODO) R"HTML(</title>
<style>
:root{--fondo:#f4f5f7;--tarjeta:#fff;--texto:#1b1f24;--suave:#5c6570;--linea:#e2e5e9;
--verde:#1f8a4c;--azul:#2563c9;--rojo:#c62f2f;--gris:#6b737c;--aviso:#c62f2f}
@media (prefers-color-scheme:dark){:root{--fondo:#111418;--tarjeta:#1b2026;--texto:#e8ebef;
--suave:#9aa4ae;--linea:#2b323a;--aviso:#ff8080}}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--texto);font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:24px 16px}
h1{margin:0;font-size:28px}
.sub{margin:2px 0 20px;color:var(--suave);font-variant-numeric:tabular-nums}
.pastilla{display:flex;align-items:center;gap:12px;padding:18px 20px;border-radius:16px;
color:#fff;font-size:24px;font-weight:700;background:var(--gris)}
.pastilla::before{content:"";width:14px;height:14px;border-radius:50%;background:#fff;opacity:.9}
.funcionando{background:var(--verde)}.sincronizando{background:var(--azul)}.caido{background:var(--rojo)}
.aviso{margin:10px 0 0;padding:10px 14px;border-radius:10px;border:1px solid var(--aviso);color:var(--aviso);font-weight:600}
.aviso[hidden]{display:none}
dl{margin:20px 0 0;background:var(--tarjeta);border:1px solid var(--linea);border-radius:16px;padding:4px 16px}
dl div{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--linea)}
dl div:first-child{border-top:0}
dt{color:var(--suave)}dd{margin:0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.viejo dl,.viejo .pastilla{opacity:.55}
footer{margin-top:14px;color:var(--suave);font-size:13px;text-align:center}
</style></head><body><main id="m">
<h1>Detector )HTML" PAGINA_TXT(NODO) R"HTML(</h1>
<p class="sub" id="sub">nodo-)HTML" PAGINA_TXT(NODO) R"HTML( · …</p>
<div class="pastilla" id="p">Consultando…</div>
<p class="aviso" id="aviso" hidden>Sin respuesta del nodo</p>
<dl>
<div><dt>Rol</dt><dd id="rol">—</dd></div>
<div><dt>Término</dt><dd id="termino">—</dd></div>
<div><dt>Log</dt><dd id="log">—</dd></div>
<div><dt>Líder</dt><dd id="lider">—</dd></div>
<div><dt>Encendido</dt><dd id="encendido">—</dd></div>
<div><dt>Señal WiFi</dt><dd id="senal">—</dd></div>
<div><dt>Hora</dt><dd id="hora">—</dd></div>
</dl>
<footer id="pie">Se actualiza cada 3 s</footer>
</main><script>
const $=(i)=>document.getElementById(i);
const N=)HTML" PAGINA_TXT(NODO) R"HTML(;
$('sub').textContent='nodo-'+N+' · '+location.hostname;
const ROL={lider:'Líder',seguidor:'Seguidor',candidato:'Candidato'};
const SIT={funcionando:'Funcionando',sincronizando:'Sincronizando',caido:'Apagado'};
function hace(ms){
  const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
  if(d>0)return 'hace '+d+' d '+(h%24)+' h';
  if(h>0)return 'hace '+h+' h '+(m%60)+' min';
  if(m>0)return 'hace '+m+' min';
  return 'hace '+s+' s';
}
function pintar(e){
  const p=$('p'),sit=SIT[e.situacion]?e.situacion:'';
  p.className='pastilla '+sit;
  p.textContent=SIT[sit]||'Desconocido';
  $('sub').textContent='nodo-'+e.nodo+' · '+e.ip;
  $('rol').textContent=ROL[e.rol]||e.rol;
  $('termino').textContent=e.termino;
  $('log').textContent=e.log_len+' / '+e.commit_index+' confirmadas';
  $('lider').textContent=e.lider_conocido?'Servidor '+e.lider_conocido:'ninguno';
  $('encendido').textContent=hace(e.uptime_ms);
  $('senal').textContent=e.rssi?e.rssi+' dBm':'sin WiFi';
  $('hora').textContent=e.con_hora?'sincronizada (NTP)':'sin sincronizar';
}
let ocupado=false;
async function leer(){
  if(ocupado)return;
  ocupado=true;
  const c=new AbortController(),t=setTimeout(()=>c.abort(),2500);
  try{
    const r=await fetch('/estado',{cache:'no-store',signal:c.signal});
    if(!r.ok)throw new Error(r.status);
    pintar(await r.json());
    $('aviso').hidden=true;$('m').classList.remove('viejo');
    $('pie').textContent='Actualizado '+new Date().toLocaleTimeString();
  }catch(_){
    $('aviso').hidden=false;$('m').classList.add('viejo');
  }finally{clearTimeout(t);ocupado=false}
}
leer();setInterval(leer,3000);
</script></body></html>)HTML";
