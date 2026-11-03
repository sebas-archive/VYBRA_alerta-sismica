# Ubicación de nodos y mapa liso — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ubicar cada nodo con el GPS de un celular, detectar por WiFi que lo movieron, y mostrar en un mapa liso solo los nodos (verde, azul o rojo), la persona y la zona del sismo.

**Architecture:**
- **Firmware:** la comparación de huellas WiFi es C++ puro en `nucleo/huella` y se prueba en el PC. `detector.ino` solo agenda el escaneo asíncrono, guarda la huella de referencia en NVS y expone `POST /huella`.
- **Servidor:** agrega HTTPS (certificado propio), un almacén de ubicaciones en `web/datos/ubicaciones.json` y el endpoint `POST /api/nodos/:n/ubicacion`.
- **Vistas:** comparten `geo.js` (funciones puras, se prueban con Node) y `mapa.js` (dibujo SVG). Se quita Leaflet.

**Tech Stack:** el mismo de la rama `raft-esp32` (ESP32 core 3.3.12, ArduinoJson 7, Node 22 sin dependencias), más `openssl` del sistema para el certificado.

**Spec:** `docs/superpowers/specs/2026-11-03-ubicacion-nodos-design.md`

## Global Constraints

- **Puertos:** HTTP en `8090` (nuevo valor por defecto de `PUERTO`) y HTTPS en `8091` (`PUERTO_HTTPS`). Ambos sirven las mismas rutas.
- **Certificado:** `web/certs/cert.pem` y `key.pem`, generados con `openssl`, RSA 2048, `825` días. El SAN lleva `localhost`, `127.0.0.1` y todas las IPv4 que no son de loopback. Se regenera si cambia alguna IP. Va en `.gitignore`.
- **Ubicaciones:** `web/datos/ubicaciones.json` = `{ "N": {lat, lon, precision, t} }`. Va en `.gitignore`.
- **Huella:**
  - hasta `8` BSSID con su RSSI;
  - escaneo activo asíncrono de `60` ms por canal;
  - tras arrancar a los `15 s` y a los `30 s`, luego cada `120 s`; nunca con menos de `15 s` entre escaneos, nunca con otro escaneo en curso, y nunca siendo líder con entradas sin replicar;
  - *parecido* = proporción de BSSID de referencia que siguen visibles con una diferencia de RSSI ≤ `12` dB;
  - *parecido* se mide contra la unión de los `2` últimos escaneos (por BSSID, RSSI más fuerte);
  - queda `movido` si *parecido* < `0.5` en `2` evaluaciones seguidas;
  - NVS namespace `ubic`.
- **`POST /huella` en el nodo:** responde `202` y toma la huella en cuanto puede. El servidor la vuelve a pedir si un nodo ubicado trae `con_huella:false`, como máximo una vez por minuto.
- **`/estado`:** agrega `movido` y `con_huella`, y sigue pesando menos de `1 KB`.
- **Color de cada nodo:**
  - **rojo:** inalcanzable o `caido`;
  - **azul:** sin líder, candidato, o `log_len` o `commit_index` por debajo de los de `foto.fuente`;
  - **verde:** el resto.
  - Siempre con su texto: "Caído", "Sincronizando" o "Al día".
- **GPS al ubicar un nodo:** espera a precisión ≤ `50` m, o `15 s`. La ubicación del celular de la persona nunca se envía al servidor.
- **Zona del sismo:**
  - centro: centroide ponderado por nivel de los nodos que coincidieron, que estén ubicados y que no estén "se movió";
  - radio: distancia máxima del centro a esos nodos, con un mínimo de `30` m;
  - con 0 nodos válidos no hay círculo y se muestra "ubicación desconocida".
- **Nada inventado:** se borran `CONFIG.center`, `CONFIG.stations`, `PLACES`, las zonas manuales y los sismos de ejemplo. No queda Leaflet ni ninguna capa de mapa con calles.
- **Pruebas:** `make -C firmware/test test` y `cd web && npm test`.

