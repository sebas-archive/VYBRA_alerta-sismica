#include <ArduinoJson.h>
#include "nucleo/api.h"
#include "prueba.h"
#include "red_simulada.h"
using namespace nucleo;

static const uint32_t kSemilla = 7;

static Evento evento(const std::string& id, int nodo, uint64_t t, int nivel = 5) {
  Evento ev;
  ev.id = id;
  ev.nodo = nodo;
  ev.nivel = nivel;
  ev.duracion_ms = 2300;
  ev.pga = 0.183f;
  ev.t = t;
  ev.recibido_por = nodo;
  return ev;
}

static int elegir(RedSimulada& red) {
  red.avanzar(5000);
  auto l = red.lideres();
  return l ? *l : 0;
}

// Texto de una variante JSON ("" si falta), para comparar sin romper con nulos.
static std::string str(JsonVariantConst v) { return v.is<const char*>() ? v.as<const char*>() : ""; }

static bool parsear(const std::string& s, JsonDocument& doc) {
  return !deserializeJson(doc, s);
}

PRUEBA(estado_menos_de_1kb) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  InfoRed info{"192.168.80.201", -52, 123456, true, true, false};
  std::string s = jsonEstado(red.nodo(l), l, info);
  CHECK(s.size() < 1024);
  // Peor caso de largo: números grandes en todos los campos.
  InfoRed grande{"192.168.180.255", -100, 18446744073709551615ull, false, false, false};
  CHECK(jsonEstado(red.nodo(l), l, grande).size() < 1024);
  JsonDocument doc;
  CHECK(parsear(s, doc));
  const char* claves[] = {"nodo", "rol", "caido", "termino", "votado_por", "lider_conocido", "log_len",
                          "commit_index", "pendientes", "log_lleno", "sucesos_seq", "con_hora", "ip",
                          "rssi", "uptime_ms", "movido", "con_huella", "situacion"};
  for (const char* k : claves) {
    if (doc[k].isNull()) std::printf("  falta la clave %s\n", k);
    CHECK(!doc[k].isNull());
  }
  CHECK_EQ(doc.size(), sizeof(claves) / sizeof(claves[0]));
  const Raft& r = red.nodo(l);
  CHECK_EQ(doc["nodo"].as<int>(), l);
  CHECK_EQ(str(doc["rol"]), std::string("lider"));
  CHECK_EQ(doc["caido"].as<bool>(), false);
  CHECK_EQ(doc["termino"].as<uint32_t>(), r.termino());
  CHECK_EQ(doc["votado_por"].as<int>(), r.votadoPor());
  CHECK_EQ(doc["lider_conocido"].as<int>(), l);
  CHECK_EQ(doc["log_len"].as<uint32_t>(), r.logLen());
  CHECK_EQ(doc["commit_index"].as<uint32_t>(), r.commitIndex());
  CHECK_EQ(doc["pendientes"].as<int>(), 0);
  CHECK_EQ(doc["log_lleno"].as<bool>(), false);
  CHECK_EQ(doc["sucesos_seq"].as<uint32_t>(), r.sucesosSeq());
  CHECK_EQ(doc["con_hora"].as<bool>(), true);
  CHECK_EQ(str(doc["ip"]), std::string("192.168.80.201"));
  CHECK_EQ(doc["rssi"].as<int>(), -52);
  CHECK_EQ(doc["uptime_ms"].as<uint64_t>(), 123456u);
  CHECK_EQ(doc["movido"].as<bool>(), true);
  CHECK_EQ(doc["con_huella"].as<bool>(), false);
  CHECK_EQ(str(doc["situacion"]), std::string("funcionando"));

  // Un seguidor caído: rol "seguidor" y caido true; uptime de 64 bits sin truncar.
  int s2 = l == 1 ? 2 : 1;
  red.nodo(s2).caer(red.ahora());
  InfoRed info2{"192.168.80.202", -70, 5000000000ull, false, false, false};
  JsonDocument d2;
  CHECK(parsear(jsonEstado(red.nodo(s2), s2, info2), d2));
  CHECK_EQ(str(d2["rol"]), std::string("seguidor"));
  CHECK_EQ(d2["caido"].as<bool>(), true);
  CHECK_EQ(d2["con_hora"].as<bool>(), false);
  CHECK_EQ(d2["uptime_ms"].as<uint64_t>(), 5000000000ull);
  CHECK_EQ(str(d2["situacion"]), std::string("caido"));
}

