// Detector sísmico con Raft para ESP32 DevKit V1 (30 pines).
// Hardware: pulsador entre D4 y GND (diagonal en la protoboard). LED azul integrado en GPIO 2.
// Más tiempo presionado = sismo más fuerte: nivel 1 + uno cada 450 ms, máximo 10.
//
// Este archivo es solo pegamento con el hardware: WiFi, UDP, HTTP, NVS, botón, LED, NTP, OTA y
// el escaneo de la huella WiFi (para saber si movieron la placa).
// Toda la lógica (elección, replicación, alertas y JSON) está en src/nucleo/ y se prueba en el PC.
// El loop nunca se bloquea: Raft necesita latir cada 300 ms.
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoOTA.h>
#include <ArduinoJson.h>
#include <esp_timer.h>
#include <esp_wifi.h>
#include <time.h>
#include <sys/time.h>
#include <algorithm>
#include <vector>
#include "config.h"
#include "pagina.h"
#include "portal.h"
#include "src/nucleo/api.h"
#include "src/nucleo/huella.h"
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
const uint32_t WIFI_REINICIO_MS = 180000;   // 3 min sin WiFi: reinicia la placa (Raft guarda término y voto)
const uint32_t NTP_CADA_MS = 10UL * 60 * 1000;
const int MAX_PAQUETES_POR_LOOP = 8;
const uint32_t ESCANEO_PRIMERO_MS = 15000;  // huella: el primero 15 s tras arrancar
const uint32_t ESCANEO_SEGUNDO_MS = 30000;  // el segundo a los 30 s (la unión de ambos ya decide)
const uint32_t ESCANEO_CADA_MS = 120000;    // y después uno cada 2 min
const uint32_t ESCANEO_MIN_MS = 15000;      // nunca dos con menos de 15 s entre ellos
// Escaneo activo: pregunta a los AP en vez de esperar beacons. Peor caso ~14 canales × 60 ms ≈ 0,85 s.
const uint32_t ESCANEO_MIN_MS_POR_CANAL = 30;   // mínimo por canal (el core trae 100, mayor que el máximo)
const uint32_t ESCANEO_MS_POR_CANAL = 60;       // máximo por canal
const uint32_t ESCANEO_LIMITE_MS = 10000;   // si no termina en 10 s, se da por perdido
const size_t MAX_APS_HUELLA = 8;

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
// namespace "ubic": "ref" huella de referencia en JSON, "mov" si lo movieron,
// "pide" si hay una huella pedida por POST /huella que aún no se tomó (sobrevive a un reinicio).
Preferences prefsUbic;
nucleo::Raft* raft = nullptr;   // se crea en setup(), cuando ya hay semilla aleatoria
WiFiUDP udp;
WebServer servidor(80);
IPAddress ipNodos[3];            // se aprenden en la red (DHCP): 0.0.0.0 = aún no se sabe
WiFiUDP udpDescubrir;            // "HOLA N" por broadcast: así cada nodo conoce la IP de los otros
uint64_t proximoHola = 0;

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
uint64_t wifiCaidoDesde = 0;   // 0 = conectado
uint32_t reintentosWifi = 0;
uint32_t ultimoSucesoImpreso = 0;

// Huella WiFi. El escaneo es asíncrono: se lanza y se revisa en cada vuelta del loop.
nucleo::DetectorMovimiento detectorMov;
bool huellaPedida = false;     // POST /huella: el próximo escaneo fija la referencia
bool escaneando = false;
uint32_t escaneosLanzados = 0; // desde el arranque (los dos primeros van más seguidos)
uint64_t inicioEscaneo = 0;    // cuándo se lanzó el último
bool movidoAvisado = false;    // para registrar el suceso "movido" una sola vez por transición

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

// Red y contraseña: las guardadas desde el portal (NVS, namespace "wifi"); si no hay,
// las de config.h / secretos.h.
String ssidWifi, passWifi;
void cargarCredenciales() {
  Preferences p;
  p.begin("wifi", true);
  ssidWifi = p.getString("ssid", "");
  passWifi = p.getString("pass", "");
  p.end();
  if (ssidWifi.isEmpty()) { ssidWifi = WIFI_SSID; passWifi = WIFI_PASS; }
}

