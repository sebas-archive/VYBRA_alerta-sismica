# 1. Introducción y alcance

Este manual describe cómo montar los tres detectores de VYBRA, compilar y cargar su firmware, instalar el software del agregador y operar el sistema hasta obtener un clúster de tres nodos con el panel funcionando. Se escribió para que otra persona pueda repetir la instalación sin consultar a los autores y para que cada afirmación de funcionamiento se pueda comprobar con un comando, un archivo o una evidencia. Complementa al documento técnico del proyecto con el procedimiento detallado y con las verificaciones de la validación del 2026-11-18 sobre el commit `0ee5ed4`.

## 1.1 Propósito del manual

El propósito es entregar un procedimiento completo y reproducible. Cada capítulo cubre una etapa del montaje o de la operación, indica qué debe existir antes de empezar, muestra los comandos con su salida esperada y define el criterio para dar un paso por terminado. Los valores de pines, puertos, tiempos y versiones provienen del código y de los registros del repositorio; cuando un dato no se pudo verificar, se indica en lugar de completarlo por suposición.

El manual es autónomo. No supone que el lector haya leído el documento final ni los manuales anteriores, y no repite la justificación teórica del diseño. Su material propio es el montaje físico, el desglose del firmware, la instalación con Docker, la operación del panel y la reproducción de las pruebas. El alcance termina en un prototipo de laboratorio que funciona en una red local; la instalación se verificó en Linux CachyOS x86_64 con tres ESP32 DevKit V1, Docker Engine y un navegador actualizado, y otros sistemas operativos no se probaron.

## 1.2 A quién sirve

El manual sirve a cuatro perfiles, que pueden leer el documento completo aunque tengan un recorrido principal.

- **Montaje físico.** Arma las tres protoboards, conecta el pulsador y verifica el cableado en la sección 3.
- **Firmware.** Compila y flashea las ESP32, ajusta la red y revisa el monitor serie en las secciones 3 y 6.
- **Software.** Prepara el equipo, configura `.env`, arranca el stack y ejecuta las pruebas en las secciones 2, 7 y 8.
- **Evaluación y operación.** Revisa los criterios 4 y 5 en las secciones 4 y 5, y atiende el sistema con las secciones 6 a 8.

Se espera que el lector sepa usar una terminal en Linux, instalar paquetes y ejecutar comandos con `sudo`. También ayuda conocer Docker a nivel de contenedores y volúmenes, y leer C++ y JavaScript sin necesidad de escribirlos. Los conceptos de consenso, quórum y replicación se explican en la sección 4.

## 1.3 Qué se puede y qué no se puede esperar

Después de completar el manual se puede esperar un clúster de tres nodos que elige un líder, replica un log de eventos y aplica una regla de alerta determinista. También se puede esperar el panel de administración en el puerto 8095, la vista pública, el histórico en tres bases PostgreSQL y la reproducción de las suites de la sección 5. En el terreno físico, una pulsación genera un evento en la placa, llega al agregador y el panel lo muestra con su intensidad y su hora.

No se puede esperar detección sísmica real. La entrada del sistema es un pulsador conectado a GPIO4; no hay acelerómetro, geófono ni instrumento de medición del terreno. La duración del pulso se convierte en un nivel de intensidad de 1 a 10 y en un valor de PGA mediante una escala de simulación declarada, que no corresponde a una escala sismológica oficial. El sistema tampoco emite alertas tempranas a población ni sustituye a una red de monitoreo.

> El evento sísmico es simulado y esta condición se repite en el firmware, en las interfaces y en cada capítulo del manual. Lo que se demuestra es el procesamiento distribuido: propuesta, replicación, confirmación por mayoría, aplicación determinista y alerta.