PRUEBA(log_paginado_de_a_50) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  Raft& L = red.nodo(l);
  int i = 0;
  while (L.logLen() < 120 && i < 200) {
    CHECK(L.proponer(evento("p-" + std::to_string(i), 1 + i % 3, 0), red.ahora()) == Propuesta::Aceptada);
    i++;
  }
  red.avanzar(2000);
  CHECK_EQ(L.logLen(), 120u);
  CHECK_EQ(L.commitIndex(), 120u);

  JsonDocument d1;
  CHECK(parsear(jsonLog(L, 1), d1));
  CHECK_EQ(d1["desde"].as<int>(), 1);
  CHECK_EQ(d1["log_len"].as<int>(), 120);
  CHECK_EQ(d1["commit_index"].as<int>(), 120);
  CHECK_EQ(d1["entradas"].size(), 50u);
  CHECK_EQ(d1["entradas"][0]["i"].as<int>(), 1);
  CHECK_EQ(d1["entradas"][49]["i"].as<int>(), 50);

  JsonDocument d2;
  CHECK(parsear(jsonLog(L, 101), d2));
  CHECK_EQ(d2["desde"].as<int>(), 101);
  CHECK_EQ(d2["entradas"].size(), 20u);
  CHECK_EQ(d2["entradas"][0]["i"].as<int>(), 101);
  CHECK_EQ(d2["entradas"][19]["i"].as<int>(), 120);

  // desde 0 se trata como 1; más allá del final, sin entradas.
  JsonDocument d3;
  CHECK(parsear(jsonLog(L, 0), d3));
  CHECK_EQ(d3["desde"].as<int>(), 1);
  CHECK_EQ(d3["entradas"].size(), 50u);
  JsonDocument d4;
  CHECK(parsear(jsonLog(L, 121), d4));
  CHECK_EQ(d4["entradas"].size(), 0u);
  CHECK(d4["entradas"].is<JsonArrayConst>());
}

PRUEBA(log_marca_en_alerta) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  Raft& L = red.nodo(l);
  const uint64_t t0 = 1793650000123ull;
  CHECK(L.proponer(evento("nodo-1-ab12cd34-1", 1, t0, 6), red.ahora()) == Propuesta::Aceptada);
  CHECK(L.proponer(evento("nodo-2-ab12cd34-1", 2, t0 + 3000, 7), red.ahora()) == Propuesta::Aceptada);
  CHECK(L.proponer(evento("nodo-3-ab12cd34-1", 3, t0 + 60000, 4), red.ahora()) == Propuesta::Aceptada);
  red.avanzar(1000);
  CHECK_EQ(L.commitIndex(), L.logLen());

  std::string s = jsonLog(L, 1);
  CHECK(s.find("\"pga\":0.183") != std::string::npos);
  CHECK(s.find("\"t\":1793650000123") != std::string::npos);
  JsonDocument d;
  CHECK(parsear(s, d));
  JsonArrayConst es = d["entradas"].as<JsonArrayConst>();
  CHECK_EQ(es.size(), 4u);
  if (es.size() != 4) return;

  // La primera es el inicio de término del líder.
  CHECK_EQ(str(es[0]["clase"]), std::string("inicio_termino"));
  CHECK_EQ(es[0]["lider"].as<int>(), l);
  CHECK_EQ(es[0]["T"].as<uint32_t>(), L.termino());
  CHECK(es[0]["ev"].isNull());
  CHECK(es[0]["en_alerta"].isNull());

  // Eventos: forma completa y en_alerta solo para los del grupo.
  JsonObjectConst e1 = es[1];
  CHECK_EQ(str(e1["clase"]), std::string("evento"));
  CHECK_EQ(e1["i"].as<int>(), 2);
  CHECK_EQ(str(e1["ev"]["id"]), std::string("nodo-1-ab12cd34-1"));
  CHECK_EQ(e1["ev"]["nodo"].as<int>(), 1);
  CHECK_EQ(e1["ev"]["nivel"].as<int>(), 6);
  CHECK_EQ(e1["ev"]["duracion_ms"].as<uint32_t>(), 2300u);
  CHECK_EQ(e1["ev"]["t"].as<uint64_t>(), t0);
  CHECK(e1["ev"]["t_lider"].as<uint64_t>() > 0);
  CHECK_EQ(e1["ev"]["recibido_por"].as<int>(), 1);
  CHECK(e1["ev"]["pga"].is<float>());
  CHECK_EQ(e1["en_alerta"].as<bool>(), true);
  CHECK_EQ(es[2]["en_alerta"].as<bool>(), true);
  CHECK(es[3]["en_alerta"].is<bool>());
  CHECK_EQ(es[3]["en_alerta"].as<bool>(), false);
}

