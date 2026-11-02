// Detector sísmico con Raft para ESP32 DevKit V1 (30 pines).
// Hardware: pulsador entre D4 y GND (diagonal en la protoboard). LED azul integrado en GPIO 2.
// Más tiempo presionado = sismo más fuerte: nivel 1 + uno cada 450 ms, máximo 10.
//
// Este archivo es solo pegamento con el hardware: WiFi, UDP, HTTP, NVS, botón, LED, NTP y OTA.
// Toda la lógica (elección, replicación, alertas y JSON) está en src/nucleo/ y se prueba en el PC.
// El loop nunca se bloquea: Raft necesita latir cada 300 ms.
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ArduinoOTA.h>
#include <ArduinoJson.h>
#include <esp_timer.h>
#include <time.h>
#include <sys/time.h>
#include "config.h"
#include "src/nucleo/api.h"
#include "src/nucleo/mensajes.h"
#include "src/nucleo/raft.h"

#ifndef NODO
#error "Compila con ./cargar.sh 1, 2 o 3 para elegir el detector"
#endif
#if NODO < 1 || NODO > 3
#error "NODO debe ser 1, 2 o 3"
#endif
#ifndef OTA_CLAVE
#error "Falta OTA_CLAVE en secretos.h (copia la línea de secretos.ejemplo.h)"
#endif

using nucleo::Propuesta;

const int PIN_BOTON = 4;
const int PIN_LED = 2;
const uint32_t PULSO_MIN_MS = 80;           // toques más cortos se ignoran
const uint32_t PULSO_MAX_MS = 60000;        // tope para POST /pulsar
const uint32_t ANTIRREBOTE_MS = 20;
const uint32_t WIFI_LIMITE_MS = 30000;      // sin WiFi en 30 s al arrancar: reinicia
const uint32_t WIFI_REINTENTO_MS = 20000;   // ya andando: pide reconexión cada 20 s si se cayó
const uint32_t NTP_CADA_MS = 10UL * 60 * 1000;
const int MAX_PAQUETES_POR_LOOP = 8;

// ---------------------------------------------------------------- estado global

// currentTerm y votedFor en NVS (namespace "raft", claves "T" y "V").
struct PersistenciaNvs : nucleo::Persistencia {
  Preferences prefs;
  void abrir() { prefs.begin("raft", false); }
  void guardar(uint32_t termino, int votadoPor) override {
    prefs.putUInt("T", termino);
    prefs.putInt("V", votadoPor);
  }
  void cargar(uint32_t& termino, int& votadoPor) override {
    termino = prefs.getUInt("T", 0);
    votadoPor = prefs.getInt("V", 0);
  }
};

PersistenciaNvs persistencia;
nucleo::Raft* raft = nullptr;   // se crea en setup(), cuando ya hay semilla aleatoria
WiFiUDP udp;
WebServer servidor(80);
IPAddress ipNodos[3];

uint32_t arranque = 0;   // aleatorio por arranque, para que los id no se repitan
uint32_t contador = 0;
uint8_t paquete[1500];

// Botón con antirrebote sin delay().
bool crudoAnterior = false;
uint64_t cambioCrudo = 0;
bool pulsando = false;
uint64_t tPulso = 0;

uint64_t proximoNtp = 0;
uint64_t proximoReintentoWifi = 0;
uint32_t ultimoSucesoImpreso = 0;

// ---------------------------------------------------------------- tiempo

// ms desde el arranque, en 64 bits (millis() da la vuelta a los 49 días).
uint64_t ahoraMs() { return (uint64_t)(esp_timer_get_time() / 1000); }

// Hora real en ms desde 1970 si NTP ya sincronizó; 0 si no.
uint64_t ahoraEpochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

void pedirHora() { configTime(GMT_OFFSET_S, 0, "pool.ntp.org", "time.google.com"); }  // no bloquea

// ---------------------------------------------------------------- WiFi

void conectarWiFi() {
  IPAddress ip, gw, mascara;
  ip.fromString(IP_NODOS[NODO - 1]);
  gw.fromString(GATEWAY);
  mascara.fromString(MASCARA);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);   // sin ahorro de energía: menos latencia en UDP
  WiFi.config(ip, gw, mascara, gw);   // el gateway también es el DNS (lo necesita NTP)
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {   // solo al arrancar: Raft todavía no corre
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    delay(250);
    if (millis() - t0 > WIFI_LIMITE_MS) {
      Serial.println("No se pudo conectar al WiFi, reiniciando...");
      delay(500);
      ESP.restart();
    }
  }
  Serial.printf("nodo-%d conectado a %s, IP %s\n", NODO, WIFI_SSID, WiFi.localIP().toString().c_str());
}

// Ya andando: la reconexión la hace el propio WiFi; si tarda, se vuelve a pedir sin esperar.
void vigilarWiFi(uint64_t ahora) {
  if (WiFi.status() == WL_CONNECTED) {
    proximoReintentoWifi = ahora + WIFI_REINTENTO_MS;
    return;
  }
  if (ahora >= proximoReintentoWifi) {
    Serial.println("WiFi caído, pidiendo reconexión");
    WiFi.reconnect();
    proximoReintentoWifi = ahora + WIFI_REINTENTO_MS;
  }
}

