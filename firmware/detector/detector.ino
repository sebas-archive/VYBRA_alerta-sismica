// Detector sísmico para ESP32 DevKit V1 (30 pines).
// Hardware: pulsador entre D4 y GND (diagonal en la protoboard). LED azul integrado en GPIO 2.
// Más tiempo presionado = sismo más fuerte: nivel 1 + uno cada 450 ms, máximo 10.
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <sys/time.h>
#include "config.h"

#ifndef NODO
#error "Compila con ./cargar.sh 1, 2 o 3 para elegir el detector"
#endif
#if NODO < 1 || NODO > 3
#error "NODO debe ser 1, 2 o 3"
#endif

#define STR2(x) #x
#define STR(x) STR2(x)
const char* NODO_ID = "nodo-" STR(NODO);
const int SERVIDOR_PREFERIDO = NODO - 1;   // cada detector reporta primero "a su" servidor

const int PIN_BOTON = 4;
const int PIN_LED = 2;
const unsigned long PULSO_MIN_MS = 80;      // toques más cortos se ignoran
const unsigned long WIFI_LIMITE_MS = 30000; // sin WiFi en 30 s: reinicia

bool pulsando = false;
unsigned long tPulso = 0;
uint32_t arranque = 0;   // aleatorio por arranque, para que los id no se repitan
uint32_t contador = 0;

int nivelPorTiempo(unsigned long ms) { return min(10, 1 + (int)(ms / 450)); }

// Hora real en ms desde 1970 si NTP ya sincronizó; 0 si no.
uint64_t ahoraEpochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  if (tv.tv_sec < 1700000000) return 0;
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    delay(250);
    if (millis() - t0 > WIFI_LIMITE_MS) {
      Serial.println("No se pudo conectar al WiFi, reiniciando...");
      delay(500);
      ESP.restart();
    }
  }
  digitalWrite(PIN_LED, HIGH);
  Serial.printf("%s conectado a %s, IP %s\n", NODO_ID, WIFI_SSID, WiFi.localIP().toString().c_str());
}

bool reportar(int nivel, unsigned long ms, uint64_t t) {
  if (WiFi.status() != WL_CONNECTED) { Serial.println("sin WiFi, reporte perdido"); return false; }
  float pga = 0.028 * nivel + 0.015;   // misma escala que el panel
  char id[40];
  snprintf(id, sizeof id, "%s-%08x-%lu", NODO_ID, arranque, (unsigned long)++contador);
  char json[220];
  snprintf(json, sizeof json,
           "{\"id\":\"%s\",\"nodo\":\"%s\",\"nivel\":%d,\"pga\":%.3f,\"duracion_ms\":%lu,\"t\":%llu,\"simulado\":true}",
           id, NODO_ID, nivel, pga, ms, (unsigned long long)t);
  for (int i = 0; i < 3; i++) {   // si el preferido no responde, prueba los otros dos con el mismo id
    int s = (SERVIDOR_PREFERIDO + i) % 3;
    HTTPClient http;
    http.setConnectTimeout(1500);
    http.setTimeout(1500);
    http.begin(String(SERVIDORES[s]) + "/eventos");
    http.addHeader("Content-Type", "application/json");
    int code = http.POST((uint8_t*)json, strlen(json));
    http.end();
    if (code >= 200 && code < 300) {
      Serial.printf("reporte %s aceptado por Servidor %d (nivel %d)\n", id, s + 1, nivel);
      return true;
    }
    Serial.printf("Servidor %d no respondió (%d)\n", s + 1, code);
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_BOTON, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  arranque = esp_random();
  Serial.printf("\nDetector %s\n", NODO_ID);
  conectarWiFi();
  configTime(GMT_OFFSET_S, 0, "pool.ntp.org", "time.google.com");
}

void loop() {
  unsigned long ahora = millis();
  bool abajo = digitalRead(PIN_BOTON) == LOW;

  if (abajo && !pulsando) {   // inicio de pulsación, con antirrebote
    delay(20);
    if (digitalRead(PIN_BOTON) == LOW) { pulsando = true; tPulso = ahora; }
  }
  if (pulsando) {
    int nivel = nivelPorTiempo(ahora - tPulso);
    digitalWrite(PIN_LED, (ahora / (300 / nivel + 30)) % 2);   // más nivel, parpadeo más rápido
    if (!abajo) {
      pulsando = false;
      unsigned long ms = ahora - tPulso;
      if (ms >= PULSO_MIN_MS) reportar(nivelPorTiempo(ms), ms, ahoraEpochMs());
      digitalWrite(PIN_LED, WiFi.status() == WL_CONNECTED);
    }
  }
  if (!pulsando) digitalWrite(PIN_LED, WiFi.status() == WL_CONNECTED);   // LED apagado = sin WiFi
  delay(5);
}
