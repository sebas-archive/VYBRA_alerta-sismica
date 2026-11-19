# Pendientes del usuario y decisiones abiertas

**Actualizado:** 2026-11-18 (America/Bogota), commit `0ee5ed4`, versión declarada `v1.0.0-rc1`.
**Alcance:** solo se enumeran pendientes reales, con la evidencia disponible. Nada de esta lista se ha
inventado. Los puntos ya resueltos (licencia MIT, retirada del material histórico, rotación de la clave
del portal en el repositorio) no se incluyen como pendientes; su estado se documenta en
[`plan-normalizacion-git.md`](plan-normalizacion-git.md) y en [`informe-fase3.md`](informe-fase3.md) §H.

**Rutas:** las citas de archivo y línea son relativas a la raíz del repositorio salvo que se indique otra cosa; los enlaces entre informes son relativos a esta carpeta.


---

## 1. Campaña física (bloqueante para `v1.0.0` definitiva)

| # | Pendiente | Estado y qué falta exactamente |
|---|---|---|
| F-1 | **Repetir T1** (evento con pulsador) | **T1 no aprobada** el 2026-11-17: una pulsación produjo dos eventos cortos (301 ms y 174 ms, separados 3,2 s) en lugar de uno de ~900 ms. El sistema replicó y confirmó correctamente (ids distintos e idénticos en los 3 nodos; `log_len`/`commit_index` 1→3) y no creó alerta, que es lo correcto con un solo detector. Antes de repetir hay que revisar el contactor/cableado del pulsador y ejecutar **una** pulsación controlada con la captura pasiva. Plan en [`diagnostico-pulsador.md`](diagnostico-pulsador.md) §§5-6. Evidencia: `entrega/05-pruebas/logs/FIS-01-verificacion.txt` |
| F-2 | **Autorización de T2 en adelante** | Pendiente de autorización del docente/usuario. Incluye el resto de casos de `docs/prueba-hardware.md` que requieren acción física (pulsar, desenchufar, reiniciar el router) |
| F-3 | **Conexión de las tres ESP32** para la repetición | Las placas se conectaron y flashearon el 2026-11-17 (`entrega/04-evidencias/D-nodos/log-NOD-10-flasheo-nodo*.txt`; P0 en `entrega/05-pruebas/logs/FIS-00-p0.txt`); no consta que estén conectadas en la sesión del 2026-11-18. Requiere hardware disponible y los puertos USB |
| F-4 | **Red WiFi 2,4 GHz con DHCP, broadcast y sin aislamiento de clientes** | El clúster funcionó con la red configurada el 2026-11-17 (`entrega/04-evidencias/D-nodos/log-NOD-16-verificacion-integral.txt` §1-2). Debe confirmarse que esa red sigue disponible y que el router no aísla clientes (el descubrimiento usa broadcast UDP 4211) |
| F-5 | **Métricas físicas que faltan** | No se midieron: failover físico, pérdida de quórum física, reelección real, reinicio de router y latencias reales por nodo (RES-01/03/07/08/09). La resincronización y la recuperación solo están comprobadas en la demo Docker (`test:infra`, 2026-11-18) |
| F-6 | **Etiqueta `v1.0.0` definitiva** | Se etiquetará después de completar F-1 a F-5. Hoy solo existe `v1.0.0-rc1`, que apunta a `f567487` (49 commits por detrás de `HEAD`); ver [`plan-normalizacion-git.md`](plan-normalizacion-git.md) §2.2 |

---

## 2. Datos académicos (bloquean el documento final, no la técnica)

Estos datos no se pueden inferir del repositorio; el documento técnico los deja como
`[PENDIENTE: dato del usuario]`.

| # | Dato | Uso |
|---|---|---|
| A-1 | Institución, programa y asignatura | Portada del documento técnico |
| A-2 | Nombre del docente | Portada |
| A-3 | Integrantes (nombres completos) | Portada |
| A-4 | Fecha de entrega | Portada |
| A-5 | Título oficial del proyecto | Portada y video |
| A-6 | Rúbrica, plantilla institucional, extensión y formato de citas | Forma del documento |

---

## 3. Video de sustentación

