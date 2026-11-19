# 3. Montaje físico de los tres detectores

Los tres detectores se arman igual y se prueban de a uno. Cada detector es un ESP32 DevKit V1 de 30 pines sobre una protoboard MB102, un pulsador B3F-4055 entre GPIO4 (D4) y GND, dos cables Dupont y un cable micro-USB de datos. El firmware usa D4 como entrada, GND como referencia y el LED azul integrado en GPIO2; no hay más cableado (`firmware/detector/detector.ino:1-2,50-51,707-708`).

El evento sísmico es simulado: el pulsador cierra el circuito de D4 a GND y el firmware calcula la duración. No hay acelerómetro ni medición real de movimiento (`firmware/detector/detector.ino:1-5`). La geometría de filas y columnas de este capítulo toma la hoja `montaje/montaje_detectores.html`; los pines, los tiempos y el comportamiento salen del firmware real; el código de ejemplo de esa hoja no se usa.

> **Aviso.** El sistema no detecta sismos reales. Toda la campaña física se hace con pulsaciones y el panel rotula el resultado como simulacro.

## 3.1 Piezas y cantidades

La compra real es el Pedido 60869 de Electronilab (Bogotá), documentado en `entrega/07-presupuesto/presupuesto.csv` y `entrega/07-presupuesto/presupuesto.md`. Los precios de la {{TABLA:T-MON-PIEZAS}} son valores de factura. El valor unitario se deriva del valor de línea dividido entre la cantidad, y en los cinco ítems la división es exacta (`entrega/07-presupuesto/presupuesto.md:103-117`).

[[TABLA:T-MON-PIEZAS|Piezas, cantidades y costo real de la compra del Pedido 60869. Fuente: entrega/07-presupuesto/presupuesto.csv, filas H-01 a H-06.]]
| Ítem | Especificación | Compra | Usa | Sobra | Costo real (COP) |
|---|---|---:|---:|---:|---:|
| ESP32 DevKit V1 | WiFi y Bluetooth, CP2102, 30 pines, micro-USB | 3 | 3 | 0 | 113.190 |
| Protoboard MB102 | Adhesiva, 830 puntos, 16,5 x 5,5 cm | 3 | 3 | 0 | 41.700 |
| Jumpers Dupont | Macho-macho, 20 cm, paquete de 40 | 1 | 6 | 34 | 9.900 |
| Cable micro-USB | 30 cm, blindado, de datos | 3 | 3 | 0 | 12.900 |
| Pulsador B3F-4055 | 4 patas, 12 x 12 x 7,3 mm, negro | 4 | 3 | 1 | 1.724 |
| Subtotal de ítems | Suma de hardware | | | | 179.414 |
| Envío | Bogotá Domicilio | 1 | 0 | 0 | 9.800 |
| Total de la orden | Pedido 60869, ítems más envío | | | | 189.214 |

El cuarto pulsador es repuesto: uno por placa y uno de reserva. De los 40 jumpers se instalan 6, dos por detector, y sobran 34 (`entrega/07-presupuesto/presupuesto.csv`, filas H-03 y H-05). No se compraron adaptadores de pared: la alimentación de las tres placas sale de los puertos USB del PC o de un cargador USB de 5 V que ya se tenga (`entrega/07-presupuesto/presupuesto.md:94-96`).

El cable USB debe ser de datos, no de solo carga. Con un cable de carga la placa enciende, pero el PC no crea el puerto serie y la carga del firmware falla (`docs/prueba-hardware.md:31-39`, `entrega/06-manual/conexion-esp32.md:64-80`).

## 3.2 Herramientas

La {{TABLA:T-MON-HERR}} lista lo que se usa. Las herramientas de taller no están en el presupuesto: el presupuesto excluye cautín, estaño, multímetro y destornilladores porque no se compraron para el proyecto (`entrega/07-presupuesto/presupuesto.md:232`).

[[TABLA:T-MON-HERR|Herramientas necesarias y opcionales para el montaje. Fuente: docs/prueba-hardware.md y entrega/06-manual/manual-instalacion-y-ejecucion.md:91-92.]]
| Herramienta | Uso en el montaje | Necesidad |
|---|---|---|
| PC con puerto USB | Alimentar, cargar el firmware y leer el monitor serie | Obligatoria |
| `arduino-cli` 1.5.1 y core `esp32:esp32` 3.3.12 | Compilar y cargar el firmware | Obligatoria |
| Cable micro-USB de datos | Alimentación y flasheo de cada placa | Obligatoria |
| Multímetro con continuidad | Comprobar D4 contra GND y descartar cortos | Recomendada |
| Pinzas o alicate de punta fina | Enderezar una pata doblada sin forzar el módulo | Opcional |
| Rotulador permanente o etiquetas | Marcar SIS-D1, SIS-D2 y SIS-D3 | Obligatoria |
| Cinta de doble faz | Fijar la protoboard a una base | Opcional |

