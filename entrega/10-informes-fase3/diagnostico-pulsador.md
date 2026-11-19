# Diagnóstico del pulsador del Nodo 2 (S2) — previo a repetir T1

| Dato | Valor |
|---|---|
| Fecha del diagnóstico | 2026-11-17 |
| Revisión y actualización | **2026-11-18** (commit `0ee5ed4`); no se ejecutaron pulsaciones nuevas |
| Alcance | Solo lectura y análisis: **sin pulsaciones nuevas, sin generar eventos, sin modificar firmware, cableado, configuración, NVS ni registros**. Las evidencias de T1 se conservan |
| Resultado que motiva el diagnóstico | T1 **no aprobada**: una pulsación produjo dos eventos cortos (301 ms y 174 ms, separados 3,2 s) en lugar de uno de ~900 ms |
| Evidencia primaria | `entrega/05-pruebas/logs/FIS-01-verificacion.txt`; `entrega/05-pruebas/datos/FIS-01-post-nodo{1,2,3}-log.json` |

**Rutas:** las citas de archivo y línea son relativas a la raíz del repositorio salvo que se indique otra cosa; los enlaces entre informes son relativos a esta carpeta.


---

## 1. Cómo detecta el pulsador el firmware

| Aspecto | Implementación real (verificada en el código actual) | Evidencia |
|---|---|---|
| Pin | **GPIO4 (D4)** | `firmware/detector/detector.ino:50` |
| Configuración eléctrica | `INPUT_PULLUP`: pull-up interno (~45 kΩ) y pulsador **a GND**; activo en bajo | `firmware/detector/detector.ino:707` |
| LED | GPIO2 (integrado) | `firmware/detector/detector.ino:51`; `firmware/detector/detector.ino:684-691` |
| Antirrebote | **20 ms por software** (`ANTIRREBOTE_MS`) | `firmware/detector/detector.ino:54`; `firmware/detector/detector.ino:532` |
| Detección de flanco | Sondeo en `loop()`: guarda `cambioCrudo` cuando el nivel crudo cambia; `pulsando == crudo` corta la repetición | `firmware/detector/detector.ino:526-535`; estado en `firmware/detector/detector.ino:102-105` |
| Medición | Al soltar: `ms = cambioCrudo - tPulso` | `firmware/detector/detector.ino:538-539` |
| Mínimo aceptado | **80 ms** (`PULSO_MIN_MS`); los pulsos más cortos se ignoran y no se imprimen | `firmware/detector/detector.ino:52`; `firmware/detector/detector.ino:540` |
| Máximo para el botón físico | **No hay** (el tope de 60 s, `PULSO_MAX_MS`, solo aplica a `POST /pulsar`) | `firmware/detector/detector.ino:53`; `firmware/detector/detector.ino:622` |
| Nivel / PGA | `nivel = min(10, 1 + ms/450)`; `pga = 0.028·nivel + 0.015` | `firmware/detector/src/nucleo/sismo.cpp:6-9`; `firmware/detector/detector.ino:514-515` |
| Id del evento | `nodo-N-<arranque>-<contador>` | `firmware/detector/detector.ino:509-510` |
| Mensaje serie | `pulso %lu ms -> %s nivel %d: %s` — solo si el evento se propone (≥ 80 ms) | `firmware/detector/detector.ino:522` |
| LED mientras se pulsa | Parpadeo rápido (~80 ms) | `firmware/detector/detector.ino:687` |

**Consecuencia clave:** una pulsación sostenida de ~900 ms debe producir **un único** evento de
~900 ms (`nivel 3`). No hay tope de duración ni temporizador que la corte.

---

## 2. Reconstrucción temporal de lo observado en T1

`ev.t` se fija en el instante de **soltar** (`proponerPulso` se llama al liberar,
`firmware/detector/detector.ino:507-524`). Valores tomados del log del nodo 2 (idénticos en los tres nodos).

| Evento | Índice | id | Duración | `t` (ms epoch, NTP) | Inicio estimado | Liberación |
|---|---|---|---|---|---|---|
| 1 | 2 | `nodo-2-f7eee098-1` | **301 ms** | 1794954674354 | 17:31:14.053 | **17:31:14.354** |
| 2 | 3 | `nodo-2-f7eee098-2` | **174 ms** | 1794954677577 | 17:31:17.403 | **17:31:17.577** |

- Hueco entre la **liberación 1** y la **liberación 2**: **3,223 s**.
- Hueco entre la liberación 1 y el **inicio del segundo cierre**: **3,049 s**.
- Ninguno de los dos eventos se acerca a 900 ms; la suma es 475 ms.

**Deducción:** el firmware registró **dos cierres independientes** del contacto, separados ~3 s. Ni un
rebote ni una pulsación mantenida explican ese patrón:

- Si el contacto hubiera rebotado durante una pulsación de 900 ms, los fragmentos estarían
  separados por **milisegundos**, no por 3 s.
- Si el contacto se hubiera quedado cerrado, habría un solo evento de ~900 ms.

Por tanto el problema está en la **actuación/contacto**, no en el cálculo de nivel ni en el consenso.
La verificación de T1 lo confirma: los tres nodos comparten los ids, el nivel y el PGA calculados
coinciden con la fórmula para las duraciones medidas (`nivel 1`, `pga 0.043`), y no se generó alerta
(`entrega/05-pruebas/logs/FIS-01-verificacion.txt`).

---

## 3. Qué aporta y qué no aporta la captura serie