La campaña física está incompleta y el manual no la presenta como terminada. P0 se completó; T1 no se aprobó porque una pulsación produjo dos eventos de 301 ms y 174 ms separados 3,2 s, en lugar del evento único de unos 900 ms esperado, y de T2 en adelante no hay resultados. El clúster replicó y confirmó los eventos de T1 sin generar alerta, que es el comportamiento correcto con un solo detector. Esos resultados se documentan en la sección 5 y no se corrigen ni se omiten.

## 1.4 Cómo leer el manual

Para una instalación desde cero conviene seguir el orden numérico. La sección 2 reúne requisitos, materiales y herramientas. La sección 3 monta los detectores. La sección 6 compila y carga el firmware. La sección 7 instala y arranca el software. La sección 8 verifica el conjunto y resuelve los problemas más frecuentes. La sección 9 concentra comandos, pinout, glosario, inventario de evidencias y enlaces.

Para una evaluación por criterios se puede ir directo a la sección 4, con el diagrama de arquitectura y los mecanismos de comunicación, y a la sección 5, con las evidencias de pruebas; esa correspondencia se resume en la {{TABLA:T-RUBRICA}}. Cada apartado empieza con lo que cubre y con lo que el lector debe tener listo, y los pasos numerados traen su criterio de hecho. Las tablas y figuras se referencian por su número, y los fragmentos de código se citan con la ruta y el rango de líneas del repositorio.

> Los avisos con este formato advierten de un riesgo para el hardware, de una condición que invalida una prueba o de una limitación del prototipo. Conviene leerlos antes del paso que los precede.

## 1.5 Convenciones

Las rutas se escriben relativas a la raíz del repositorio y con barras inclinadas, por ejemplo `firmware/detector/detector.ino`. Los comandos se presentan en bloques `bash` y se ejecutan desde esa raíz, salvo que el bloque indique otro directorio; en los ejemplos no se incluye el símbolo del sistema y las líneas que empiezan con `#` son comentarios que no se copian. Las salidas de terminal se copian de ejecuciones reales y, cuando se abrevia un listado, la omisión se marca con `... (continúa)`.

La palabra `NODO` representa el nombre de la placa del paso: `SIS-D1`, `SIS-D2` o `SIS-D3`. La palabra `IP_PLACA` representa la dirección que la placa obtiene por DHCP; los ejemplos usan direcciones del rango de documentación y deben sustituirse por las reales. Los puertos se citan con su protocolo, por ejemplo `UDP 4210` o `TCP 32323`, y su inventario está en las secciones 2.3 y 4.4. Las citas de código usan el formato `Archivo: ruta (líneas N-M)`.

[[TABLA:T-INT-CONV|Convenciones de escritura que se usan en todo el manual.]]
| Convención | Uso en este manual |
|---|---|
| Rutas | relativas a la raíz del repositorio, con barras inclinadas; las absolutas solo cuando un comando las exige |
| Comandos | bloques `bash` ejecutados desde la raíz; `#` inicia comentario y no se copia |
| `NODO` | nombre de la placa del paso: `SIS-D1`, `SIS-D2` o `SIS-D3` |
| `IP_PLACA` | dirección de la placa obtenida por DHCP; los ejemplos usan rangos de documentación |
| Puertos | siempre con protocolo, por ejemplo `UDP 4210` o `TCP 32323`; inventario en 2.3 y 4.4 |
| Citas de código | formato `Archivo: ruta (líneas N-M)`; fragmento textual y omisiones con `... (continúa)` |
| Figuras y tablas | se referencian por "Figura N" y "Tabla N"; las tablas de identificación conservan su ID en la redacción |

Un ejemplo de esas convenciones aparece a continuación. La primera línea sitúa el directorio de trabajo y la segunda define el nombre del nodo que usarían los comandos siguientes.

```bash
NODO=SIS-D1
curl -s "http://192.0.2.10/api/estado"   # IP de ejemplo, sustituir por la real
```

En el texto, "detector" es la placa con su pulsador y su firmware, "nodo" es esa placa como miembro del clúster, "agregador" es el proceso Node.js que sirve las interfaces y "panel" es la interfaz de administración.