No se necesita cautín, estaño ni resistencias. El firmware activa el pull-up interno del ESP32 y el antirrebote se hace por software (`firmware/detector/detector.ino:54,707`). Versiones verificadas de las herramientas en `entrega/06-manual/manual-instalacion-y-ejecucion.md:91-92`: `arduino-cli` 1.5.1 y core `esp32:esp32` 3.3.12.

## 3.3 Plano de la protoboard

La MB102 de 830 puntos tiene 63 columnas y 10 filas (a-j), más cuatro regletas de alimentación de 50 agujeros cada una: 63 x 10 = 630, más 4 x 50 = 200, total 830. Dentro de una mitad, los cinco agujeros de una misma columna están unidos; el canal central separa la mitad a-e de la mitad f-j. La {{FIG:FIG-MON-01}} muestra el plano visto desde arriba.

[[FIG:FIG-MON-01|Vista superior de la protoboard MB102 con el ESP32 en las columnas 1 a 15, el pulsador en d24, d26, g24 y g26, el jumper azul j5 a j26 y el jumper negro j2 a a24. Fuente: elaboración propia con la geometría de montaje/montaje_detectores.html y los pines de firmware/detector/detector.ino:50-51,707-708.]]

La figura muestra las columnas 1 a 30; las columnas 31 a 63 quedan libres. El dibujo no está a escala: la posición de cada agujero es exacta y el tamaño de las piezas es ilustrativo. Las regletas de alimentación no se usan en este montaje y aparecen solo como referencia de la placa.

El ESP32 se inserta con el conector USB hacia la columna 1, de modo que el cable sale por el borde izquierdo sin tapar la protoboard. Sus dos hileras de 15 pines caen en la fila a y en la fila i, en las columnas 1 a 15. El cuerpo del módulo queda sobre las filas b a h y deja libre la fila j, que se usa para pasar los cables.

El pulsador va en las columnas 24 y 26, con dos patas en la fila d y dos en la fila g. El cuerpo cruza el canal central. Las columnas 16 a 30 quedan libres para el cableado.

Los dos cables de cada detector:

- Jumper azul: de j5 a j26. La columna 5 une i5 (D4) con j5 en la mitad inferior, y la columna 26 une j26 con g26 en la misma mitad. El cable conecta D4 con la pata g26 del pulsador.
- Jumper negro: de j2 a a24. La columna 2 une i2 (GND) con j2 en la mitad inferior, y la columna 24 une a24 con d24 en la mitad superior. El cable conecta GND con la pata d24 y rodea el pulsador por la derecha.

Los ocho agujeros con conexión eléctrica del montaje son i2, i5, j2, j5, a24, d24, g26 y j26. La {{FIG:FIG-MON-01}} los marca en amarillo. Los 30 agujeros de las filas a e i, columnas 1 a 15, llevan los pines del módulo y no se cablean. Los agujeros de las filas b a h quedan debajo del cuerpo del ESP32 y no se usan. El resto de la placa queda libre.

> **Aviso de seguridad.** Antes de conectar el USB, revisa que no haya ningún cable entre i1 (3V3) y i2 (GND), ni entre a1 (VIN) y a2 (GND). Un corto entre alimentación y GND puede dañar la placa o el puerto USB del PC.

## 3.4 Posición de cada pieza y mapa de pines

La {{TABLA:T-MON-PIEZAS2}} fija la posición de cada pieza. La {{TABLA:T-MON-PINES}} recorre las 30 posiciones del zócalo del módulo. La serigrafía impresa en la placa es la referencia final: si una etiqueta no coincide, manda la placa.