// ---------------------------------------------------------------- UDP Raft

void recibirUdp(uint64_t ahora) {
  for (int k = 0; k < MAX_PAQUETES_POR_LOOP; k++) {
    int len = udp.parsePacket();   // no bloquea: 0 si no hay nada
    if (len <= 0) return;
    int n = udp.read(paquete, sizeof paquete);
    if (n <= 0 || len > (int)sizeof paquete) continue;   // paquete truncado: se descarta
    nucleo::Msg m;
    if (nucleo::decodificar((const char*)paquete, (size_t)n, m)) raft->recibir(m, ahora);
  }
}

void enviarSalidas() {
  std::vector<nucleo::Salida> salidas = raft->sacarSalidas();
  if (WiFi.status() != WL_CONNECTED) return;   // Raft tolera la pérdida
  for (const nucleo::Salida& s : salidas) {
    if (s.a < 1 || s.a > 3 || s.a == NODO) continue;
    std::string datos = nucleo::codificar(s.msg);
    udp.beginPacket(ipNodos[s.a - 1], PUERTO_RAFT);
    udp.write((const uint8_t*)datos.data(), datos.size());
    udp.endPacket();
  }
}

// ---------------------------------------------------------------- eventos

const char* nombrePropuesta(Propuesta p) {
  switch (p) {
    case Propuesta::Aceptada: return "aceptada";
    case Propuesta::Pendiente: return "pendiente";
    case Propuesta::Caido: return "caido";
    case Propuesta::LogLleno: return "log_lleno";
    default: return "duplicada";
  }
}

// Arma el evento de una pulsación de `ms` y lo propone. Deja el id en `id`.
Propuesta proponerPulso(uint32_t ms, std::string& id, int& nivel) {
  char buf[32];   // "nodo-N-xxxxxxxx-<contador>" (≤ 24 caracteres hasta 8 dígitos)
  snprintf(buf, sizeof buf, "nodo-%d-%08lx-%lu", NODO, (unsigned long)arranque, (unsigned long)++contador);
  nucleo::Evento ev;
  ev.id = buf;
  ev.nodo = NODO;
  ev.nivel = nucleo::Sismo::nivelPorTiempo(ms);
  ev.pga = 0.028f * ev.nivel + 0.015f;   // misma escala que el panel
  ev.duracion_ms = ms;
  ev.t = ahoraEpochMs();
  ev.recibido_por = NODO;
  id = ev.id;
  nivel = ev.nivel;
  Propuesta p = raft->proponer(ev, ahoraMs());
  Serial.printf("pulso %lu ms -> %s nivel %d: %s\n", (unsigned long)ms, id.c_str(), nivel, nombrePropuesta(p));
  return p;
}

void leerBoton(uint64_t ahora) {
  bool crudo = digitalRead(PIN_BOTON) == LOW;
  if (crudo != crudoAnterior) {
    crudoAnterior = crudo;
    cambioCrudo = ahora;
  }
  if (ahora - cambioCrudo < ANTIRREBOTE_MS || crudo == pulsando) return;   // aún rebota o sin cambio
  if (crudo) {
    pulsando = true;
    tPulso = cambioCrudo;
    return;
  }
  pulsando = false;
  uint32_t ms = (uint32_t)(cambioCrudo - tPulso);
  if (ms < PULSO_MIN_MS) return;
  std::string id;
  int nivel;
  proponerPulso(ms, id, nivel);
}

// ---------------------------------------------------------------- HTTP

void responder(int codigo, const std::string& json) {
  servidor.sendHeader("Access-Control-Allow-Origin", "*");
  servidor.send(codigo, "application/json", json.c_str());
}

void responderError(int codigo, const char* texto) {
  JsonDocument doc;
  doc["error"] = texto;
  std::string s;
  serializeJson(doc, s);
  responder(codigo, s);
}

uint32_t argDesde() {
  if (!servidor.hasArg("desde")) return 0;
  long v = servidor.arg("desde").toInt();
  return v > 0 ? (uint32_t)v : 0;
}

bool leerCuerpo(JsonDocument& doc) {
  if (!servidor.hasArg("plain")) return false;
  return !deserializeJson(doc, servidor.arg("plain"));
}

void enEstado() {
  nucleo::InfoRed info;
  info.ip = WiFi.localIP().toString().c_str();
  info.rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  info.uptimeMs = ahoraMs();
  info.conHora = ahoraEpochMs() != 0;
  responder(200, nucleo::jsonEstado(*raft, NODO, info));
}

void enLog() { responder(200, nucleo::jsonLog(*raft, argDesde())); }
void enSucesos() { responder(200, nucleo::jsonSucesos(*raft, argDesde())); }
void enAlertas() { responder(200, nucleo::jsonAlertas(*raft)); }