// Escapa texto para ponerlo dentro de HTML.
String htmlEsc(const String& t) {
  String r;
  for (size_t i = 0; i < t.length(); i++) {
    char c = t[i];
    if (c == '&') r += "&amp;"; else if (c == '<') r += "&lt;"; else if (c == '>') r += "&gt;";
    else if (c == '"') r += "&quot;"; else if (c == '\'') r += "&#39;"; else r += c;
  }
  return r;
}

// Portal de configuración: crea la red SISMO-D<N>-config, lista las redes que ve y pide la
// contraseña. Guarda en NVS y reinicia. No vuelve: termina siempre en ESP.restart().
void portalWifi() {
  Serial.println("Abriendo el portal de configuración WiFi");
  char ap[24];
  snprintf(ap, sizeof ap, "SISMO-D%d-config", NODO);
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_AP_STA);
  // Se busca antes de que se conecte nadie: escanear con un cliente enganchado le corta la conexión.
  int total = WiFi.scanNetworks();
  struct Red { String ssid; int rssi; bool abierta; };
  std::vector<Red> redes;
  for (int i = 0; i < total; i++) {
    String s = WiFi.SSID(i);
    if (s.isEmpty()) continue;
    bool repetida = false;
    for (Red& r : redes) if (r.ssid == s) { repetida = true; if (WiFi.RSSI(i) > r.rssi) r.rssi = WiFi.RSSI(i); }
    if (!repetida) redes.push_back({s, WiFi.RSSI(i), WiFi.encryptionType(i) == WIFI_AUTH_OPEN});
  }
  std::sort(redes.begin(), redes.end(), [](const Red& a, const Red& b) { return a.rssi > b.rssi; });
  WiFi.scanDelete();

  WiFi.softAP(ap, PORTAL_CLAVE);
  IPAddress ip = WiFi.softAPIP();
  DNSServer dns;
  dns.start(53, "*", ip);   // cualquier nombre apunta a la placa: el celular abre el portal solo
  WebServer web(80);

  auto pagina = [&]() {
    String h = PORTAL_CABECERA;
    h += "<h1>Detector " + String(NODO) + "</h1><p>Elige la red WiFi a la que se conectará este detector.</p>";
    h += "<form method=\"POST\" action=\"/guardar\">";
    if (redes.empty()) h += "<p>No se vio ninguna red. Acerca la placa al celular y recarga la página.</p>";
    int k = 0;
    for (const Red& r : redes) {
      h += "<label class=\"red\"><input type=\"radio\" name=\"red\" value=\"" + htmlEsc(r.ssid) + "\"" + (k++ == 0 ? " checked" : "") + ">";
      h += "<b>" + htmlEsc(r.ssid) + "</b><small>" + (r.abierta ? "abierta · " : "") + String(r.rssi) + " dBm</small></label>";
    }
    h += "<label class=\"red\"><input type=\"radio\" name=\"red\" value=\"__otra__\"><b>Otra red (escribir el nombre)</b></label>";
    h += "<input type=\"text\" name=\"otra\" placeholder=\"Nombre de la red\" autocapitalize=\"none\" autocomplete=\"off\">";
    h += "<label class=\"campo\" for=\"clave\">Contraseña</label>";
    h += "<input type=\"password\" id=\"clave\" name=\"clave\" autocomplete=\"off\" autocapitalize=\"none\">";
    h += "<label class=\"ver\"><input type=\"checkbox\" onchange=\"document.getElementById('clave').type=this.checked?'text':'password'\"> Mostrar contraseña</label>";
    h += "<button type=\"submit\">Guardar y conectar</button></form>";
    h += "<p style=\"margin-top:16px\">Red guardada ahora: <b>" + htmlEsc(ssidWifi) + "</b></p>";
    h += PORTAL_PIE;
    return h;
  };
  web.on("/", HTTP_GET, [&]() { web.send(200, "text/html; charset=utf-8", pagina()); });
  web.on("/guardar", HTTP_POST, [&]() {
    String red = web.arg("red");
    if (red == "__otra__") red = web.arg("otra");
    red.trim();
    String clave = web.arg("clave");
    if (red.isEmpty() || red.length() > 32 || clave.length() > 63) {
      String h = PORTAL_CABECERA;
      h += "<h1>Faltan datos</h1><p>Elige una red (máx. 32 caracteres) y revisa la contraseña (máx. 63).</p><a href=\"/\">Volver</a>";
      h += PORTAL_PIE;
      web.send(400, "text/html; charset=utf-8", h);
      return;
    }
    Preferences p;
    p.begin("wifi", false);
    p.putString("ssid", red);
    p.putString("pass", clave);
    p.end();
    String h = PORTAL_CABECERA;
    h += "<h1>Guardado</h1><p>El detector se reinicia y se conecta a <b>" + htmlEsc(red) + "</b>. Puedes cerrar esta página.</p>";
    h += PORTAL_PIE;
    web.send(200, "text/html; charset=utf-8", h);
    delay(1500);
    ESP.restart();
  });
  // Los celulares piden páginas de prueba (generate_204, hotspot-detect...): se les manda al portal.
  web.onNotFound([&]() {
    web.sendHeader("Location", String("http://") + ip.toString() + "/", true);
    web.send(302, "text/plain", "");
  });
  web.begin();

  Serial.printf("Portal: conéctate a la red %s (clave %s) y abre http://%s\n", ap, PORTAL_CLAVE, ip.toString().c_str());
  uint32_t t0 = millis();
  while (millis() - t0 < PORTAL_MAX_MS) {
    dns.processNextRequest();
    web.handleClient();
    digitalWrite(PIN_LED, (millis() / 150) % 2);   // parpadeo rápido: modo configuración
    delay(2);
  }
  Serial.println("Portal sin usar, reiniciando...");
  ESP.restart();
}