[[TABLA:T-MON-PIEZAS2|Posición de cada pieza dentro de la protoboard, por detector. Fuente: montaje/montaje_detectores.html:114-140 y firmware/detector/detector.ino:50-51,707-708.]]
| Pieza | Posición | Cantidad por detector | Función en el circuito |
|---|---|---|---|
| ESP32 DevKit V1 | Filas a e i, columnas 1 a 15; USB hacia la columna 1 | 1 | Controlador, WiFi, LED azul en GPIO2 |
| Pulsador B3F-4055 | d24, d26, g24 y g26; cuerpo sobre el canal | 1 | Cierra GPIO4 contra GND al presionar |
| Jumper azul | j5 a j26 | 1 | Une D4 (i5) con la pata g26 |
| Jumper negro | j2 a a24 | 1 | Une GND (i2) con la pata d24 |
| Cable micro-USB | Conector USB del módulo | 1 | Alimentación y datos |
| Etiqueta SIS-D1, SIS-D2 o SIS-D3 | Borde de la protoboard, junto al USB | 1 | Identificación del nodo |

[[TABLA:T-MON-PINES|Mapa de las 30 posiciones del zócalo del ESP32 DevKit V1 y uso de cada pin en este montaje. Fuente: serigrafía del módulo y firmware/detector/detector.ino:50-51,707-708.]]
| Posición | Serigrafía | Uso en este montaje |
|---|---|---|
| a1 | VIN | No se conecta |
| a2 | GND | No se conecta |
| a3 | D13 | No se conecta |
| a4 | D12 | No se conecta |
| a5 | D14 | No se conecta |
| a6 | D27 | No se conecta |
| a7 | D26 | No se conecta |
| a8 | D25 | No se conecta |
| a9 | D33 | No se conecta |
| a10 | D32 | No se conecta |
| a11 | D35 | No se conecta |
| a12 | D34 | No se conecta |
| a13 | VN | No se conecta |
| a14 | VP | No se conecta |
| a15 | EN | No se conecta |
| i1 | 3V3 | No se conecta |
| i2 | GND | GND del pulsador, por el jumper negro j2 a a24 |
| i3 | D15 | No se conecta |
| i4 | D2 | GPIO2, LED azul integrado; no se cablea |
| i5 | D4 | GPIO4, entrada del pulsador, por el jumper azul j5 a j26 |
| i6 | RX2 | No se conecta |
| i7 | TX2 | No se conecta |
| i8 | D5 | No se conecta |
| i9 | D18 | No se conecta |
| i10 | D19 | No se conecta |
| i11 | D21 | No se conecta |
| i12 | RX0 | No se conecta |
| i13 | TX0 | No se conecta |
| i14 | D22 | No se conecta |
| i15 | D23 | No se conecta |

Solo se usan tres pines: GND en i2, el LED interno en GPIO2 y la entrada del pulsador en GPIO4. El resto del zócalo queda libre y no se cablea. El pinout completo de las 30 posiciones está en el anexo B.

El firmware fija los pines y los tiempos del pulsador en las primeras líneas de `detector.ino`:

```cpp
const int PIN_BOTON = 4;
const int PIN_LED = 2;
const uint32_t PULSO_MIN_MS = 80;           // toques más cortos se ignoran
const uint32_t PULSO_MAX_MS = 60000;        // tope para POST /pulsar
const uint32_t ANTIRREBOTE_MS = 20;
```

Archivo: `firmware/detector/detector.ino` (líneas 50-54).

En `setup()` se declara la entrada con pull-up interno y la salida del LED:

```cpp
pinMode(PIN_BOTON, INPUT_PULLUP);
pinMode(PIN_LED, OUTPUT);
```

Archivo: `firmware/detector/detector.ino` (líneas 707-708).

El pull-up interno mantiene D4 en HIGH mientras el pulsador está suelto. Al presionar, D4 se une a GND y el firmware mide el tiempo de la pulsación al soltar. El tope de 60 s solo aplica al endpoint `POST /pulsar`; el botón físico no tiene tope (`firmware/detector/detector.ino:53,526-541,622`).

## 3.5 El pulsador y la conexión en diagonal

El B3F-4055 tiene cuatro patas, cuerpo de 12 x 12 mm y 7,3 mm de alto (`entrega/07-presupuesto/presupuesto.csv`, fila H-05). Dos patas están en un lado del cuerpo y dos en el lado opuesto. Por dentro, las patas de un mismo lado comparten contacto; al presionar se unen los dos lados. La {{FIG:FIG-MON-02}} muestra la posición y las tres orientaciones posibles.

