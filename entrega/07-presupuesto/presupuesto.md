# Presupuesto del proyecto "Alerta Sísmica / VYBRA"

**Versión evaluada:** `v1.0.0-rc1` · **Commit:** `0ee5ed4` · **Fecha de compra y elaboración:** 2026-11-18 (America/Bogota) · **Moneda:** peso colombiano (COP).

Este documento reemplaza el presupuesto estimado anterior. Los costos de hardware y materiales ya no son
precios de lista consultados en la web: son los valores reales de la compra registrada en el comprobante de
Electronilab, **Pedido 60869**, que se incluye en esta carpeta como fuente primaria. Se añade el plan de
datos Claro aportado por el usuario. El presupuesto cubre los tres prototipos físicos del proyecto
descrito en `README.md`: clúster de tres ESP32 con consenso Raft, agregador Node.js, panel ADMIN, vista
CLIENTE, tres servidores de datos con PostgreSQL y controlador de infraestructura.

## Resumen

| Concepto | COP | USD referencial (TRM 3.309,55 · 2026-11-18) |
|---|---:|---:|
| Compra real de hardware y materiales (Electronilab, Pedido 60869) | **189.214** | **57,17** |
| Plan de datos Claro (1 mensualidad de referencia) | **67.000** | **20,24** |
| Software y licencias (open source) | 0 | 0,00 |
| **Total general del proyecto** | **256.214** | **77,42** |

La compra real se descompone en **179.414 COP de ítems + 9.800 COP de envío = 189.214 COP**, que es
exactamente el *Total de la orden* impreso en el comprobante. El total general suma una mensualidad de
referencia del plan de datos Claro. La demo con Docker no requiere compra de hardware: usa los 11 servicios
con nodos simulados y Raft real; este presupuesto documenta el costo de los prototipos físicos y de la
conectividad.

---

> **Alcance del costo.** El sistema completo funciona sin comprar hardware: la demo con Docker levanta los
> 11 servicios con nodos simulados que ejecutan el Raft real. El hardware de esta hoja es el de los **tres
> prototipos físicos** de la campaña; el software es open source y su costo de licencia es **0 COP**.

---

## 1. Fuente primaria: comprobante de compra

| Dato | Valor |
|---|---|
| Archivo | [`comprobante-electronilab-pedido-60869.jpg`](comprobante-electronilab-pedido-60869.jpg) |
| Formato | JPEG, 530 × 686 px, 36.323 bytes (se conserva sin editar) |
| SHA-256 | `890b422f589c60533229859d2440accd37e135899955111ba26333a31edc9c42` |
| Proveedor | Electronilab (Bogotá) |
| Pedido | 60869, estado "Pago confirmado" |
| Fecha de compra | 2026-11-18 |
| Total de la orden | 189.214 COP (subtotal 179.414 + envío 9.800) |
| Soporte fotográfico | Tres fotografías de la recepción: `fotos-componentes-recibidos-1.png`, `-2.png` y `-3.png` (apartado 2) |

El comprobante es la página de confirmación de pago del pedido. Su tabla "Producto / Cantidad / Precio"
muestra, por línea, el **valor total de la línea** (el valor unitario no se imprime): el unitario se deriva
dividiendo ese valor entre la cantidad, y en los cinco ítems la división es exacta, sin residuo. El
comprobante registra el medio de pago como "QR Interoperable o Llave Bre-B" y el envío como "Bogotá
Domicilio".

**Cotejo interno del repositorio.** La tabla "Lo que compraste" de `montaje/montaje_detectores.html`
lista exactamente las mismas cinco líneas, con las mismas cantidades y los mismos valores de línea, y
totaliza **179.414 COP**. Es una comprobación independiente que coincide con el subtotal del comprobante.

## 2. Soporte fotográfico de la compra

Tres fotografías proporcionadas por el autor documentan la recepción de los componentes del Pedido 60869.
Respaldan el inventario del apartado 3 y la procedencia de la compra, pero no intervienen en el cálculo:
los montos siguen siendo los del comprobante y las fotos no alteran ninguna cifra del presupuesto.