// ¿Botón presionado al encender durante PORTAL_BOTON_MS? Entonces se abre el portal.
bool botonPideConfiguracion() {
  if (digitalRead(PIN_BOTON) != LOW) return false;
  uint32_t t0 = millis();
  while (digitalRead(PIN_BOTON) == LOW) {
    digitalWrite(PIN_LED, (millis() / 100) % 2);
    if (millis() - t0 >= PORTAL_BOTON_MS) return true;
    delay(10);
  }
  return false;
}

// Doble reinicio: se pulsa EN dos veces seguidas (la segunda dentro de DOBLE_REINICIO_MS del
// arranque). El arranque deja una marca en NVS; si al arrancar ya está puesta, el anterior fue
// cortado en seguida por otro reinicio. Se borra al pasar la ventana.
bool dobleReinicio() {
  Preferences p;
  p.begin("wifi", false);
  if (p.getBool("dr", false)) { p.putBool("dr", false); p.end(); return true; }
  p.putBool("dr", true);
  uint32_t t0 = millis();
  while (millis() - t0 < DOBLE_REINICIO_MS) {
    digitalWrite(PIN_LED, (millis() / 500) % 2);   // parpadeo lento: ventana abierta
    delay(20);
  }
  p.putBool("dr", false);
  p.end();
  digitalWrite(PIN_LED, LOW);
  return false;
}

void conectarWiFi() {
  cargarCredenciales();
  if (botonPideConfiguracion() || dobleReinicio()) portalWifi();
  WiFi.mode(WIFI_STA);
  { char h[16]; snprintf(h, sizeof h, "sismo-nodo-%d", NODO); WiFi.setHostname(h); }   // IP por DHCP
  WiFi.setSleep(false);   // sin ahorro de energía: menos latencia en UDP
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssidWifi.c_str(), passWifi.c_str());
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {   // solo al arrancar: Raft todavía no corre
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    delay(250);
    if (millis() - t0 > WIFI_LIMITE_MS) {
      Serial.println("No se pudo conectar al WiFi: abriendo el portal de configuración");
      portalWifi();
    }
  }
  Serial.printf("nodo-%d conectado a %s, IP %s\n", NODO, ssidWifi.c_str(), WiFi.localIP().toString().c_str());
}