[[FIG:FIG-MON-02|Pulsador B3F-4055 sobre el canal: patas en d24, d26, g24 y g26, conexión en diagonal entre d24 y g26 y las orientaciones que funcionan. Fuente: elaboración propia con montaje/montaje_detectores.html:143-177 y firmware/detector/detector.ino:50,54,707.]]

La conexión se hace en diagonal: un cable llega a d24 y el otro a g26. Así cada cable toca un lado distinto del pulsador y el contacto abre y cierra el circuito sin importar cuál par de patas viene unido por dentro. La regla de la hoja de montaje coincide: la diagonal funciona en las dos formas en que el botón encaja cruzando el canal (`montaje/montaje_detectores.html:140,173,177`).

La {{TABLA:T-MON-ORIENT}} resume las orientaciones. El cuerpo del pulsador debe quedar sobre el canal central, con las patas hacia las filas d y g y los lados lisos hacia las columnas.

[[TABLA:T-MON-ORIENT|Orientaciones del pulsador sobre la protoboard y resultado eléctrico. Fuente: montaje/montaje_detectores.html:143-177.]]
| Orientación | ¿Encaja? | Resultado |
|---|---|---|
| Como se dibuja, patas en d y g | Sí | Funciona: D4 en g26 y GND en d24 |
| Girado 180 grados | Sí | Funciona: la diagonal sigue siendo d24 y g26 |
| Girado 90 grados | No | Las patas no cruzan el canal y el cuerpo no apoya |

No lleva resistencia. El pull-up está dentro del ESP32 y se activa con `INPUT_PULLUP` (`firmware/detector/detector.ino:707`). El firmware filtra el rebote con 20 ms de antirrebote y descarta los pulsos de menos de 80 ms (`firmware/detector/detector.ino:52-54,526-541`).

Una pulsación de 900 ms produce un evento de nivel 3: el firmware calcula `nivel = min(10, 1 + ms / 450)` y `pga = 0,028 x nivel + 0,015` (`firmware/detector/src/nucleo/sismo.cpp:6-9`, `firmware/detector/detector.ino:514-515`). El monitor serie imprime la línea `pulso 900 ms -> ... nivel 3: ...` (`firmware/detector/detector.ino:522`).

Si se cablean dos patas del mismo lado, D4 queda unido a GND de forma permanente. El firmware lee LOW al arrancar, abre el portal de configuración a los 3 s y el LED parpadea rápido sin parar, sin generar eventos (`firmware/detector/detector.ino:255-266,526-535,684-691`). Es un error fácil de confundir con una placa dañada.

> **Aviso.** Mantén la pulsación al menos 80 ms. Los toques más cortos se descartan a propósito y no producen evento.

La campaña del 2026-11-17 registró dos eventos de 301 ms y 174 ms en lugar de uno de unos 900 ms. El diagnóstico atribuye el patrón al contacto del pulsador, recomienda revisar el cableado diagonal, reasentar o sustituir los jumpers y, si persiste, sustituir el pulsador (`entrega/10-informes-fase3/diagnostico-pulsador.md`, secciones 5 y 6). El resultado de la campaña y su estado se documentan en la sección 5.7.

## 3.6 Secuencia de montaje paso a paso

La secuencia se repite para cada detector. No se pasa al siguiente paso sin cumplir el criterio "Hecho cuando".

