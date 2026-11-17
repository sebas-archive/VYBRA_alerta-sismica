# Diagnóstico del pulsador del Nodo 2 (S2) — previo a repetir T1

Fecha: 2026-11-17. **Sin pulsaciones nuevas, sin generar eventos, sin modificar firmware, cableado,
configuración, NVS ni registros.** Evidencias de T1 conservadas.

## 1. Cómo detecta el pulsador el firmware

| Aspecto | Implementación real | Evidencia |
|---|---|---|
| Pin | **GPIO4 (D4)** | `detector.ino:50` |
| Configuración eléctrica | `INPUT_PULLUP`: **pull-up interno** (~45 kΩ) y pulsador **a GND**; activo en bajo | `detector.ino:707` |
| LED | GPIO2 (integrado) | `detector.ino:51`, `:707-708` |
| Antirrebote | **20 ms por software** (`ANTIRREBOTE_MS`) | `detector.ino:54`, `:532` |
| Detección de flanco | Sondeo en `loop()` (≈ cada 1 ms + `delay(1)`): guarda `cambioCrudo` cuando el nivel crudo cambia; `pulsando == crudo` corta la repetición | `detector.ino:526-534` |
| Medición | Al soltar: `ms = cambioCrudo - tPulso` | `detector.ino:536-537` |
| Mínimo aceptado | **80 ms**; los pulsos más cortos se **ignoran y no se imprimen** | `detector.ino:52`, `:540` |
| Máximo para el botón físico | **No hay** (el tope de 60 s solo aplica a `POST /pulsar`) | `detector.ino:53`, `:622` |
| Nivel / PGA | `nivel = min(10, 1 + ms/450)`; `pga = 0.028·nivel + 0.015` | `sismo.cpp:6-9`, `detector.ino:514-515` |
| Id del evento | `nodo-N-<arranque>-<contador>` | `detector.ino:509-510` |
| Mensaje serie | `pulso %lu ms -> %s nivel %d: %s` — **solo si el evento se propone** (≥80 ms) | `detector.ino:522` |

**Consecuencia clave:** una pulsación sostenida de ~900 ms debe producir **un único** evento de
~900 ms (`nivel 3`). No hay tope de duración ni temporizador que la corte.

## 2. Reconstrucción temporal de lo observado en T1

`ev.t` se fija en el instante de **soltar** (`proponerPulso` se llama al liberar).

| Evento | Índice | id | Duración | Inicio estimado | Liberación (`t`) |
|---|---|---|---|---|---|
| 1 | 2 | `nodo-2-f7eee098-1` | 301 ms | 17:31:14.053 | **17:31:14.354** |
| 2 | 3 | `nodo-2-f7eee098-2` | 174 ms | 17:31:17.403 | **17:31:17.577** |

- Hueco entre la **liberación 1** y la **liberación 2**: **3,223 s**.
- Hueco entre la liberación 1 y el **inicio del segundo cierre**: **3,049 s**.
- Ninguno de los dos eventos se acerca a 900 ms; la suma es 475 ms.

**Deducción:** el firmware registró **dos cierres independientes** del contacto, separados ~3 s.
Ni un rebote ni una pulsación mantenida explican ese patrón:

- Si el contacto hubiera rebotado durante una pulsación de 900 ms, los fragmentos estarían
  separados por **milisegundos**, no por 3 s.
- Si el contacto se hubiera quedado cerrado, habría un solo evento de ~900 ms.

Por tanto el problema está en la **actuación/contacto**, no en el cálculo de nivel ni en el consenso.

## 3. Qué aporta y qué no aporta la captura serie

| Aporta | No aporta |
|---|---|
| Hora exacta de cada `pulso` y su `resultado` | Los pulsos **<80 ms no se imprimen**: el rebote rápido es invisible por serie |
| Confirmar cuántos eventos aceptó el firmware | Distinguir si fue doble pulsación humana o contacto defectuoso |
| Ver sucesos simultáneos (elecciones, etc.) | Estado eléctrico del pin entre flancos |

**La misma información ya está en `/log`.** Para diagnosticar el contacto hacen falta pruebas
físicas (LED, multímetro, foto del cableado) además de la captura.