| Archivo | Qué muestra |
|---|---|
| [`fotos-componentes-recibidos-1.png`](fotos-componentes-recibidos-1.png) | Paquete de la compra embalado con plástico de burbujas, sobre la mesa de recepción |
| [`fotos-componentes-recibidos-2.png`](fotos-componentes-recibidos-2.png) | Bolsas de empaque con las protoboards MB-102 (Zhong Yi Electronic) y los módulos ESP32-WROOM-32 en sus fundas, con etiquetas de envío de Electronilab |
| [`fotos-componentes-recibidos-3.png`](fotos-componentes-recibidos-3.png) | Placa ESP32 DevKit V1 de 30 pines desempaquetada: módulo ESP32-WROOM-32, conector micro-USB, chip USB-serial (U2) y pulsadores EN/BOOT |

| Archivo | SHA-256 (integridad) |
|---|---|
| `fotos-componentes-recibidos-1.png` | `34088b3dac6a1e64fe06f82675f821ae896f8438319a26e43d3669f2c97589dd` |
| `fotos-componentes-recibidos-2.png` | `3d0ba00e5368a31c394bdf2e3af7c9c34a76b9fbd68fa46358920a1c3794279b` |
| `fotos-componentes-recibidos-3.png` | `6b20df2a423249c9a8e8da03fb25573f86da79fd1ea5287f7447aa321aee619a` |

Procedencia: fotografías proporcionadas por el autor, tomadas en la recepción de la compra de la factura
Electronilab (Pedido 60869). Los tres archivos se copiaron a esta carpeta sin recortar, retocar ni
re-codificar: son PNG de 900 × 1600 px con los SHA-256 de la tabla anterior. Las fotos muestran los
componentes recién recibidos, antes del montaje en protoboard. El comprobante del apartado 1 sigue siendo
la fuente primaria de los montos; el material fotográfico es soporte documental de la entrega del pedido.

## 3. Inventario real y justificación de cantidades

| Ítem | Especificación | Cantidad | Por qué |
|---|---|---|---|
| Board de desarrollo ESP32 | WiFi Bluetooth BLE **CP2102**, 30 pines, micro-USB | 3 | Un nodo por placa; es la placa declarada en `README.md` §3 |
| Pulsador | **B3F-4055**, 4 pines, 12×12×7,3 mm, montaje en protoboard, color negro | 4 | Entrada de eventos simulados, un pulsador entre GPIO4 (D4) y GND por placa (`firmware/detector/detector.ino:2`); el cuarto es repuesto |
| Protoboard | **MB102**, 830 puntos, adhesiva, 16,5 × 5,5 cm | 3 | Una por detector, según `montaje/montaje_detectores.html` |
| Cable jumper Dupont | Macho-macho, 20 cm, paquete de 40 | 1 paquete | Se instalan 6 (2 por nodo, D4 y GND); sobran 34 |
| Cable micro-USB | **30 cm, blindado**, de datos | 3 | Alimentación y carga del firmware; debe ser de datos, no solo de carga |
| PC de desarrollo | Equipo existente (Linux, Docker, Node ≥ 22, `arduino-cli`) | — | Ya se dispone de él; **excluido del costo** |
| Router WiFi | Red 2,4 GHz existente con DHCP y broadcast | — | Ya se dispone de ella; **excluido del costo** |

**No se compraron adaptadores de pared.** La alimentación de las tres placas se hace con los propios
cables micro-USB de datos conectados a los puertos USB del PC; no hay línea de cargador en el comprobante
ni en este presupuesto. Si en el futuro se quisiera alimentar cada nodo de forma independiente de los
puertos del PC, haría falta un adaptador por nodo y ese costo no está incluido.

El montaje real está descrito en `montaje/montaje_detectores.html`: ESP32 y pulsador B3F sobre una
protoboard MB102, con dos cables Dupont y el cable micro-USB. El firmware solo usa además el LED azul
integrado en GPIO2, que no se compra.

## 4. Costos reales de la compra

Precios de compra tomados del comprobante del Pedido 60869. **Ningún ítem de esta tabla es una estimación
ni un precio de lista consultado:** los cinco valores de línea coinciden con los del documento.

| ID | Ítem (línea del comprobante) | Cant. | Valor de línea (COP) | Unitario derivado (COP) | Subtotal (COP) |
|---|---|---:|---:|---:|---:|
| H-01 | Board de desarrollo con ESP32 WiFi Bluetooth BLE CP2102 30 pines | 3 | 113.190 | 37.730 | 113.190 |
| H-02 | Protoboard Adhesiva MB102 830 puntos, 16,5 × 5,5 cm | 3 | 41.700 | 13.900 | 41.700 |
| H-03 | 40 Cables Jumper Dupont Macho-Macho 20 cm | 1 | 9.900 | 9.900 | 9.900 |
| H-04 | Cable Micro USB de 30 cm blindado | 3 | 12.900 | 4.300 | 12.900 |
| H-05 | Micro Botón Pulsador Switch 4 pines 12×12×7,3 mm B3F-4055 negro | 4 | 1.724 | 431 | 1.724 |
| | **Subtotal de ítems** | | | | **179.414** |
| H-06 | Envío Bogotá Domicilio | 1 | 9.800 | 9.800 | **9.800** |
| | **Total de la compra** | | | | **189.214** |