// Ya andando: la reconexión la hace el propio WiFi; si tarda, se vuelve a pedir sin esperar.
// Si el router se apaga, WiFi.reconnect() del ESP32 a veces se queda trabado. Se escala:
// cada 20 s reconnect(); cada 3 intentos, reconexión completa; a los 3 min, reinicio.
void vigilarWiFi(uint64_t ahora) {
  if (WiFi.status() == WL_CONNECTED) {
    wifiCaidoDesde = 0;
    reintentosWifi = 0;
    proximoReintentoWifi = ahora + WIFI_REINTENTO_MS;
    return;
  }
  if (wifiCaidoDesde == 0) wifiCaidoDesde = ahora;
  if (ahora - wifiCaidoDesde > WIFI_REINICIO_MS) {
    Serial.println("Sin WiFi hace 3 min, reiniciando");
    delay(100);   // deja salir el mensaje; ya no hay red que atender
    ESP.restart();
  }
  if (ahora >= proximoReintentoWifi) {
    reintentosWifi++;
    if (reintentosWifi % 3 == 0) {
      Serial.println("WiFi caído, reconexión completa");
      WiFi.disconnect(false, false);
      WiFi.begin(ssidWifi.c_str(), passWifi.c_str());
    } else {
      Serial.println("WiFi caído, pidiendo reconexión");
      WiFi.reconnect();
    }
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
    if (nucleo::decodificar((const char*)paquete, (size_t)n, m)) {
      if (m.de >= 1 && m.de <= 3 && m.de != NODO) ipNodos[m.de - 1] = udp.remoteIP();
      raft->recibir(m, ahora);
    }
  }
}

// Cada HOLA_CADA_MS se anuncia por broadcast y se escuchan los anuncios de los demás.
// Si el DHCP le da otra IP a un nodo, los otros lo notan en el siguiente anuncio.
void descubrirNodos(uint64_t ahora) {
  if (WiFi.status() != WL_CONNECTED) return;
  int len;
  while ((len = udpDescubrir.parsePacket()) > 0) {
    char buf[16] = {0};
    int n = udpDescubrir.read(buf, sizeof buf - 1);
    int de = 0;
    if (n > 0 && sscanf(buf, "SISMO-HOLA:%d", &de) == 1 && de >= 1 && de <= 3 && de != NODO)
      ipNodos[de - 1] = udpDescubrir.remoteIP();
  }
  if (ahora >= proximoHola) {
    proximoHola = ahora + HOLA_CADA_MS;
    udpDescubrir.beginPacket(WiFi.broadcastIP(), PUERTO_DESCUBRIR);
    udpDescubrir.printf("SISMO-HOLA:%d", NODO);
    udpDescubrir.endPacket();
  }
}

void enviarSalidas() {
  std::vector<nucleo::Salida> salidas = raft->sacarSalidas();
  if (WiFi.status() != WL_CONNECTED) return;   // Raft tolera la pérdida
  for (const nucleo::Salida& s : salidas) {
    if (s.a < 1 || s.a > 3 || s.a == NODO) continue;
    if (ipNodos[s.a - 1] == IPAddress((uint32_t)0)) continue;   // aún no se descubrió
    std::string datos = nucleo::codificar(s.msg);
    udp.beginPacket(ipNodos[s.a - 1], PUERTO_RAFT);
    udp.write((const uint8_t*)datos.data(), datos.size());
    udp.endPacket();
  }
}

// ---------------------------------------------------------------- huella WiFi

// Referencia guardada como [["aa:bb:..",-55],...]. Si falta o no sirve, queda sin referencia.
void cargarHuella() {
  prefsUbic.begin("ubic", false);
  // Una huella pedida antes de reiniciar sigue pendiente: /estado no muestra la referencia vieja.
  huellaPedida = prefsUbic.getBool("pide", false);
  if (huellaPedida) Serial.println("huella pedida antes de reiniciar: se toma en el próximo escaneo");
  String texto = prefsUbic.getString("ref", "");
  if (texto.length() == 0) return;
  JsonDocument doc;
  if (deserializeJson(doc, texto) || !doc.is<JsonArray>()) return;
  JsonArray lista = doc.as<JsonArray>();
  if (lista.size() == 0 || lista.size() > MAX_APS_HUELLA) return;
  std::vector<nucleo::Ap> ref;
  for (JsonVariant item : lista) {
    if (!item.is<JsonArray>() || item.size() != 2 || !item[0].is<const char*>() || !item[1].is<int>()) return;
    ref.push_back({item[0].as<const char*>(), item[1].as<int>()});
  }
  detectorMov.fijarReferencia(nucleo::mejoresAps(ref, MAX_APS_HUELLA));
  // Si ya se había movido antes de reiniciar, sigue movido y el suceso no se registra otra vez.
  detectorMov.restaurarMovido(prefsUbic.getBool("mov", false));
  movidoAvisado = detectorMov.movido();
  Serial.printf("huella de referencia cargada: %u AP%s\n", (unsigned)ref.size(), movidoAvisado ? " (movido)" : "");
}