## Review Focus

1. **Nodo ubicado cuya placa no tiene huella** (por ejemplo, tras borrar la flash): el mapa lo muestra ubicado, sin "se movió", y el servidor vuelve a pedir `/huella` sin inundar al nodo. Lo cubre la prueba de Task 3 `ubicacion: reintenta huella como máximo 1 vez por minuto`.
2. **Celular sin permiso de ubicación o con GPS impreciso:** al ubicar un nodo, el botón explica el error y no envía coordenadas basura. Lo cubre Task 5, con verificación en navegador sin ventana y geolocalización simulada (permiso denegado).
3. **Coordenadas inválidas en `POST /api/nodos/:n/ubicacion`** (lat fuera de ±90, lon fuera de ±180, NaN, precisión negativa, `n` fuera de 1–3): `400` y nada se guarda. Lo cubre Task 3, `ubicacion: valida coordenadas`.
4. **Todos los nodos en el mismo punto, o un solo nodo ubicado:** el mapa no divide por cero y muestra una escala razonable (mínimo 100 m de ancho). Lo cubre Task 4, `geo: un solo punto da encuadre mínimo`.
5. **El escaneo WiFi coincide con un latido:** sin elecciones nuevas en 10 minutos. Se verifica en Task 6, en hardware.

---

### Task 1: Huella WiFi en el núcleo (C++ puro) y `/estado`

**Files:**
- Create: `firmware/detector/src/nucleo/huella.h`, `huella.cpp`
- Modify: `firmware/detector/src/nucleo/api.h`, `api.cpp` (`InfoRed` agrega `bool movido; bool conHuella;`; `/estado` agrega `"movido"` y `"con_huella"`)
- Test: `firmware/test/test_huella.cpp`; modify `firmware/test/test_api.cpp`

**Interfaces:**
- Produces:
  ```cpp
  namespace nucleo {
  struct Ap { std::string bssid; int rssi; };           // bssid "aa:bb:cc:dd:ee:ff" en minúsculas
  std::vector<Ap> mejoresAps(std::vector<Ap> vistas, size_t max = 8);   // ordena por rssi desc, sin repetidos
  float parecido(const std::vector<Ap>& ref, const std::vector<Ap>& actual, int tolDb = 12); // 1.0 si ref vacía
  class DetectorMovimiento {
   public:
    void fijarReferencia(const std::vector<Ap>& ref);   // limpia movido y el contador
    bool tieneReferencia() const;
    const std::vector<Ap>& referencia() const;
    void nuevoEscaneo(const std::vector<Ap>& actual);   // 2 seguidos < 0.5 → movido
    bool movido() const;
  };
  }
  ```

- [ ] **Step 1: Escribir las pruebas que fallan** (`test_huella.cpp`)
  - `mejores_ordena_y_recorta`: 10 AP desordenados y un BSSID repetido → 8 AP, ordenados por RSSI descendente, sin repetidos.
  - `parecido_igual_es_1`: la misma lista → `1.0`.
  - `parecido_tolera_12db`: los mismos BSSID con +12 dB → `1.0`; con +13 dB → `0.0`.
  - `parecido_mitad`: la mitad de los BSSID ausentes → `0.5`.
  - `sin_referencia_no_movido`: escaneos distintos sin referencia → `movido()==false`.
  - `movido_tras_2_seguidos`: un escaneo con *parecido* 0.2 → no movido; el segundo → movido.
  - `uno_malo_y_uno_bueno_no_movido`: 0.2, 0.9, 0.2 → no movido.
  - `fijar_referencia_limpia`: estando movido, `fijarReferencia` → `movido()==false`.
- [ ] **Step 2:** En `test_api.cpp`, `estado_menos_de_1kb` pasa a esperar 17 claves e incluye `movido` y `con_huella`.
- [ ] **Step 3:** Run `make -C firmware/test test`. Expected: falla porque `huella.h` no existe.
- [ ] **Step 4:** Implementar `huella.cpp` y los cambios de `api.cpp`.
- [ ] **Step 5:** Run `make -C firmware/test test`. Expected: 0 fallas.