1. **Cuenta e inspecciona las piezas.** Sobre la mesa deben estar 3 placas ESP32, 3 protoboards, 4 pulsadores, el paquete de jumpers y 3 cables USB de datos. Hecho cuando: el inventario coincide con la {{TABLA:T-MON-PIEZAS}} y ninguna pata del módulo ni del pulsador está doblada.
2. **Orienta la protoboard.** Coloca el canal central en horizontal, la fila a arriba y la columna 1 a la izquierda. Hecho cuando: lees las filas a-e en la mitad superior, f-j en la inferior y los números 1 a 63 en el borde.
3. **Inserta el ESP32.** Con el conector micro-USB hacia la columna 1, introduce las dos hileras de 15 pines en a1-a15 e i1-i15. Presiona con los dos pulgares, repartiendo la fuerza. Hecho cuando: el USB sobresale por el borde izquierdo, no queda ninguna pata fuera de su agujero y el módulo no se balancea.
4. **Comprueba la fila de pines.** Verifica en la serigrafía que i1 es 3V3, i2 es GND, i5 es D4 y a15 es EN. Hecho cuando: las etiquetas coinciden con la {{TABLA:T-MON-PINES}} y el módulo está plano sobre la protoboard.
5. **Coloca el pulsador.** Introduce las cuatro patas en d24, d26, g24 y g26, con el cuerpo sobre el canal y los lados lisos hacia las columnas. Hecho cuando: las cuatro patas entran firmes, el cuerpo cruza el canal y el pulsador no gira con el dedo.
6. **Monta el jumper azul.** Conecta un extremo en j5 y el otro en j26. Hecho cuando: los dos extremos están dentro del agujero y el cable pasa por la fila j sin tocar las patas del pulsador, salvo la columna 26.
7. **Monta el jumper negro.** Conecta un extremo en j2 y el otro en a24, rodeando el pulsador por la derecha. Hecho cuando: los dos extremos están firmes, el cable no tapa el pulsador y no se cruza con el jumper azul.
8. **Revisa la continuidad.** Con el multímetro en continuidad, mide entre i2 (GND) e i5 (D4). Sin pulsar debe haber circuito abierto; con el pulsador apretado, continuidad. Hecho cuando: la medida cambia al presionar y no hay continuidad permanente.
9. **Descarta cortos.** Mide entre i1 (3V3) e i2 (GND) y entre a1 (VIN) y a2 (GND). Hecho cuando: no hay continuidad en ninguna de las dos parejas.
10. **Conecta el USB.** Conecta el cable de datos al ESP32 y al PC. Hecho cuando: se enciende el LED de alimentación de la placa y el sistema crea `/dev/ttyUSB0` (`lsusb`, `dmesg`).
11. **Da permisos al puerto.** Si el puerto no es accesible, aplica `sudo setfacl -m u:"$USER":rw /dev/ttyUSB0`. Hecho cuando: `arduino-cli board list` lista la placa y el puerto.
12. **Carga el firmware del detector N.** Ejecuta `./cargar.sh N` desde `firmware/` (compilación y flasheo en la sección 6.16). Hecho cuando: la salida termina con `== Listo: detector N (SIS-DN) cargado.` (`firmware/cargar.sh:104`).
13. **Lee el arranque.** Abre el monitor serie a 115200. Hecho cuando: aparecen `Detector nodo-N (Raft)`, la línea `nodo-N conectado a la red, IP x.x.x.x` y `término guardado T, voto V` (`firmware/detector/detector.ino:302,710,726`).
14. **Etiqueta la protoboard.** Escribe SIS-DN en el borde, junto al USB, y anota MAC, puerto e IP. Hecho cuando: la etiqueta es visible y la placa quedó registrada en `firmware/placas.conf` (`docs/prueba-hardware.md:47-52`).
15. **Prueba la pulsación.** Mantén el pulsador unos 900 ms y suéltalo. Hecho cuando: el LED parpadea rápido mientras pulsas y el monitor imprime `pulso` con nivel 3; si no aparece nada, revisa el paso 8.
16. **Repite con las otras dos placas.** Desconecta la primera, monta la segunda y cambia N en `./cargar.sh N`. Hecho cuando: las tres protoboards están montadas, etiquetadas y probadas, cada una con su número.

## 3.7 Las tres protoboards y su etiqueta

Las tres protoboards son idénticas en piezas y posiciones. La diferencia se graba al compilar: `./cargar.sh N` compila con `-DNODO=N` (`firmware/cargar.sh:79`) y el arranque imprime `Detector nodo-N (Raft)` (`firmware/detector/detector.ino:710`). La {{FIG:FIG-MON-03}} muestra las tres con su etiqueta.

[[FIG:FIG-MON-03|Las tres protoboards idénticas etiquetadas SIS-D1, SIS-D2 y SIS-D3, con su nodo y su servidor de datos preferido. Fuente: elaboración propia con firmware/cargar.sh:79, detector.ino:710 y web/config.js:28.]]

La {{TABLA:T-MON-TRES}} resume la correspondencia entre etiqueta, nodo, firmware y servidor de datos preferido.

[[TABLA:T-MON-TRES|Correspondencia entre etiqueta, nodo, firmware y servidor de datos preferido. Fuente: firmware/cargar.sh:79, detector.ino:710, web/config.js:28-31 y docker-compose.yml:115,128,141.]]
| Etiqueta | Nodo | Compilación | Banner del monitor | Servidor de datos preferido | Registro |
|---|---|---|---|---|---|
| SIS-D1 | nodo-1 | `./cargar.sh 1` con `-DNODO=1` | `Detector nodo-1 (Raft)` | Servidor 1 | `firmware/placas.conf` |
| SIS-D2 | nodo-2 | `./cargar.sh 2` con `-DNODO=2` | `Detector nodo-2 (Raft)` | Servidor 2 | `firmware/placas.conf` |
| SIS-D3 | nodo-3 | `./cargar.sh 3` con `-DNODO=3` | `Detector nodo-3 (Raft)` | Servidor 3 | `firmware/placas.conf` |

