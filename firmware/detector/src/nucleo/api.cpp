#include "api.h"
#include <ArduinoJson.h>
#include <cmath>

// Las horas (t, t_lider, uptime) son ms epoch de 64 bits: no deben truncarse en el ESP32.
static_assert(ARDUINOJSON_USE_LONG_LONG == 1, "ArduinoJson debe guardar enteros de 64 bits");

namespace nucleo {

static const char* nombreRol(Rol r) {
  switch (r) {
    case Rol::Lider: return "lider";
    case Rol::Candidato: return "candidato";
    default: return "seguidor";
  }
}

// Redondea a 3 decimales para que 0.183f salga "0.183" y no "0.18299999".
static double tresDecimales(float x) { return std::round((double)x * 1000.0) / 1000.0; }

static std::string texto(const JsonDocument& doc) {
  std::string s;
  serializeJson(doc, s);
  return s;
}

std::string jsonEstado(const Raft& r, int nodo, const InfoRed& red) {
  JsonDocument doc;
  doc["nodo"] = nodo;
  doc["rol"] = nombreRol(r.rol());
  doc["caido"] = r.caido();
  doc["termino"] = r.termino();
  doc["votado_por"] = r.votadoPor();
  doc["lider_conocido"] = r.lider();
  doc["log_len"] = r.logLen();
  doc["commit_index"] = r.commitIndex();
  doc["pendientes"] = (uint32_t)r.pendientes();
  doc["log_lleno"] = r.logLleno();
  doc["sucesos_seq"] = r.sucesosSeq();
  doc["con_hora"] = red.conHora;
  doc["ip"] = red.ip;
  doc["rssi"] = red.rssi;
  doc["uptime_ms"] = red.uptimeMs;
  doc["movido"] = red.movido;
  doc["con_huella"] = red.conHuella;
  return texto(doc);
}

std::string jsonLog(const Raft& r, uint32_t desde) {
  if (desde < 1) desde = 1;
  const std::vector<Entrada>& log = r.log();
  const Sismo& sismo = r.sismo();
  JsonDocument doc;
  doc["desde"] = desde;
  doc["log_len"] = r.logLen();
  doc["commit_index"] = r.commitIndex();
  JsonArray arr = doc["entradas"].to<JsonArray>();
  for (uint32_t i = desde; i <= log.size() && i < desde + kPaginaLog; i++) {
    const Entrada& e = log[i - 1];
    JsonObject o = arr.add<JsonObject>();
    o["i"] = e.indice;
    o["T"] = e.termino;
    if (e.clase == Clase::InicioTermino) {
      o["clase"] = "inicio_termino";
      o["lider"] = e.lider;
      continue;
    }
    o["clase"] = "evento";
    JsonObject ev = o["ev"].to<JsonObject>();
    ev["id"] = e.ev.id;
    ev["nodo"] = e.ev.nodo;
    ev["nivel"] = e.ev.nivel;
    ev["pga"] = tresDecimales(e.ev.pga);
    ev["duracion_ms"] = e.ev.duracion_ms;
    ev["t"] = e.ev.t;
    ev["t_lider"] = e.ev.t_lider;
    ev["recibido_por"] = e.ev.recibido_por;
    o["en_alerta"] = sismo.enAlerta(e.ev.id);
  }
  return texto(doc);
}

std::string jsonSucesos(const Raft& r, uint32_t desde) {
  JsonDocument doc;
  doc["seq"] = r.sucesosSeq();
  JsonArray arr = doc["sucesos"].to<JsonArray>();
  for (const Suceso& s : r.sucesos()) {
    if (s.seq <= desde) continue;
    JsonObject o = arr.add<JsonObject>();
    o["seq"] = s.seq;
    o["t"] = s.t;
    o["tipo"] = s.tipo;
    o["texto"] = s.texto;
    o["termino"] = s.termino;
  }
  return texto(doc);
}

std::string jsonAlertas(const Raft& r) {
  JsonDocument doc;
  JsonArray arr = doc["alertas"].to<JsonArray>();
  for (const Alerta& a : r.sismo().alertas()) {
    JsonObject o = arr.add<JsonObject>();
    o["id"] = a.id;
    o["promedio"] = tresDecimales(a.promedio);
    o["nivel"] = Sismo::nivelAlerta(a.promedio);
    JsonArray ids = o["eventos"].to<JsonArray>();
    for (const std::string& id : a.eventos) ids.add(id);
    o["termino"] = a.termino;
    o["lider"] = a.lider;
  }
  return texto(doc);
}

}  // namespace nucleo