---

### Task 2: Firmware: escaneo, `POST /huella` y NVS

**Files:**
- Modify: `firmware/detector/detector.ino`; `firmware/detector/src/nucleo/raft.h/.cpp` (agregar `void registrarSuceso(const std::string& tipo, const std::string& texto)`, que reutiliza el mecanismo interno de sucesos)
- Test: `firmware/test/test_raft.cpp` (`registrar_suceso_externo`: aparece en `sucesos()` y sube `sucesosSeq()`)

**Interfaces:**
- Consumes: `DetectorMovimiento`, `mejoresAps` e `InfoRed.movido`/`conHuella` (Task 1).
- Produces:
  - `POST /huella` → `202 {"ok":true}`. Pone una bandera `huellaPedida`. El siguiente escaneo permitido fija la referencia y la guarda en NVS, en `ubic`/`ref` (JSON compacto de la lista).
  - Al arrancar, carga la referencia desde NVS.
  - Suceso tipo `"movido"`, texto `"Servidor N detectó que lo movieron"`. Se registra una sola vez por cada transición a movido.

- [ ] **Step 1: Prueba de `registrarSuceso`, que falle; implementarlo; pasarla.**
- [ ] **Step 2: Agendar el escaneo en `loop()`.**
  - Usa `WiFi.scanNetworks(true, false, false, 60)`, que es asíncrono y activo (Task 8; antes pasivo de 40 ms).
  - Revisa `WiFi.scanComplete()` en cada vuelta del loop. Convierte el resultado con `mejoresAps` y llama `WiFi.scanDelete()`.
  - Respeta las reglas de frecuencia de las Global Constraints. "Líder con entradas sin replicar" = `rol()==Lider && commitIndex() < logLen()`.
  - Si `huellaPedida`, escanea en cuanto sea permitido (mínimo 15 s desde el anterior) y fija la referencia. Si no, llama `nuevoEscaneo`.
- [ ] **Step 3:** `InfoRed` lleva `movido` y `conHuella` en `/estado`. El LED no cambia.
- [ ] **Step 4: Compilar los 3 nodos.** Run: `for n in 1 2 3; do arduino-cli compile --fqbn esp32:esp32:esp32 --build-property "compiler.cpp.extra_flags=-DNODO=$n" --build-path firmware/build/nodo-$n firmware/detector; done`. Expected: sin errores ni advertencias de nuestros archivos.

---

### Task 3: Servidor: HTTPS, ubicaciones y huella

**Files:**
- Create: `web/certificado.js`, `web/ubicaciones.js`
- Modify: `web/server.js`, `web/config.js` (`PUERTO=8090`, `PUERTO_HTTPS=8091`), `web/fake/nodo-falso.js` (`movido` y `con_huella` en `/estado`, `POST /huella` → 202 y `con_huella:true` tras 300 ms), `.gitignore` (`web/certs/`, `web/datos/`), `docs/prueba-hardware.md` (puertos y regla `ufw` del 8091)
- Test: `web/test/server.test.js`, `web/test/ubicaciones.test.js`

**Interfaces:**
- Produces:
  - **`certificado.js`:** `export async function asegurarCertificado(dir) → {cert, key}`. Genera con `openssl` si falta, o si las IP del SAN no coinciden con las actuales.
  - **`ubicaciones.js`:** `export function crearUbicaciones(archivo) → { todas(): {N:{lat,lon,precision,t}}, fijar(n, {lat,lon,precision}) → objeto guardado, }`.
    - La escritura es atómica: archivo temporal y luego `rename`.
    - `fijar` valida: `n` en 1–3, lat entre −90 y 90, lon entre −180 y 180, `precision` mayor o igual a 0 y finita. Si algo falla, lanza `Error` con `codigo = 400`.
  - **`crearServidor`** recibe además `ubicaciones` y `pedirHuella(n)`.
    - `POST /api/nodos/:n/ubicacion` exige JSON y devuelve `200 {ubicacion}` o `400 {error}`. Al guardar, llama `pedirHuella(n)`.
    - La foto de `/api/estado` y del SSE agrega `ubicaciones`.
  - **Cuando se ejecuta directamente:** levanta HTTP en `PUERTO` y HTTPS en `PUERTO_HTTPS` con el mismo manejador. Imprime las 3 URLs y recuerda la regla `ufw` del 8091.
  - **Reintento de huella:** si un nodo ubicado trae `con_huella:false`, se llama `pedirHuella(n)` como máximo 1 vez por minuto por nodo.