La etiqueta física se escribe en el borde de la protoboard, junto al conector USB. La relación placa, MAC y número de nodo se registra con `./quien.sh --registrar N -p /dev/ttyUSBx` al flashear, y queda en `firmware/placas.conf` (`docs/prueba-hardware.md:45-52`, `firmware/cargar.sh:102-104`). Los registros de la campaña muestran el mensaje final del flasheo en `entrega/04-evidencias/D-nodos/log-NOD-10-flasheo-nodo1.txt:148` y en los archivos equivalentes de los nodos 2 y 3.

La columna "servidor de datos preferido" es una asignación de despliegue, no una constante del firmware. Cada servidor de datos consulta al ESP32 del mismo número a 1 Hz (`web/servidor/recolector.js:1-5`); en Docker, el servidor N apunta a `NODO_URL` del nodo N (`docker-compose.yml:115,128,141`) y `web/config.js:26-31` lo deja escrito. El nodo no envía eventos a un servidor: replica por Raft con los otros nodos en UDP 4210 (`firmware/detector/config.h:21`) y responde por HTTP en el puerto 80.

El cuarto pulsador no se instala: queda de repuesto para sustituir uno desgastado. Las tres protoboards se pueden fijar con cinta de doble faz a una base cuando el montaje ya funcione; la MB102 es adhesiva (`entrega/07-presupuesto/presupuesto.csv`, fila H-02).

## 3.8 Alimentación y primera conexión USB

Cada placa se alimenta por su conector micro-USB con 5 V. La compra incluye tres cables micro-USB de 30 cm blindados y de datos (`entrega/07-presupuesto/presupuesto.csv`, fila H-04), y no incluye adaptadores de pared (`entrega/07-presupuesto/presupuesto.md:94-96`). Durante el montaje y el flasheo, el cable va al PC; después del flasheo la placa puede quedar en el mismo PC o pasar a un cargador USB de 5 V.

El LED de alimentación de la placa se enciende al conectar el USB. El LED azul es distinto: está en GPIO2 y lo controla el firmware, así que su comportamiento es una comprobación del arranque y no de la alimentación.

La conexión se comprueba en este orden:

```bash
lsusb | grep -iE "cp210|ch34|silicon|qinheng"
ls -l /dev/ttyUSB* /dev/ttyACM*
dmesg | tail -5
sudo usermod -aG dialout "$USER"            # una vez; cerrar sesión y volver a entrar
sudo setfacl -m u:"$USER":rw /dev/ttyUSB0   # permiso inmediato, repetir tras reconectar
arduino-cli board list
```

Fuente: `docs/prueba-hardware.md:31-39` y `entrega/06-manual/conexion-esp32.md:62-80`. En Linux el chip CP2102 usa el driver `cp210x` incluido en el kernel y no requiere instalación; si la placa trae CH340, el driver es `ch341` (`entrega/06-manual/conexion-esp32.md:73-80`).

> **Aviso de seguridad.** No inyectes tensión por los pines 3V3 ni VIN de la placa con el cable USB conectado. La alimentación del montaje entra por el conector micro-USB.

No conectes las tres placas al mismo puerto USB a la vez para flashear: el script detecta varias y se detiene (`firmware/cargar.sh:50-53`). Flashea y prueba una placa por vez; después, las tres pueden quedar encendidas a la vez para formar el clúster.

## 3.9 Verificación del montaje

La {{TABLA:T-MON-VERIF}} se completa en el orden indicado antes de pasar al siguiente detector. Al terminar las tres, el montaje está verificado.