| # | Pendiente | Estado |
|---|---|---|
| V-1 | **Grabar el video** | No grabado. El guion, el storyboard y la presentación de apoyo se entregan como material; la grabación depende del usuario. El stack Docker real está disponible para la demo en `http://127.0.0.1:8095/admin/` y `/publico` |

---

## 4. Presupuesto

| # | Pendiente | Estado |
|---|---|---|
| P-1 | **Precios de hardware y materiales** | **RESUELTO el 2026-11-18:** el presupuesto ya no usa estimaciones de mercado; se apoya en la **factura real** Electronilab Pedido 60869 (`comprobante-electronilab-pedido-60869.jpg`, fuente primaria) más el plan de datos Claro, con sumas verificadas. Total 256.214 COP ≈ 77,42 USD en [`07-presupuesto`](../07-presupuesto/presupuesto.md) (véase `07-presupuesto/presupuesto.md`, `presupuesto.csv` y `verificacion-sumas.txt`) |

---

## 5. Decisiones abiertas

| # | Decisión | Estado real verificado el 2026-11-18 | Opciones |
|---|---|---|---|
| D-1 | **Repositorio remoto** | **Ya existe y está publicado**: `origin` = `https://github.com/sebas-archive/alerta-sismica-raft-esp32.git`, **privado**; `main` remoto = `0ee5ed4` (push verificado con `git ls-remote` y con `gh repo view`). Lo abierto no es crearlo, sino decidir su visibilidad/publicación definitiva y si se mantiene privado tras la entrega | Mantener privado; publicar; archivar |
| D-2 | **Clave antigua en el historial de Git** | **Mitigada en el repositorio**: el historial vigente sustituyó las apariciones por `[REDACTADO]`; no se encuentra la clave real en el historial alcanzable ni en los objetos no alcanzables. **Riesgo residual fuera del repositorio**: los bundles de respaldo previos a la reescritura en `/home/t1an/respaldos/` conservan la historia antigua (59 commits, autoría anterior) y en ellos sí aparece un valor candidato a la clave antigua. No se reprodujo el valor | Retirar/regrabar los respaldos antes de compartir; conservarlos solo localmente; documentar su existencia al entregar |
| D-3 | **Semántica del «quórum» del agregador** | Sigue siendo una **inferencia** (≥ 2 nodos disponibles que reconocen al mismo líder), no validación de consenso (`README.md:423-424`). Se documenta como limitación; no se ha renombrado en la interfaz | Renombrar en la UI («nodos con líder común»); recalcular mayoría real; dejarlo documentado |
| D-4 | **Privacidad de identificadores en el repositorio** | El repositorio es privado y conserva el SSID en `firmware/detector/config.h` y las MAC en `firmware/placas.conf` (parcialmente truncadas). Las evidencias usan marcadores `[MAC-N1]`, `[IP-N2]`, `[SSID]`. `firmware/detector/secretos.h` y `.env` están ignorados por Git | Mantener el repositorio privado; o sustituir SSID/MAC por marcadores antes de publicar |
| D-5 | **Re-etiquetado de `v1.0.0-rc1`** | El tag actual apunta a `f567487` (2026-11-17), está 49 commits por detrás de `HEAD` y su mensaje cita cifras de la fase que hoy no describen el sistema. No se ha movido ni recreado el tag | Dejar el tag histórico; crear un tag nuevo en `HEAD`; moverlo (reescritura de refs, requiere decisión) |

**No se incluyen aquí** la licencia (MIT ya decidida y creada en `LICENSE`), la retirada del material
de diseño histórico (ejecutada el 2026-11-18) ni la rotación de la clave del portal en el código
(hecha en la Fase 3): son decisiones resueltas.

---

## 6. Limitaciones técnicas aceptadas (no son pendientes de corrección en esta entrega)

Documentadas en `README.md:411-426` y en `informe-fase4.md` §14: evento simulado con pulsador, log de
Raft no durable, resincronización de emergencia, sin snapshots, sin seguridad de transporte, sin
pre-vote ni check-quorum, `ForwardAck` al aceptar y quórum inferido. Corregirlas es trabajo futuro,
no un requisito de la entrega actual.