- [ ] **Step 1: Escribir las pruebas que fallan**
  - `ubicacion: valida coordenadas` → `400` para cada caso del Review Focus 3; el archivo no cambia.
  - `ubicacion: guarda y aparece en la foto` → `200`; `/api/estado` trae `ubicaciones["2"]` con los mismos valores; sobrevive a crear un servidor nuevo sobre el mismo archivo.
  - `ubicacion: pide huella al nodo` → el nodo falso 2 recibe `POST /huella`.
  - `ubicacion: reintenta huella como máximo 1 vez por minuto` → con reloj inyectable: un nodo ubicado con `con_huella:false` durante 3 min simulados recibe ≤ 3 `POST /huella`.
  - `https: sirve /api/estado en el puerto seguro` → con un certificado generado en un directorio temporal, `GET https://127.0.0.1:<puerto>/api/estado` (con `rejectUnauthorized:false`) responde `200`.
  - `certificado: SAN incluye las IPv4` → lee el certificado con `openssl x509 -text` y encuentra `127.0.0.1` y cada IPv4 que no es de loopback de `os.networkInterfaces()`.
- [ ] **Step 2:** Run `cd web && npm test` → fallan. Implementar. Run → 0 fallas.

---

### Task 4: `geo.js` (funciones puras) y `mapa.js` (dibujo SVG)

**Files:**
- Create: `web/public/geo.js`, `web/public/mapa.js`
- Test: `web/test/geo.test.js`

**Interfaces:**
- Produces (`geo.js`, ESM, sin DOM):
  ```js
  export function colorNodo(foto, n)           // → {color:'rojo'|'azul'|'verde', texto:'Caído'|'Sincronizando'|'Al día'}
  export function distanciaM(a, b)             // haversine, metros; a/b = {lat, lon}
  export function proyectar(puntos, ancho, alto, margen = 24)  // → {x(p), y(p), metrosPorPx}; encuadre mínimo 100 m
  export function zonaSismo(alerta, eventos, ubicaciones, movidos)  // → {lat, lon, radioM} | null
  export function nodoMasCercano(punto, ubicaciones, movidos)       // → n | null
  ```
- Produces (`mapa.js`): `export function dibujarMapa(svg, { ubicaciones, foto, persona, zona, enfoque })`. Dibuja:
  - fondo liso con los tokens;
  - nodos coloreados con su halo de precisión y la etiqueta "Detector N · Al día/Sincronizando/Caído";
  - borde punteado y "se movió" si corresponde;
  - "Estás aquí";
  - la zona del sismo;
  - barra de escala y "N↑".
  - Si no hay nodos ubicados, deja el mensaje del spec. Devuelve la lista de nodos sin ubicar.

- [ ] **Step 1: Escribir las pruebas que fallan** (`geo.test.js`, `node:test` importando `../public/geo.js`)
  - `color: inalcanzable o caido es rojo`
  - `color: candidato o atrasado es azul` (`log_len` menor que la fuente, o `commit_index` menor, o `lider_conocido:0`)
  - `color: al día es verde`
  - `zona: centroide ponderado por nivel` (2 nodos, niveles 2 y 6 → centro a 3/4 del camino hacia el de nivel 6)
  - `zona: excluye movidos y sin ubicar; con uno es ese nodo y 30 m; con ninguno null`
  - `geo: un solo punto da encuadre mínimo` (`metrosPorPx * ancho >= 100`)
  - `distancia: 1 grado de latitud ≈ 111 km (±1%)`