## 4. Captura pasiva preparada (sin abrir el puerto)

**Riesgo detectado y evitado:** abrir `/dev/ttyUSBx` hace que el driver `cp210x` afirme DTR/RTS.
En esta placa **RTS está cableado a EN** (comprobado: el reinicio por RTS que usamos en Fase 3
provocaba un arranque). Abrir el puerto podría **dejar el nodo en reset o reiniciarlo**, lo que
además provocaría una elección. Por eso **no se abre el tty**.

**Solución implementada:** `entrega/05-pruebas/scripts/fis-usbmon-captura.sh` lee el tráfico USB
desde `usbmon` (kernel), sin abrir el dispositivo y sin tocar líneas de control.

**Verificación de no interferencia (dry-run de 8 s, sin pulsar):**

| Comprobación | Resultado |
|---|---|
| Captura ejecutada | OK — 42.773 B crudos del bus 1 (tráfico de otros dispositivos) |
| Dispositivos CP2102 con datos | 0 (esperado: sin eventos no hay salida serie) |
| `uptime_ms` de los tres nodos | **creciente y monótono** (ninguno se reinició) |
| Término / `log_len` / `commit_index` | 739 / 3 / 3 en los tres, sin cambios |
| Quórum / líder | true / 2 (sin cambios) |

El script también decodifica el hex de usbmon a texto y aísla las líneas `pulso ...`.

## 5. Prueba controlada propuesta (para cuando se autorice)

1. Lanzar en segundo plano: `bash entrega/05-pruebas/scripts/fis-usbmon-captura.sh 60`
2. **Mantener pulsado ~1 s** y **observar el LED azul del S2**:
   - Mientras el firmware cree que está pulsado, el LED **parpadea rápido** (~80 ms).
   - Si el parpadeo **se detiene a mitad de la pulsación** (queda fijo o pasa a 1 Hz), el contacto
     se abrió: queda demostrada la intermitencia.
3. Soltar y esperar 3 s.
4. Criterio de contacto sano: **una sola línea** `pulso ~900 ms -> nodo-2-… nivel 3: aceptada`,
   `/log` pasa a índice 4 y `log_len/commit = 4`.
   Contacto defectuoso: **dos líneas** `pulso` (como en T1).

## 6. Causas posibles (por probabilidad) y acción correctiva

| # | Causa | Cómo confirmarla | Acción correctiva |
|---|---|---|---|
| 1 | **Cables dupont flojos/oxidados** en D4 o GND de la protoboard | Reasentar y repetir; continuidad con multímetro | Reasentar/sustituir los dos jumpers |
| 2 | **Táctil de 4 patas cableado en la pareja equivocada** (internamente hay dos pares unidos) | Revisar que las patas usadas sean **diagonales** | Recablear en diagonal |
| 3 | **Pulsador desgastado/sucio** (contacto intermitente) | LED que deja de parpadear durante la pulsación | Sustituir el pulsador |
| 4 | **Ruido eléctrico** en cables largos | Repetir con cables cortos | **100 nF** entre D4 y GND (filtro hardware; τ≈4,5 ms con el pull-up interno) |
| 5 | **Antirrebote de 20 ms insuficiente** para este pulsador | Solo si 1–4 no lo explican | Subir `ANTIRREBOTE_MS` a 30–50 ms (**requiere reflash y tu autorización**) |

**Recomendación concreta:** (a) foto del cableado y prueba de continuidad con multímetro;
(b) reasentar/sustituir los dupont y verificar el cableado diagonal; (c) añadir 100 nF entre D4 y
GND; (d) repetir **una** pulsación controlada con la captura pasiva; (e) solo si persiste, evaluar
subir el antirrebote por firmware.

## 7. Estado actual

- Nodos 1/2/3: término 739, `log_len=3`, `commit=3`, `pendientes=0`, quórum 3/3, líder 2.
- Agregador activo (PID 531438).
- No se generaron eventos nuevos; no se usó `/control`; no se reinició ni flasheó nada.
- `usbmon` queda cargado para la siguiente captura; se puede retirar con `sudo modprobe -r usbmon`.
- Evidencias de T1 intactas en `entrega/05-pruebas/` y `entrega/04-evidencias/`.