El *Total de la orden* del comprobante (189.214 COP) coincide con la suma verificable de ítems más envío,
de modo que no hay diferencia que documentar.

## 5. Plan de datos Claro

| Concepto | Cantidad | Valor (COP) | Origen |
|---|---:|---:|---|
| Plan de datos Claro | 1 mensualidad de referencia | 67.000 | Dato aportado por el usuario (2026-11-18) |

Este monto **no proviene de un comprobante** adjunto a la entrega: es el dato que el usuario aportó el
2026-11-18 y se registra como el costo mensual de conectividad del proyecto, con **una mensualidad de
referencia**. El plan exacto (nombre comercial, datos incluidos, vigencia y condiciones) depende del
operador y no se documenta aquí; si el plan contratado cambia, la línea cambia en la misma proporción. No
se multiplica por el número de meses de la campaña: el presupuesto registra una unidad de referencia, no
una proyección.

El sistema descrito opera sobre la red WiFi local; el plan de datos se incluye como línea de costo
recurrente de conectividad por solicitud expresa del usuario, no como un requisito técnico de los nodos
durante la demo local.

## 6. Software y licencias

**Costo de licencias: 0 COP.** Todo el software es open source y no se distribuyen binarios de terceros
en el repositorio. Licencias detalladas en [`THIRD-PARTY.md`](../../THIRD-PARTY.md):

| Componente | Licencia | Costo | Uso en el proyecto |
|---|---|---:|---|
| ArduinoJson 7.4.3 | MIT | 0 | JSON del firmware, pruebas y nodo simulado |
| Arduino core ESP32 3.3.12 | LGPL-2.1 | 0 | Compilación del firmware |
| Node.js (≥ 22) | MIT | 0 | Agregador, interfaces y pruebas |
| Alpine Linux (`node:22-alpine`) | MIT y licencias de paquetes | 0 | Contenedor del panel |
| Debian 12 (`debian:bookworm-slim`) | Licencias Debian | 0 | Compilación y contenedor del nodo simulado |
| Fedora Linux 42 (imagen) | Licencias Fedora | 0 | Servidor de datos 1 |
| openSUSE Leap (imagen) | Licencias openSUSE | 0 | Servidor de datos 2 |
| Ubuntu 24.04 (imagen) | Licencias Ubuntu | 0 | Servidor de datos 3 |
| GCC/g++ | GPL-3.0-or-later con excepción de runtime | 0 | Compilación del nodo simulado para Linux |
| Inter (tipografía) | SIL OFL 1.1 | 0 | Tipografía de las interfaces (Google Fonts) |
| PostgreSQL 16.15 | PostgreSQL License | 0 | Bases históricas de los tres servidores de datos |
| Docker Engine / Compose | Apache-2.0 | 0 | Orquestación local de los 11 servicios |
| Caddy 2 | Apache-2.0 | 0 | Perfil opcional `https` con TLS local |

PostgreSQL, Docker y Caddy no figuran en `THIRD-PARTY.md` porque se descargan como imágenes o se instalan
en el equipo y **no se distribuyen con el repositorio**; se listan aquí como software de infraestructura de
costo cero por su licencia libre. No hay licencias pagas, API de pago, dominio ni certificado comercial: el
HTTPS opcional usa una CA local de Caddy.

## 7. Conversión referencial a USD