PRUEBA(sucesos_desde) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  Raft& L = red.nodo(l);
  L.caer(red.ahora());
  L.recuperar(red.ahora());
  uint32_t seq = L.sucesosSeq();
  CHECK(seq >= 3);

  JsonDocument d;
  CHECK(parsear(jsonSucesos(L, seq - 2), d));
  CHECK_EQ(d["seq"].as<uint32_t>(), seq);
  JsonArrayConst ss = d["sucesos"].as<JsonArrayConst>();
  CHECK_EQ(ss.size(), 2u);
  if (ss.size() != 2) return;
  CHECK_EQ(ss[0]["seq"].as<uint32_t>(), seq - 1);
  CHECK_EQ(ss[1]["seq"].as<uint32_t>(), seq);
  CHECK_EQ(str(ss[0]["tipo"]), std::string("cayo"));
  CHECK_EQ(str(ss[1]["tipo"]), std::string("recupero"));
  CHECK(str(ss[1]["texto"]).size() > 0);
  CHECK(ss[1]["t"].as<uint64_t>() >= RedSimulada::kEpoch);
  CHECK_EQ(ss[1]["termino"].as<uint32_t>(), L.termino());

  JsonDocument todos;
  CHECK(parsear(jsonSucesos(L, 0), todos));
  CHECK_EQ(todos["sucesos"].size(), L.sucesos().size());
  JsonDocument nada;
  CHECK(parsear(jsonSucesos(L, seq), nada));
  CHECK_EQ(nada["sucesos"].size(), 0u);
  CHECK(nada["sucesos"].is<JsonArrayConst>());
}

PRUEBA(alertas_forma) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  Raft& L = red.nodo(l);

  JsonDocument vacio;
  CHECK(parsear(jsonAlertas(L), vacio));
  CHECK(vacio["alertas"].is<JsonArrayConst>());
  CHECK_EQ(vacio["alertas"].size(), 0u);

  const uint64_t t0 = 1793650000123ull;
  CHECK(L.proponer(evento("a-1", 1, t0, 6), red.ahora()) == Propuesta::Aceptada);
  CHECK(L.proponer(evento("a-2", 2, t0 + 3000, 7), red.ahora()) == Propuesta::Aceptada);
  red.avanzar(1000);

  JsonDocument d;
  CHECK(parsear(jsonAlertas(L), d));
  JsonArrayConst as = d["alertas"].as<JsonArrayConst>();
  CHECK_EQ(as.size(), 1u);
  if (as.size() != 1) return;
  JsonObjectConst a = as[0];
  CHECK_EQ(a["id"].as<uint32_t>(), L.sismo().alertas()[0].id);
  CHECK_EQ(a["promedio"].as<float>(), 6.5f);
  CHECK_EQ(str(a["nivel"]), std::string("media"));
  CHECK_EQ(a["eventos"].size(), 2u);
  CHECK_EQ(str(a["eventos"][0]), std::string("a-2"));
  CHECK_EQ(str(a["eventos"][1]), std::string("a-1"));
  CHECK_EQ(a["termino"].as<uint32_t>(), L.termino());
  CHECK_EQ(a["lider"].as<int>(), l);
}