| Aporta | No aporta |
|---|---|
| Hora exacta de cada `pulso` y su `resultado` | Los pulsos **< 80 ms no se imprimen**: el rebote rápido es invisible por serie |
| Confirmar cuántos eventos aceptó el firmware | Distinguir si fue doble pulsación humana o contacto defectuoso |
| Ver sucesos simultáneos (elecciones, etc.) | Estado eléctrico del pin entre flancos |

**La misma información ya está en `/log`.** Para diagnosticar el contacto hacen falta pruebas
físicas (LED, multímetro, foto del cableado) además de la captura.

---

## 4. Captura pasiva preparada (sin abrir el puerto)

**Riesgo detectado y evitado:** abrir `/dev/ttyUSBx` hace que el driver `cp210x` afirme DTR/RTS. En
esta placa RTS está cableado a EN (comprobado en la fase anterior: el reinicio por RTS provocaba un
arranque). Abrir el puerto podría dejar el nodo en reset o reiniciarlo, lo que además provocaría una
elección. Por eso **no se abre el tty**.

**Solución implementada:** `entrega/05-pruebas/scripts/fis-usbmon-captura.sh` lee el tráfico USB
desde `usbmon` (kernel), sin abrir el dispositivo y sin tocar líneas de control.

**Verificación de no interferencia (dry-run de 8 s, sin pulsar, 2026-11-17):**

| Comprobación | Resultado |
|---|---|
| Captura ejecutada | OK — 42 773 B crudos del bus 1 (tráfico de otros dispositivos) |
| Dispositivos CP2102 con datos | 0 (esperado: sin eventos no hay salida serie) |
| `uptime_ms` de los tres nodos | Creciente y monótono (ninguno se reinició) |
| Término / `log_len` / `commit_index` | 739 / 3 / 3 en los tres, sin cambios |
| Quórum / líder | true / 2 (sin cambios) |

El script también decodifica el hex de usbmon a texto y aísla las líneas `pulso ...`.

---

## 5. Prueba controlada propuesta (para cuando se autorice)

1. Lanzar en segundo plano: `bash entrega/05-pruebas/scripts/fis-usbmon-captura.sh 60`
2. **Mantener pulsado ~1 s** y **observar el LED azul del S2**:
   - Mientras el firmware cree que está pulsado, el LED **parpadea rápido** (~80 ms,
     `firmware/detector/detector.ino:687`).
   - Si el parpadeo **se detiene a mitad de la pulsación** (queda fijo o pasa a 1 Hz), el contacto
     se abrió: queda demostrada la intermitencia.
3. Soltar y esperar 3 s.
4. Criterio de contacto sano: **una sola línea** `pulso ~900 ms -> nodo-2-… nivel 3: aceptada`,
   el `/log` pasa al índice siguiente y `log_len`/`commit` avanzan de a uno.
   Contacto defectuoso: **dos líneas** `pulso` (como en T1).

No se ha ejecutado esta prueba el 2026-11-18. Requiere hardware conectado y autorización.

---

## 6. Causas posibles (por probabilidad) y acción correctiva

| # | Causa | Cómo confirmarla | Acción correctiva |
|---|---|---|---|
| 1 | **Cables dupont flojos/oxidados** en D4 o GND de la protoboard | Reasentar y repetir; continuidad con multímetro | Reasentar o sustituir los dos jumpers |
| 2 | **Pulsador de 4 patas cableado en la pareja equivocada** (internamente hay dos pares unidos) | Revisar que las patas usadas sean **diagonales** | Recablear en diagonal |
| 3 | **Pulsador desgastado o sucio** (contacto intermitente) | LED que deja de parpadear durante la pulsación | Sustituir el pulsador |
| 4 | **Ruido eléctrico** en cables largos | Repetir con cables cortos | **100 nF** entre D4 y GND (filtro hardware; τ ≈ 4,5 ms con el pull-up interno) |
| 5 | **Antirrebote de 20 ms insuficiente** para este pulsador | Solo si 1–4 no lo explican | Subir `ANTIRREBOTE_MS` a 30–50 ms (requiere reflashear y autorización) |

**Recomendación concreta:** (a) foto del cableado y prueba de continuidad con multímetro;
(b) reasentar o sustituir los dupont y verificar el cableado diagonal; (c) añadir 100 nF entre D4 y
GND; (d) repetir **una** pulsación controlada con la captura pasiva; (e) solo si persiste, evaluar
subir el antirrebote por firmware.

---

## 7. Estado del diagnóstico el 2026-11-18

- El diagnóstico se mantiene: no ha aparecido evidencia nueva que lo contradiga y no se han hecho
  pulsaciones nuevas. T1 sigue **no aprobada**; la repetición depende de revisar el contactor y de la
  autorización (`pendientes.md` §1).
- La campaña física quedó en P0 completada (2026-11-17 17:25 -05:00,
  `entrega/05-pruebas/logs/FIS-00-p0.txt`) y T1 ejecutada y verificada con fallos
  (`entrega/05-pruebas/logs/FIS-01-verificacion.txt`).
- No se tocó el firmware del pulsador, ni el cableado, ni la NVS. La única prueba en curso con el
  stack Docker es software (nodo simulado con Raft real) y no altera este diagnóstico.
- Las tres placas quedaron con `término` 739 y `log_len`/`commit_index` 3 tras T1; ese estado
  pertenece a la sesión física del 2026-11-17 y no se ha vuelto a consultar el hardware el
  2026-11-18.
- `usbmon` podía retirarse con `sudo modprobe -r usbmon`; no se registró su estado el 2026-11-18.
- Evidencias de T1 intactas en `entrega/05-pruebas/` y `entrega/04-evidencias/`.