[[TABLA:T-MON-VERIF|Comprobaciones del montaje, resultado esperado y acción si falla. Fuente: docs/prueba-hardware.md:31-39,157 y firmware/detector/detector.ino:302,522,684-691,710,726.]]
| Comprobación | Cómo se comprueba | Resultado esperado | Si falla |
|---|---|---|---|
| Alimentación | Conectar el USB | LED de alimentación encendido | Cambiar cable o puerto |
| Puerto serie | `lsusb`, `dmesg`, `/dev/ttyUSB*` | CP2102 detectado y puerto creado | Usar cable de datos, revisar driver |
| Permisos | `ls -l /dev/ttyUSB0` | El usuario puede leer y escribir | `dialout` o `setfacl` |
| Carga del firmware | `./cargar.sh N` | `== Listo: detector N (SIS-DN) cargado.` | Revisar `secretos.h` y puerto |
| Banner de arranque | Monitor serie 115200 | `Detector nodo-N (Raft)` | Reiniciar la placa |
| Red WiFi | Monitor serie | `nodo-N conectado a la red, IP x.x.x.x` | Revisar SSID, clave y portal |
| Persistencia Raft | Monitor serie | `término guardado T, voto V` | Revisar NVS o reflashear |
| Pulsación corta | Pulsar menos de 80 ms | No aparece ninguna línea `pulso` | Correcto, se descarta |
| Pulsación de 900 ms | Mantener y soltar | `pulso` con nivel 3 y LED rápido al pulsar | Revisar cableado diagonal |
| Sin cortos | Multímetro entre i1 e i2 | Sin continuidad | Retirar el puente y revisar |
| LED con líder | Esperar 8 a 20 s con las tres encendidas | LED azul fijo en las tres | Revisar red, ver 3.10 |

El LED azul tiene un comportamiento definido por el firmware. La {{TABLA:T-MON-LED}} lo resume y la función que lo controla se copia a continuación.

[[TABLA:T-MON-LED|Comportamiento del LED azul de GPIO2 y su causa en el firmware. Fuente: firmware/detector/detector.ino:247,259,276,294-296,684-691.]]
| Estado | Comportamiento del LED | Causa en el firmware |
|---|---|---|
| Sin alimentación | Apagado | Placa sin 5 V |
| Conectando WiFi al arrancar | Alterna cada 250 ms | Espera de conexión |
| Ventana de doble reinicio | Parpadeo lento, 500 ms | Comprobación de reinicio doble |
| Botón mantenido al encender | Parpadeo rápido, 100 ms | Espera para abrir el portal |
| Portal de configuración abierto | Parpadeo rápido, 150 ms | Modo portal |
| Pulsando | Parpadeo rápido, 80 ms | El firmware cree que el botón está pulsado |
| Con líder conocido | Fijo encendido | `raft->lider() != 0` |
| Sin líder | Parpadeo a 1 Hz, 500 ms | Nodo sin líder |
| Caído o sin WiFi | Apagado | `raft->caido()` o WiFi desconectado |

```cpp
void actualizarLed(uint64_t ahora) {
  bool encendido;
  if (raft->caido() || WiFi.status() != WL_CONNECTED) encendido = false;
  else if (pulsando) encendido = (ahora / 80) % 2;
  else if (raft->lider() != 0) encendido = true;
  else encendido = (ahora / 500) % 2;
  digitalWrite(PIN_LED, encendido ? HIGH : LOW);
}
```

Archivo: `firmware/detector/detector.ino` (líneas 684-691).

La verificación de la red y del clúster tiene su propio detalle en la sección 8. En este capítulo basta con que cada placa arranque, se conecte y responda a la pulsación. El criterio de éxito del clúster completo es exactamente un nodo con rol de líder y los tres con el mismo término (`docs/prueba-hardware.md:157`, `entrega/06-manual/conexion-esp32.md:222-232`).

> **Aviso.** El LED fijo no significa "detector listo para alertar". Significa que el nodo conoce un líder. Sin hora NTP los nodos funcionan pero no forman alertas (`config.h:24`, `detector.ino:58,134`).

## 3.10 Errores de montaje y cómo corregirlos

La {{TABLA:T-MON-ERRORES}} reúne los fallos que aparecen al armar los tres detectores. La columna de comprobación indica qué mirar antes de desarmar nada.

