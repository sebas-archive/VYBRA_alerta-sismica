# NOTA — Diagramas de arquitectura (evidencia)

## Autoría y procedencia

- **Autoría:** diagramas elaborados para este proyecto por el equipo de documentación (rol
  «diagramador»), a partir del código y de la documentación vigentes del repositorio.
- **Proyecto:** Alerta Sísmica / VYBRA — clúster de 3 ESP32 con consenso Raft propio, agregador
  Node.js, panel ADMIN + vista CLIENTE, servidores de datos con PostgreSQL y controlador Docker.
- **Commit de referencia:** `0ee5ed4` · **Versión:** `v1.0.0-rc1` · **Fecha:** 2026-11-18.
- **Naturaleza:** diagramas originales del proyecto; no son mockups ni material de diseño
  retirado. Se generaron desde archivos fuente PlantUML versionados en `entrega/03-diagramas/fuente/`.

## Contenido de esta carpeta

| Diagrama | Archivo fuente | Tipo | Qué evidencia |
|---|---|---|---|
| D-01 | `03-diagramas/fuente/D-01-arquitectura-fisica.puml` | Despliegue físico | 3 ESP32, agregador/panel, servidores de datos + PostgreSQL, navegadores y Caddy opcional |
| D-02 | `03-diagramas/fuente/D-02-despliegue-docker.puml` | Despliegue Docker | 11 servicios del perfil por defecto, perfiles y overlay de producción |
| D-03 | `03-diagramas/fuente/D-03-componentes-dependencias.puml` | Componentes | Firmware portable, backend Node.js e infraestructura externa |
| D-05 | `03-diagramas/fuente/D-05-estados-nodo-raft.puml` | Estados | Seguidor / Candidato / Líder / caída simulada |
| D-11 | `03-diagramas/fuente/D-11-estados-maquina-sismica.puml` | Estados | Máquina sísmica y niveles de alerta (alta / media / baja) |

Cada diagrama se incluye en **SVG** (vectorial, legible al ampliar) y **PNG** (vista rápida), con el
mismo nombre base.

## Comando de generación

Desde la raíz del repositorio, con PlantUML `1.2025.10`, Java 27 y Graphviz instalado:

```bash
cd entrega/03-diagramas/fuente
java -Djava.awt.headless=true -jar /home/t1an/Descargas/plantuml-1.2025.10.jar \
  -tsvg -o ../exportado *.puml
java -Djava.awt.headless=true -jar /home/t1an/Descargas/plantuml-1.2025.10.jar \
  -tpng -o ../exportado *.puml
```

Los archivos de esta carpeta son copia exacta de `entrega/03-diagramas/exportado/`. Para
regenerarlos y refrescar la evidencia, basta repetir los comandos y volver a copiar los cinco
diagramas.

## Validación

- Los 14 diagramas de la carpeta fuente compilan sin errores (`-checkonly` y exportación real).
- Se generaron 14 SVG y 14 PNG; los SVG se validaron como XML bien formado y sin marcadores de
  error de PlantUML.
- La fuente de verdad de cada figura (archivo y líneas del código) está documentada en
  `entrega/03-diagramas/README.md`.
- Las cifras y los tiempos que aparecen provienen del código o del `README.md`; cuando el firmware
  real y el nodo simulado difieren (5000-9000 ms frente a 1500-3000 ms para la elección), se indica
  de forma expresa en el diagrama.

## Nota sobre discrepancias

Las diferencias entre código, `README.md` y otros documentos se anotan (sin modificar el código)
en `entrega/10-informes-fase3/datos-para-diagramas.md`, sección «Discrepancias detectadas».