- [ ] **Step 2:** Run → fallan. Implementar `geo.js` y luego `mapa.js` (sin pruebas de DOM, se verifica en Task 5). Run → 0 fallas.

---

### Task 5: Vistas: mapa liso, ubicar nodos y colores

**Files:**
- Modify: `web/public/cliente.html`, `web/public/operador.html`

**Interfaces:**
- Consumes: `geo.js`, `mapa.js` (Task 4); `foto.ubicaciones` y `POST /api/nodos/:n/ubicacion` (Task 3); `estado.movido` y `estado.con_huella` (Tasks 1–2).

- [ ] **Step 1: Vista pública**
  - Quitar Leaflet (CSS, JS, `makeMap`, `drawOn`) y todo lo de las Global Constraints "Nada inventado".
  - "Ahora", el detalle y "Sismos recientes" (vista mapa) usan `dibujarMapa`.
  - Textos de lugar: "cerca del detector N" con `nodoMasCercano`, y "a X m de ti".
  - "Usar mi ubicación" usa `watchPosition`. Si la página no es segura (`!isSecureContext`), muestra el aviso con el enlace `https://<host>:8091/publico`.
  - En Ajustes se quita "Elegir una zona".
- [ ] **Step 2: Panel**
  - **Panorama:** mapa pequeño con `dibujarMapa`.
  - **Clúster Raft:** cada nodo del diagrama y cada tarjeta de servidor usan `colorNodo` para el borde y una pastilla "Al día / Sincronizando / Caído".
  - **Detectores:**
    - cada tarjeta muestra "Ubicación: sin ubicar / ±N m · hace X / se movió" y el botón **"Ubicar nodo N aquí"**;
    - el botón espera precisión ≤ 50 m o 15 s, mostrando el progreso, y luego hace POST;
    - muestra errores claros si no hay permiso o no es contexto seguro;
    - muestra "Tomando huella WiFi…" mientras `con_huella:false`.
  - **Línea de tiempo:** suma el tipo `movido` (icono de alerta).
- [ ] **Step 3: Verificar sin hardware**
  - Levantar el clúster falso y el servidor con `PUERTO=18090 PUERTO_HTTPS=18091`, usando un directorio de certificados temporal.
  - Navegador sin ventana (playwright-core del scratchpad, `ignoreHTTPSErrors`, `geolocation` y `permissions:['geolocation']` en el contexto).
  - Comprobar:
    - "Ubicar nodo 1 aquí" en `https://localhost:18091/` guarda la ubicación y el nodo aparece en el mapa de Panorama y de `/publico`;
    - "Simular caída" lo pone en rojo;
    - un nodo falso con `log_len` menor aparece en azul;
    - con permiso denegado, el botón muestra el error;
    - no hay errores de consola;
    - no hay scroll lateral a 360 px.
  - Detener los procesos.

---

### Task 6: Carga por OTA y prueba en las placas (con el usuario)

- [ ] `firmware/cargar.sh N --wifi` para N = 1, 2, 3, de a uno, esperando "3 / 3 copias idénticas" entre cada carga.
- [ ] Abrir `ufw` para el 8091:
  ```bash
  sudo ufw allow from 192.168.80.0/24 to any port 8091 proto tcp
  ```
- [ ] `cd web && npm start`. En el celular, abrir `https://192.168.80.227:8091/` y aceptar el certificado.
- [ ] Ubicar los 3 nodos parado junto a cada placa → aparecen en el mapa de `/publico`, en verde.
- [ ] "Simular caída" de uno → rojo; "Recuperar" → azul mientras se pone al día, luego verde.
- [ ] Mover una placa a otra habitación lejana → en ≤ 4 min aparece "se movió". "Ubicar nodo N aquí" en el nuevo lugar → se actualiza y se quita la marca.
- [ ] Durante 10 minutos con escaneos, el término de Raft no cambia (no hay elecciones nuevas).