Tasa de referencia oficial: **3.309,55 COP/USD**, vigencia **2026-11-18** (TRM publicada por la
Superintendencia Financiera de Colombia en el conjunto de datos abierto `TRM` de datos.gov.co,
<https://www.datos.gov.co/resource/32sa-8pi3.json>).

| Concepto | COP | USD (redondeo a 2 decimales) |
|---|---:|---:|
| Compra real (Pedido 60869) | 189.214 | 57,17 |
| Plan de datos Claro | 67.000 | 20,24 |
| Software y licencias | 0 | 0,00 |
| **Total general** | **256.214** | **77,42** |

```
189.214 COP / 3.309,55 COP/USD = 57,17 USD
 67.000 COP / 3.309,55 COP/USD = 20,24 USD
256.214 COP / 3.309,55 COP/USD = 77,42 USD
```

La conversión es **referencial** y de una sola fecha; no es una cotización de compra ni incluye comisiones
de cambio. Si se usa otra tasa, el monto en USD cambia proporcionalmente. El total en USD se calcula sobre
el total en COP y se redondea una sola vez: por eso la suma de las líneas ya redondeadas (57,17 + 20,24 =
77,41) difiere en 0,01 USD del total redondeado (77,42). Esa diferencia es de redondeo, no de suma.

## 8. Comparación con el presupuesto estimado anterior

El presupuesto anterior (242.320 COP ≈ 73,22 USD) era una **estimación de precios de lista** consultados
en tiendas el 2026-11-18, con seis ítems: incluía tres adaptadores de pared USB de 5 V que finalmente **no
se compraron**, cotizaba tres pulsadores sin repuesto y no incluía envío ni conectividad. El presupuesto
actual usa los valores de la compra real.

| Concepto | Anterior (estimado de lista) | Actual (compra real) | Variación (COP) |
|---|---:|---:|---:|
| ESP32 30 pines CP2102 | 3 × 38.500 = 115.500 | 3 × 37.730 = 113.190 | −2.310 |
| Pulsador B3F-4055 | 3 × 440 = 1.320 | 4 × 431 = 1.724 | +404 |
| Protoboard MB102 | 3 × 13.900 = 41.700 | 3 × 13.900 = 41.700 | 0 |
| Jumpers Dupont macho-macho 20 cm | 1 × 7.000 = 7.000 | 1 × 9.900 = 9.900 | +2.900 |
| Cable micro-USB 30 cm | 3 × 4.300 = 12.900 | 3 × 4.300 = 12.900 | 0 |
| Adaptador de pared USB 5 V | 3 × 21.300 = 63.900 | 0 (no se compró) | −63.900 |
| Envío | no incluido | 9.800 | +9.800 |
| **Subtotal de ítems (sin envío)** | **242.320** | **179.414** | **−62.906** |
| **Total de la compra** | **242.320** | **189.214** | **−53.106** |
| Plan de datos Claro | no incluido | 67.000 | +67.000 |
| **Total general del proyecto** | **242.320** | **256.214** | **+13.894** |

Las diferencias se explican por completo con la compra real: el ESP32 se compró a 37.730 COP (no a
38.500), se compraron 4 pulsadores con repuesto (no 3), el paquete de Dupont de 20 cm costó 9.900 COP (no
7.000), no se compró ningún adaptador de pared porque la alimentación es por los cables micro-USB desde el
PC, y el envío a Bogotá quedó incluido en el total de la orden. El plan de datos Claro no existía en el
presupuesto anterior. Por eso el total general sube 13.894 COP aunque la compra de hardware baja 53.106
COP.

## 9. Supuestos

1. Los montos en COP son los del comprobante del Pedido 60869. Los precios del comercio incluyen los
   impuestos aplicables; no se agrega IVA ni otro tributo aparte.
2. El envío de 9.800 COP (Bogotá Domicilio) forma parte del total de la orden y por eso se incluye en el
   costo de la compra; no se cotiza un envío distinto.
3. El plan de datos Claro es un dato aportado por el usuario (2026-11-18); se incluye **una mensualidad de
   referencia**. El plan exacto y sus condiciones dependen del operador.
4. Los costos de hardware son precios de compra reales. No hay ítems estimados presentados como reales.
5. No se compraron adaptadores de pared: la alimentación de los nodos es por los cables micro-USB de datos
   conectados a los puertos USB del PC. Un cargador independiente por nodo sería un costo adicional no
   presupuestado.
6. El PC de desarrollo y el router WiFi 2,4 GHz ya existen y no se compran.
7. El proyecto usa el **pulsador como generador de eventos simulados**; no se compra ningún sensor
   sísmico.
8. No se presupuestan herramientas de taller (cautín, estaño, multímetro, destornilladores): no son
   necesarias para el montaje del pulsador en protoboard y su costo no forma parte del sistema.
9. La compra de Dupont es un paquete de 40 cables; se instalan 6 y sobran 34 de repuesto.
10. Se compraron 4 pulsadores: 3 instalados y 1 de repuesto.
11. La conversión a USD usa la TRM de una sola fecha y no incluye comisiones de cambio ni de pago
    internacional.
12. La fecha de compra y de elaboración del presupuesto es 2026-11-18 (America/Bogota).

## 10. Exclusiones

| Exclusión | Motivo |
|---|---|
| Horas de trabajo del estudiante | Costo no monetario; no se cuantifica |
| Hosting en la nube / VPS | No se usa: el sistema corre en el PC local con Docker |
| Instrumentación sísmica (acelerómetro, geófono, sismógrafo) | No se usa: el evento es simulado con un pulsador |
| PC de desarrollo y router WiFi | Ya existentes |
| Internet del hogar y energía eléctrica | Servicios ya contratados (el plan de datos Claro se registra aparte) |
| Envío e impuestos de la compra | Ya incluidos en el total de la orden: 9.800 COP de envío y precios con impuestos; no se suman de nuevo |
| Licencias de software | Todo open source, 0 COP |
| Campaña física pendiente (T1/T2+) | No genera costo nuevo de material; usa el hardware comprado |

## 11. Comprobación aritmética

La suma se verificó con Python (módulo `Decimal`, sin redondeos intermedios). El registro completo está en
[`verificacion-sumas.txt`](verificacion-sumas.txt) e incluye una comprobación independiente que lee este
Markdown y el CSV:

```
H-01  3 x 37.730 = 113.190
H-02  3 x 13.900 =  41.700
H-03  1 x  9.900 =   9.900
H-04  3 x  4.300 =  12.900
H-05  4 x    431 =   1.724
Subtotal de items    = 179.414
Envio Bogota         =   9.800
TOTAL COMPRA         = 189.214   (coincide con el Total de la orden del comprobante)
PLAN CLARO           =  67.000
SOFTWARE             =       0
TOTAL GENERAL        = 256.214
189.214 / 3.309,55 = 57,17 USD
 67.000 / 3.309,55 = 20,24 USD
256.214 / 3.309,55 = 77,42 USD
```

El total del CSV (`presupuesto.csv`, filas `tipo=hardware` más la fila de envío) coincide con el total de
esta tabla y con el resumen del documento.

## 12. Fuentes

| Fuente | Referencia | Qué se tomó | Fecha |
|---|---|---|---|
| Comprobante de compra Electronilab | [`comprobante-electronilab-pedido-60869.jpg`](comprobante-electronilab-pedido-60869.jpg), Pedido 60869 | Los cinco valores de línea, subtotal 179.414, envío 9.800 y total 189.214 COP | 2026-11-18 |
| Material fotográfico del autor | [`fotos-componentes-recibidos-1.png`](fotos-componentes-recibidos-1.png) a `-3.png` | Recepción de los componentes del Pedido 60869: soporte documental, no se usa para calcular montos | 2026-11-18 |
| Repositorio | `montaje/montaje_detectores.html` | Cotejo interno: mismas cinco líneas y mismo subtotal de 179.414 COP | 2026-11-18 |
| Repositorio | `THIRD-PARTY.md`, `README.md` §3, `docs/prueba-hardware.md` §0, `firmware/detector/detector.ino` | Licencias, placa declarada y conexión del pulsador | 2026-11-18 |
| datos.gov.co (Superfinanciera) | <https://www.datos.gov.co/resource/32sa-8pi3.json> | TRM 3.309,55 COP/USD, vigencia 2026-11-18 | 2026-11-18 |
| Dato del usuario | Comunicación del 2026-11-18 | Plan de datos Claro: 67.000 COP (1 mensualidad de referencia) | 2026-11-18 |

Los precios de lista que aparecían en el presupuesto anterior se retiraron del presupuesto vigente y no se
usan como fuente de este documento. La única cifra histórica que se conserva es el total estimado anterior
(242.320 COP), citado solo para explicar la diferencia en el apartado 8.

## 13. Archivos de esta carpeta

| Archivo | Contenido |
|---|---|
| `presupuesto.md` | Este documento |
| `presupuesto.csv` | Tabla de costos legible por máquina (ítems reales, envío, plan, software y exclusiones) |
| `verificacion-sumas.txt` | Registro de la comprobación aritmética, del cotejo con la factura y de la conversión a USD |
| `comprobante-electronilab-pedido-60869.jpg` | Fuente primaria: comprobante del Pedido 60869 (se conserva sin editar) |
| `fotos-componentes-recibidos-1.png`, `-2.png` y `-3.png` | Soporte fotográfico de la recepción de la compra (apartado 2); no alteran las cifras |