// POST /control {"accion":"caer"|"recuperar"} → {"ok":true,"caido":bool}
void enControl() {
  JsonDocument doc;
  if (!leerCuerpo(doc)) return responderError(400, "json invalido");
  const char* accion = doc["accion"] | "";
  if (strcmp(accion, "caer") == 0) {
    raft->caer(ahoraMs());
  } else if (strcmp(accion, "recuperar") == 0) {
    raft->recuperar(ahoraMs());
  } else {
    return responderError(400, "accion invalida");
  }
  JsonDocument r;
  r["ok"] = true;
  r["caido"] = raft->caido();
  std::string s;
  serializeJson(r, s);
  responder(200, s);
}

// POST /pulsar {"ms":N} → 200 {"ok":true,"id":"…","nivel":N,"resultado":"aceptada|pendiente|duplicada"}
// 409 si el nodo está caído, 507 si el log está lleno, 400 si ms no sirve.
void enPulsar() {
  JsonDocument doc;
  if (!leerCuerpo(doc)) return responderError(400, "json invalido");
  long ms = doc["ms"] | -1L;
  if (ms < (long)PULSO_MIN_MS || ms > (long)PULSO_MAX_MS) return responderError(400, "ms fuera de rango");
  if (raft->caido()) return responderError(409, "caido");
  std::string id;
  int nivel = 0;
  Propuesta p = proponerPulso((uint32_t)ms, id, nivel);
  if (p == Propuesta::Caido) return responderError(409, "caido");
  if (p == Propuesta::LogLleno) return responderError(507, "log lleno");
  JsonDocument r;
  r["ok"] = true;
  r["id"] = id;
  r["nivel"] = nivel;
  r["resultado"] = nombrePropuesta(p);
  std::string s;
  serializeJson(r, s);
  responder(200, s);
}

// Preflight CORS del navegador y rutas desconocidas.
void enOtro() {
  if (servidor.method() == HTTP_OPTIONS) {
    servidor.sendHeader("Access-Control-Allow-Origin", "*");
    servidor.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    servidor.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    servidor.send(204);
    return;
  }
  responderError(404, "no existe");
}

void iniciarHttp() {
  servidor.on("/estado", HTTP_GET, enEstado);
  servidor.on("/log", HTTP_GET, enLog);
  servidor.on("/sucesos", HTTP_GET, enSucesos);
  servidor.on("/alertas", HTTP_GET, enAlertas);
  servidor.on("/control", HTTP_POST, enControl);
  servidor.on("/pulsar", HTTP_POST, enPulsar);
  servidor.onNotFound(enOtro);
  servidor.begin();
}

// ---------------------------------------------------------------- LED y registro

// Fijo = con líder; 1 Hz = sin líder; rápido = pulsando; apagado = caído o sin WiFi.
void actualizarLed(uint64_t ahora) {
  bool encendido;
  if (raft->caido() || WiFi.status() != WL_CONNECTED) encendido = false;
  else if (pulsando) encendido = (ahora / 80) % 2;
  else if (raft->lider() != 0) encendido = true;
  else encendido = (ahora / 500) % 2;
  digitalWrite(PIN_LED, encendido ? HIGH : LOW);
}

// Imprime por Serial los sucesos nuevos (elecciones, caídas…), para depurar con el monitor.
void imprimirSucesos() {
  for (const nucleo::Suceso& s : raft->sucesos()) {
    if (s.seq <= ultimoSucesoImpreso) continue;
    Serial.printf("[T%lu] %s\n", (unsigned long)s.termino, s.texto.c_str());
    ultimoSucesoImpreso = s.seq;
  }
}

// ---------------------------------------------------------------- setup / loop

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_BOTON, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  arranque = esp_random();
  Serial.printf("\nDetector nodo-%d (Raft)\n", NODO);

  for (int i = 0; i < 3; i++) ipNodos[i].fromString(IP_NODOS[i]);
  persistencia.abrir();

  conectarWiFi();
  pedirHora();
  proximoNtp = ahoraMs() + NTP_CADA_MS;

  nucleo::ConfigRaft cfg;
  cfg.yo = NODO;
  cfg.semilla = esp_random();
  raft = new nucleo::Raft(cfg, persistencia, ahoraEpochMs);
  Serial.printf("término guardado %lu, voto %d\n", (unsigned long)raft->termino(), raft->votadoPor());

  udp.begin(PUERTO_RAFT);
  iniciarHttp();

  char nombre[16];
  snprintf(nombre, sizeof nombre, "sismo-nodo-%d", NODO);
  ArduinoOTA.setHostname(nombre);
  ArduinoOTA.setPassword(OTA_CLAVE);
  ArduinoOTA.begin();
}

void loop() {
  uint64_t ahora = ahoraMs();
  vigilarWiFi(ahora);
  recibirUdp(ahora);
  raft->tick(ahora);
  leerBoton(ahora);
  servidor.handleClient();
  enviarSalidas();
  ArduinoOTA.handle();

  if (ahora >= proximoNtp) {
    pedirHora();
    proximoNtp = ahora + NTP_CADA_MS;
  }
  imprimirSucesos();
  actualizarLed(ahora);
  delay(1);   // cede la CPU a las tareas de WiFi
}