void guardarHuella(const std::vector<nucleo::Ap>& ref) {
  JsonDocument doc;
  JsonArray lista = doc.to<JsonArray>();
  for (const nucleo::Ap& ap : ref) {
    JsonArray item = lista.add<JsonArray>();
    item.add(ap.bssid);
    item.add(ap.rssi);
  }
  std::string s;
  serializeJson(doc, s);
  prefsUbic.putString("ref", s.c_str());
}

// Escanear desvía la radio casi 1 s: no se hace siendo líder con entradas sin replicar.
bool puedeEscanear(uint64_t ahora) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (raft->rol() == nucleo::Rol::Lider && raft->commitIndex() < raft->logLen()) return false;
  if (escaneosLanzados > 0 && ahora - inicioEscaneo < ESCANEO_MIN_MS) return false;
  if (huellaPedida && !raft->caido()) return true;   // la referencia pedida va en cuanto se pueda
  // Tras arrancar, dos escaneos seguidos (15 s y 30 s) para notar pronto si lo movieron apagado.
  if (escaneosLanzados == 0) return ahora >= ESCANEO_PRIMERO_MS;
  if (escaneosLanzados == 1) return ahora >= ESCANEO_SEGUNDO_MS;
  return ahora - inicioEscaneo >= ESCANEO_CADA_MS;
}

// Con el escaneo terminado: fija la referencia pedida o compara contra la que hay.
void procesarEscaneo(int n) {
  std::vector<nucleo::Ap> vistas;
  for (int i = 0; i < n; i++) {
    String bssid = WiFi.BSSIDstr(i);
    bssid.toLowerCase();
    vistas.push_back({bssid.c_str(), (int)WiFi.RSSI(i)});
  }
  WiFi.scanDelete();
  if (vistas.empty()) return;   // sin AP no sirve de referencia ni cuenta como escaneo malo
  if (huellaPedida && !raft->caido()) {
    // La referencia son los más fuertes; la comparación usa todo lo visto (sin repetidos).
    std::vector<nucleo::Ap> mejores = nucleo::mejoresAps(vistas, MAX_APS_HUELLA);
    detectorMov.fijarReferencia(mejores);   // también limpia "movido"
    guardarHuella(mejores);
    prefsUbic.putBool("mov", false);
    prefsUbic.putBool("pide", false);
    huellaPedida = false;
    movidoAvisado = false;
    Serial.printf("huella de referencia nueva: %u AP\n", (unsigned)mejores.size());
    return;
  }
  // Parecido = proporción de la referencia que sigue visible: se compara contra el escaneo completo,
  // así unos AP nuevos más fuertes no desplazan a los de referencia.
  detectorMov.nuevoEscaneo(nucleo::mejoresAps(vistas, vistas.size()));
  if (detectorMov.movido() && !movidoAvisado) {
    raft->registrarSuceso("movido", "Servidor " + std::to_string(NODO) + " detectó que lo movieron");
    prefsUbic.putBool("mov", true);   // sobrevive a un reinicio
    movidoAvisado = true;
  }
}

