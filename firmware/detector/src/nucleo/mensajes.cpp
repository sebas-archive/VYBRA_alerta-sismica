#include "mensajes.h"
#include <ArduinoJson.h>

namespace nucleo {

// Claves: k tipo, d de, T término, li/lt último idx/term, g concedido,
// pi/pt prev idx/term, c commit, e entradas, o ok, m match, v evento, i id.
// Evento: i id, n nodo, l nivel, g pga, u duración, t hora, L hora líder, r recibido_por.
// Entrada: x índice, T término, c clase, l líder, v evento.

static void evAJson(JsonObject o, const Evento& e) {
  o["i"] = e.id;
  o["n"] = e.nodo;
  o["l"] = e.nivel;
  o["g"] = e.pga;
  o["u"] = e.duracion_ms;
  o["t"] = e.t;
  o["L"] = e.t_lider;
  o["r"] = e.recibido_por;
}

static void evDeJson(JsonObjectConst o, Evento& e) {
  e.id = o["i"] | "";
  e.nodo = o["n"] | 0;
  e.nivel = o["l"] | 0;
  e.pga = o["g"] | 0.0f;
  e.duracion_ms = o["u"] | 0u;
  e.t = o["t"] | (uint64_t)0;
  e.t_lider = o["L"] | (uint64_t)0;
  e.recibido_por = o["r"] | 0;
}

std::string codificar(const Msg& m) {
  JsonDocument doc;
  doc["k"] = (int)m.tipo;
  doc["d"] = m.de;
  doc["T"] = m.termino;
  switch (m.tipo) {
    case Tipo::VoteReq:
      doc["li"] = m.last_idx;
      doc["lt"] = m.last_term;
      break;
    case Tipo::VoteResp:
      doc["g"] = m.concedido;
      break;
    case Tipo::Append: {
      doc["pi"] = m.prev_idx;
      doc["pt"] = m.prev_term;
      doc["c"] = m.commit;
      JsonArray arr = doc["e"].to<JsonArray>();
      for (const Entrada& en : m.entradas) {
        JsonObject o = arr.add<JsonObject>();
        o["x"] = en.indice;
        o["T"] = en.termino;
        o["c"] = (int)en.clase;
        o["l"] = en.lider;
        evAJson(o["v"].to<JsonObject>(), en.ev);
      }
      break;
    }
    case Tipo::AppendResp:
      doc["o"] = m.ok;
      doc["m"] = m.match_idx;
      break;
    case Tipo::Forward:
      evAJson(doc["v"].to<JsonObject>(), m.ev);
      break;
    case Tipo::ForwardAck:
      doc["i"] = m.id;
      break;
  }
  std::string s;
  serializeJson(doc, s);
  return s;
}

bool decodificar(const char* datos, size_t len, Msg& out) {
  JsonDocument doc;
  if (deserializeJson(doc, datos, len)) return false;
  if (!doc.is<JsonObject>() || doc["k"].isNull()) return false;
  int k = doc["k"] | -1;
  if (k < 0 || k > (int)Tipo::ForwardAck) return false;
  Msg m;
  m.tipo = (Tipo)k;
  m.de = doc["d"] | 0;
  m.termino = doc["T"] | 0u;
  switch (m.tipo) {
    case Tipo::VoteReq:
      m.last_idx = doc["li"] | 0u;
      m.last_term = doc["lt"] | 0u;
      break;
    case Tipo::VoteResp:
      m.concedido = doc["g"] | false;
      break;
    case Tipo::Append:
      m.prev_idx = doc["pi"] | 0u;
      m.prev_term = doc["pt"] | 0u;
      m.commit = doc["c"] | 0u;
      for (JsonObjectConst o : doc["e"].as<JsonArrayConst>()) {
        Entrada en;
        en.indice = o["x"] | 0u;
        en.termino = o["T"] | 0u;
        en.clase = (o["c"] | 1) == 0 ? Clase::InicioTermino : Clase::Evento;
        en.lider = o["l"] | 0;
        evDeJson(o["v"].as<JsonObjectConst>(), en.ev);
        m.entradas.push_back(en);
      }
      break;
    case Tipo::AppendResp:
      m.ok = doc["o"] | false;
      m.match_idx = doc["m"] | 0u;
      break;
    case Tipo::Forward:
      evDeJson(doc["v"].as<JsonObjectConst>(), m.ev);
      break;
    case Tipo::ForwardAck:
      m.id = doc["i"] | "";
      break;
  }
  out = m;
  return true;
}

}  // namespace nucleo
