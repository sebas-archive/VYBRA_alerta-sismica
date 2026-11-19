# Resumen

VYBRA es un prototipo académico de detección sísmica simulada. Lo componen tres nodos ESP32 con un consenso Raft propio sobre WiFi, un agregador en Node.js que sondea el estado y sirve dos interfaces, tres servidores de datos con PostgreSQL para el histórico y un controlador que enciende y apaga servicios desde el panel. Los eventos se generan con un pulsador: la duración del pulso se traduce en un nivel de intensidad de 1 a 10 y en un PGA de simulación declarada. No hay acelerómetro ni medición del terreno.

El sistema demuestra consenso distribuido, replicación y tolerancia a fallos. Un evento originado en una placa se propone al log de Raft, se confirma cuando dos de los tres nodos lo almacenan y se aplica con una regla determinista que alerta cuando dos detectores distintos registran eventos en diez segundos. La validación del 2026-11-18 sobre el commit `0ee5ed4` obtuvo 78 de 78 casos C++ aprobados y 5 de 5 pruebas de integración Docker en 79,2 s.

La campaña física sigue en curso: P0 se completó y T1 no se aprobó porque una pulsación produjo dos eventos de 301 ms y 174 ms separados 3,2 s en lugar de uno de unos 900 ms; el clúster replicó ambos sin generar alerta, como corresponde con un solo detector. Este manual describe el montaje, el firmware, la instalación, la operación y las evidencias del prototipo.

[[TABLA:T-FICHA|Ficha del documento: proyecto, versión, commit, fecha, licencia, autores y alcance.]]
| Campo | Valor |
|---|---|
| Proyecto | VYBRA, clúster de detección sísmica sobre ESP32 con consenso Raft y evento simulado con pulsador |
| Versión documentada | `v1.0.0-rc1` |
| Commit | `0ee5ed4` |
| Fecha de la validación | 2026-11-18 |
| Licencia | MIT |
| Autores | Jose Camilo Pérez Daza, Sebastián Fernando Revelo Meneses, Tomas Alejandro Santiago Reyes |
| Alcance | Manual de instalación y ejecución del prototipo: montaje físico, firmware, software, operación y evidencias de la validación |

[[TABLA:T-RUBRICA|Correspondencia entre los criterios de evaluación y las secciones que los responden.]]
| Criterio de evaluación | Dónde se responde |
|---|---|
| Criterio 4. Diagrama de arquitectura | Sección 4, Diagrama de arquitectura y mecanismos de comunicación: vista de contexto, componentes, comunicación, puertos, despliegue, flujo de un evento y límites del diagrama |
| Criterio 5. Evidencias de pruebas | Sección 5, Evidencias de pruebas: suites funcionales, integración y concurrencia, rendimiento, tolerancia a fallos, campaña física y matriz requisito a evidencia |
| Instalación y ejecución | Secciones 6 y 7, Firmware de las ESP32 e Instalación y ejecución del software: compilación y flasheo, requisitos, arranque con Docker, paneles y pruebas de humo |