[[TABLA:T-MON-ERRORES|Errores frecuentes de montaje, comprobación y corrección. Fuente: docs/prueba-hardware.md:31-39, entrega/06-manual/conexion-esp32.md:305-320 y entrega/10-informes-fase3/diagnostico-pulsador.md, sección 6.]]
| Síntoma | Causa probable | Comprobación | Corrección |
|---|---|---|---|
| El LED de alimentación no enciende | Cable o puerto USB defectuoso | Probar otro cable de datos y otro puerto | Sustituir el cable |
| No aparece `/dev/ttyUSB*` | Cable de solo carga o driver ausente | `lsusb`, `dmesg`, `arduino-cli board list` | Usar cable de datos; revisar driver |
| `Permission denied` al abrir el puerto | Falta el grupo `dialout` | `ls -l /dev/ttyUSB0` | `usermod -aG dialout` o `setfacl` |
| LED azul parpadeando rápido sin parar y sin eventos | D4 unido a GND de forma permanente | Continuidad entre i2 e i5 sin pulsar | Recablear en diagonal: D4 a g26 y GND a d24 |
| Al encender se abre el portal `SISMO-DN-config` | El pulsador estaba apretado al arrancar o D4 está en LOW | Mirar si el pulsador está atascado o mal cableado | Soltar el pulsador; corregir el cableado |
| Pines doblados o módulo inclinado | El módulo se insertó torcido o girado | Revisar USB hacia la columna 1 y la fila de pines | Sacar, enderezar y volver a insertar |
| Basura en el monitor serie | Velocidad distinta de 115200 | Configuración del monitor | Ajustar a 115200 |
| Las tres placas parpadean a 1 Hz y no hay líder | Red con aislamiento de clientes, broadcast bloqueado o solo dos placas | Revisar el router y cuántas placas están encendidas | Router normal con DHCP y las tres encendidas |
| Dos eventos con una sola pulsación | Contacto intermitente del pulsador o jumpers flojos | El LED deja de parpadear rápido durante la pulsación | Reasentar jumpers, revisar diagonal, sustituir el pulsador |
| El nodo no responde por HTTP | La IP cambió por DHCP | `getent hosts sismo-nodo-N.local` | Reservar IP o actualizar `.env` |
| La placa se reinicia al abrir el monitor | El adaptador CP2102 afirma RTS, que va a EN | Se observa un reinicio al abrir el puerto | No es un fallo de montaje; abrir el monitor con la placa ya encendida |

Dos errores que aparecen seguido son el cableado en el mismo lado del pulsador y el cable USB de solo carga. El primero se detecta con el multímetro y con el LED; el segundo, cambiando el cable (`entrega/06-manual/conexion-esp32.md:73-80,310-311`).

Si una placa se reinicia o el monitor no responde, revisa también que el firmware se haya compilado con el número correcto. Un `-DNODO` equivocado no rompe el montaje, pero deja dos nodos con la misma identidad lógica y el clúster no forma quórum estable.

## 3.11 Fotografía del prototipo real

La {{FIG:FIG-MON-04}} es la fotografía del prototipo montado durante la campaña física. Se copia sin recortes ni retoques desde `entrega/04-evidencias/F-fisicas/fot-FIS-03-prototipo-montado-a.png`, con el mismo SHA-256.

[[FIG:FIG-MON-04|Prototipo real montado: ESP32 DevKit V1 sobre la protoboard, pulsador en la mitad superior y dos cables de conexión. Fuente: entrega/04-evidencias/F-fisicas/fot-FIS-03-prototipo-montado-a.png.]]

La foto se tomó el día del armado y muestra lo que acredita: la placa montada sobre la protoboard, el pulsador y los dos cables (`entrega/04-evidencias/F-fisicas/NOTA-F-fisicas.md`). En la foto los cables son blanco y negro; en el plano de la {{FIG:FIG-MON-01}} se usa azul para D4 y negro para GND por claridad. El color de los cables puede variar; la posición sí importa: D4 a una pata y GND a la pata diagonal.

La foto no sirve como plano de posiciones ni como prueba del firmware. El pulsador se sostiene con la mano, los cables pasan por encima de la placa y la imagen no muestra la etiqueta SIS-DN ni los estados del LED. Para reproducir el montaje, usa la {{FIG:FIG-MON-01}} y la {{TABLA:T-MON-PINES}}.

Las otras dos fotos del mismo montaje están en `entrega/04-evidencias/F-fisicas/fot-FIS-03-prototipo-montado-b.png` (detalle del ESP32) y `fot-FIS-03-prototipo-montado-c.png` (detalle del pulsador). No se copian aquí para no duplicar la evidencia. El alcance de FIS-03 está acotado: acredita el montaje físico, mientras que las capturas de los tres prototipos encendidos (FIS-04) y de los estados del LED (FIS-05) siguen pendientes (`entrega/04-evidencias/F-fisicas/NOTA-F-fisicas.md`).