void vigilarHuella(uint64_t ahora) {
  if (escaneando) {
    int n = WiFi.scanComplete();
    if (n == WIFI_SCAN_RUNNING) {
      if (ahora - inicioEscaneo < ESCANEO_LIMITE_MS) return;
      Serial.println("escaneo WiFi sin terminar, se descarta");
      esp_wifi_scan_stop();   // si no, el driver sigue escaneando y el próximo scanNetworks falla
      WiFi.scanDelete();
      escaneando = false;
      return;
    }
    escaneando = false;
    if (n < 0) {   // WIFI_SCAN_FAILED: se reintenta en el próximo turno permitido
      WiFi.scanDelete();
      return;
    }
    procesarEscaneo(n);
    return;
  }
  if (!puedeEscanear(ahora)) return;
  escaneosLanzados++;
  inicioEscaneo = ahora;   // también si falla al lanzarse: así no se insiste en cada vuelta
  WiFi.setScanActiveMinTime(ESCANEO_MIN_MS_POR_CANAL);   // así el mínimo no queda por encima del máximo
  int r = WiFi.scanNetworks(true, false, false, ESCANEO_MS_POR_CANAL);   // asíncrono y activo
  escaneando = r == WIFI_SCAN_RUNNING;
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

// Todas las respuestas: sin caché. "Connection: close" ya lo agrega WebServer en cada envío.
void sinCache() { servidor.sendHeader("Cache-Control", "no-store"); }

void responder(int codigo, const std::string& json) {
  sinCache();
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
  // Con una huella pedida y aún sin tomar, la vista muestra "Tomando huella WiFi…" (y el servidor
  // la vuelve a pedir si el nodo reinicia antes del escaneo).
  info.movido = detectorMov.movido() && !huellaPedida;
  info.conHuella = detectorMov.tieneReferencia() && !huellaPedida;
  // Solo lo usa la página de estado del propio nodo (GET /): distingue "tomando referencia…" de
  // "sin referencia". El panel web no lo lee.
  servidor.sendHeader("X-Huella-Pedida", huellaPedida ? "1" : "0");
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

// POST /huella → 202 {"ok":true}: el próximo escaneo permitido fija la huella de referencia.
// 409 si el nodo está caído.
void enHuella() {
  if (raft->caido()) return responderError(409, "caido");
  huellaPedida = true;
  prefsUbic.putBool("pide", true);   // si reinicia antes del escaneo, sigue pedida
  responder(202, "{\"ok\":true}");
}

// GET / → página de estado del nodo (pagina.h).
void enRaiz() {
  sinCache();
  servidor.send_P(200, "text/html; charset=utf-8", PAGINA, sizeof(PAGINA) - 1);   // sin copiarla al heap
}

// Preflight CORS del navegador y rutas desconocidas.
void enOtro() {
  if (servidor.method() == HTTP_OPTIONS) {
    sinCache();
    servidor.sendHeader("Access-Control-Allow-Origin", "*");
    servidor.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    servidor.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    servidor.send(204);
    return;
  }
  responderError(404, "no existe");
}

void iniciarHttp() {
  servidor.on("/", HTTP_GET, enRaiz);
  servidor.on("/estado", HTTP_GET, enEstado);
  servidor.on("/log", HTTP_GET, enLog);
  servidor.on("/sucesos", HTTP_GET, enSucesos);
  servidor.on("/alertas", HTTP_GET, enAlertas);
  servidor.on("/control", HTTP_POST, enControl);
  servidor.on("/pulsar", HTTP_POST, enPulsar);
  servidor.on("/huella", HTTP_POST, enHuella);
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

  persistencia.abrir();
  cargarHuella();

  conectarWiFi();
  pedirHora();
  proximoNtp = ahoraMs() + NTP_CADA_MS;

  nucleo::ConfigRaft cfg;
  cfg.yo = NODO;
  cfg.semilla = esp_random();
  cfg.latidoMs = RAFT_LATIDO_MS;
  cfg.eleccionMinMs = RAFT_ELECCION_MIN_MS;
  cfg.eleccionMaxMs = RAFT_ELECCION_MAX_MS;
  raft = new nucleo::Raft(cfg, persistencia, ahoraEpochMs);
  Serial.printf("término guardado %lu, voto %d\n", (unsigned long)raft->termino(), raft->votadoPor());

  udp.begin(PUERTO_RAFT);
  udpDescubrir.begin(PUERTO_DESCUBRIR);
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
  descubrirNodos(ahora);
  recibirUdp(ahora);
  raft->tick(ahora);
  leerBoton(ahora);
  servidor.handleClient();
  enviarSalidas();
  ArduinoOTA.handle();
  vigilarHuella(ahora);

  if (ahora >= proximoNtp) {
    pedirHora();
    proximoNtp = ahora + NTP_CADA_MS;
  }
  imprimirSucesos();
  actualizarLed(ahora);
  delay(1);   // cede la CPU a las tareas de WiFi
}