// ---------------------------------------------------------------- situacion (página de estado)

static std::string sit(const Raft& r) { return situacion(r); }

PRUEBA(situacion_lider_estable_funciona_en_los_3) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  CHECK(red.nodo(l).proponer(evento("s-1", 1, 0), red.ahora()) == Propuesta::Aceptada);
  red.avanzar(1000);
  CHECK_EQ(red.nodo(l).commitIndex(), red.nodo(l).logLen());
  for (int n = 1; n <= 3; n++) CHECK_EQ(sit(red.nodo(n)), std::string("funcionando"));
  // Caído: "caido", aunque antes funcionara.
  red.nodo(l).caer(red.ahora());
  CHECK_EQ(sit(red.nodo(l)), std::string("caido"));
}

PRUEBA(situacion_sin_lider_sincroniza) {
  RedSimulada red(kSemilla);
  // Recién arrancados: nadie conoce un líder.
  for (int n = 1; n <= 3; n++) CHECK_EQ(sit(red.nodo(n)), std::string("sincronizando"));
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  // Cae el líder y los otros dos quedan aislados entre sí: elecciones sin ganador.
  red.nodo(l).caer(red.ahora());
  int a = l == 1 ? 2 : 1, b = 6 - l - a;
  red.partir({a}, {b});
  red.avanzar(5000);
  CHECK(!red.lideres());
  CHECK(red.nodo(a).rol() == Rol::Candidato || red.nodo(a).lider() == 0);
  CHECK_EQ(sit(red.nodo(a)), std::string("sincronizando"));
  CHECK_EQ(sit(red.nodo(b)), std::string("sincronizando"));
  CHECK_EQ(sit(red.nodo(l)), std::string("caido"));
}

PRUEBA(situacion_seguidor_reiniciado_sincroniza_hasta_alcanzar) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  for (int i = 0; i < 40; i++)
    CHECK(red.nodo(l).proponer(evento("r-" + std::to_string(i), 1, 0), red.ahora()) == Propuesta::Aceptada);
  red.avanzar(1000);
  int f = l == 1 ? 2 : 1;
  // Se reinicia y los appends con entradas hacia él se pierden: conoce al líder pero no su log.
  red.reiniciar(f);
  red.setFiltro([f](int, int a, const Msg& m) { return a == f && m.tipo == Tipo::Append && !m.entradas.empty(); });
  red.avanzar(1000);
  CHECK_EQ(red.nodo(f).lider(), l);
  CHECK(red.nodo(f).commitIndex() < red.nodo(f).commitLider());
  CHECK_EQ(sit(red.nodo(f)), std::string("sincronizando"));
  CHECK_EQ(sit(red.nodo(l)), std::string("funcionando"));
  red.setFiltro(nullptr);
  red.avanzar(1000);
  CHECK_EQ(red.nodo(f).commitIndex(), red.nodo(l).commitIndex());
  CHECK_EQ(sit(red.nodo(f)), std::string("funcionando"));
}

PRUEBA(situacion_lider_solo_con_propuesta_sin_confirmar) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  for (int n = 1; n <= 3; n++)
    if (n != l) red.nodo(n).caer(red.ahora());
  red.avanzar(500);
  CHECK(red.nodo(l).rol() == Rol::Lider);
  CHECK_EQ(sit(red.nodo(l)), std::string("funcionando"));
  CHECK(red.nodo(l).proponer(evento("solo-1", l, 0), red.ahora()) == Propuesta::Aceptada);
  red.avanzar(1000);
  CHECK(red.nodo(l).commitIndex() < red.nodo(l).logLen());
  CHECK_EQ(sit(red.nodo(l)), std::string("sincronizando"));
}
