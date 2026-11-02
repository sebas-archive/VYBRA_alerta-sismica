#include "prueba.h"
#include "red_simulada.h"
using namespace nucleo;

// Semilla fija para que las pruebas sean deterministas (se puede cambiar al compilar
// con -DSEMILLA_PRUEBA=n para buscar fallas intermitentes).
#ifndef SEMILLA_PRUEBA
#define SEMILLA_PRUEBA 7
#endif
static const uint32_t kSemilla = SEMILLA_PRUEBA;

static bool tieneSuceso(const Raft& r, const std::string& tipo) {
  for (const Suceso& s : r.sucesos())
    if (s.tipo == tipo) return true;
  return false;
}

static uint64_t reloj() { return 1700000000000ull; }

PRUEBA(elige_un_unico_lider) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  for (int n = 1; n <= 3; n++) {
    CHECK_EQ(red.nodo(n).lider(), *l);
    if (n != *l) CHECK(red.nodo(n).rol() == Rol::Seguidor);
  }
  CHECK(red.nodo(*l).rol() == Rol::Lider);
}

PRUEBA(lider_agrega_inicio_termino) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  const Raft& L = red.nodo(*l);
  CHECK(L.logLen() >= 1u);
  if (L.logLen() == 0) return;
  const Entrada& e = L.log().back();
  CHECK(e.clase == Clase::InicioTermino);
  CHECK_EQ(e.lider, *l);
  CHECK_EQ(e.termino, L.termino());
  CHECK_EQ(e.indice, L.logLen());
}

PRUEBA(latidos_mantienen_el_lider) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  uint32_t t = red.nodo(*l).termino();
  red.avanzar(30000);
  CHECK(red.lideres() == l);
  CHECK_EQ(red.nodo(*l).termino(), t);
}

PRUEBA(cae_el_lider_y_se_reelige) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  uint32_t t = red.nodo(*l).termino();
  red.nodo(*l).caer(red.ahora());
  CHECK(red.nodo(*l).caido());
  red.avanzar(5000);
  auto l2 = red.lideres();
  CHECK(l2.has_value());
  if (!l2) return;
  CHECK(*l2 != *l);
  CHECK(red.nodo(*l2).termino() > t);
}

PRUEBA(sin_quorum_no_hay_lider) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  int vivo = *l == 1 ? 2 : 1;
  for (int n = 1; n <= 3; n++)
    if (n != vivo) red.nodo(n).caer(red.ahora());
  red.avanzar(10000);
  for (int n = 1; n <= 3; n++) CHECK(red.nodo(n).rol() != Rol::Lider);
  CHECK(!red.lideres().has_value());
  Rol r = red.nodo(vivo).rol();
  CHECK(r == Rol::Candidato || r == Rol::Seguidor);
}

PRUEBA(recuperado_vuelve_como_seguidor) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  red.nodo(*l).caer(red.ahora());
  red.avanzar(5000);
  auto l2 = red.lideres();
  CHECK(l2.has_value());
  if (!l2) return;
  red.nodo(*l).recuperar(red.ahora());
  CHECK(!red.nodo(*l).caido());
  CHECK(red.nodo(*l).rol() == Rol::Seguidor);
  red.avanzar(2000);
  CHECK(red.nodo(*l).rol() == Rol::Seguidor);
  CHECK_EQ(red.nodo(*l).termino(), red.nodo(*l2).termino());
  CHECK_EQ(red.nodo(*l).lider(), *l2);
}

PRUEBA(persiste_termino_y_voto) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  int votantes = 0;
  for (int n = 1; n <= 3; n++) {
    const PersistenciaMem& p = red.persistencia(n);
    CHECK_EQ(p.termino, red.nodo(n).termino());
    CHECK_EQ(p.votadoPor, red.nodo(n).votadoPor());
    if (n != *l && p.votadoPor == *l) votantes++;
  }
  CHECK_EQ(red.persistencia(*l).votadoPor, *l);
  CHECK(votantes >= 1);
  for (int n = 1; n <= 3; n++) {
    uint32_t t = red.nodo(n).termino();
    int v = red.nodo(n).votadoPor();
    red.reiniciar(n);
    CHECK_EQ(red.nodo(n).termino(), t);
    CHECK_EQ(red.nodo(n).votadoPor(), v);
    CHECK_EQ(red.nodo(n).logLen(), 0u);
    CHECK(red.nodo(n).rol() == Rol::Seguidor);
  }
  red.avanzar(5000);
  CHECK(red.lideres().has_value());
  CHECK(!red.violacionSeguridad());
}

PRUEBA(un_voto_por_termino) {
  PersistenciaMem p;
  ConfigRaft c;
  c.yo = 3;
  c.semilla = kSemilla;
  Raft r(c, p, reloj);
  Msg a(Tipo::VoteReq);
  a.de = 1; a.termino = 5;
  r.recibir(a, 100);
  auto s1 = r.sacarSalidas();
  CHECK_EQ(s1.size(), 1u);
  if (s1.size() != 1) return;
  CHECK_EQ(s1[0].a, 1);
  CHECK(s1[0].msg.tipo == Tipo::VoteResp);
  CHECK(s1[0].msg.concedido);
  CHECK_EQ(p.termino, 5u);
  CHECK_EQ(p.votadoPor, 1);

  Msg b(Tipo::VoteReq);
  b.de = 2; b.termino = 5;
  r.recibir(b, 110);
  auto s2 = r.sacarSalidas();
  CHECK_EQ(s2.size(), 1u);
  if (s2.size() != 1) return;
  CHECK_EQ(s2[0].a, 2);
  CHECK(!s2[0].msg.concedido);
  CHECK_EQ(r.votadoPor(), 1);

  // El mismo candidato puede pedir de nuevo (p. ej. si se perdió la respuesta).
  r.recibir(a, 120);
  auto s3 = r.sacarSalidas();
  CHECK_EQ(s3.size(), 1u);
  if (s3.size() == 1) CHECK(s3[0].msg.concedido);
}

PRUEBA(rechaza_voto_si_log_desactualizado) {
  PersistenciaMem p;
  ConfigRaft c;
  c.yo = 1;
  c.semilla = kSemilla;
  Raft r(c, p, reloj);
  // Se vence el temporizador y se postula en el término 1.
  r.tick(0);
  r.tick(5000);
  CHECK(r.rol() == Rol::Candidato);
  CHECK_EQ(r.termino(), 1u);
  auto pedidos = r.sacarSalidas();
  CHECK_EQ(pedidos.size(), 2u);
  // Gana con el voto de 2 y agrega InicioTermino en el índice 1.
  Msg v(Tipo::VoteResp);
  v.de = 2; v.termino = 1; v.concedido = true;
  r.recibir(v, 5010);
  CHECK(r.rol() == Rol::Lider);
  CHECK_EQ(r.logLen(), 1u);
  r.sacarSalidas();
  // 3 pide el voto en el término 2 con un log vacío: sube de término pero no vota.
  Msg q(Tipo::VoteReq);
  q.de = 3; q.termino = 2; q.last_idx = 0; q.last_term = 0;
  r.recibir(q, 5020);
  CHECK(r.rol() == Rol::Seguidor);
  CHECK_EQ(r.termino(), 2u);
  CHECK_EQ(r.votadoPor(), 0);
  auto s = r.sacarSalidas();
  CHECK_EQ(s.size(), 1u);
  if (s.size() == 1) CHECK(!s[0].msg.concedido);
  // Con un log al menos igual de actualizado sí vota.
  Msg q2(Tipo::VoteReq);
  q2.de = 2; q2.termino = 2; q2.last_idx = 1; q2.last_term = 1;
  r.recibir(q2, 5030);
  auto s2 = r.sacarSalidas();
  CHECK_EQ(s2.size(), 1u);
  if (s2.size() == 1) CHECK(s2[0].msg.concedido);
  CHECK_EQ(p.votadoPor, 2);
}

PRUEBA(caido_ignora_mensajes_y_no_envia) {
  PersistenciaMem p;
  ConfigRaft c;
  c.yo = 2;
  c.semilla = kSemilla;
  Raft r(c, p, reloj);
  r.caer(0);
  CHECK(r.caido());
  Msg a(Tipo::VoteReq);
  a.de = 1; a.termino = 4;
  r.recibir(a, 10);
  for (uint64_t t = 0; t <= 20000; t += 100) r.tick(t);
  CHECK(r.sacarSalidas().empty());
  CHECK_EQ(r.termino(), 0u);
  CHECK(r.rol() == Rol::Seguidor);
  r.recuperar(20000);
  CHECK(!r.caido());
  CHECK(r.rol() == Rol::Seguidor);
  r.tick(20100);
  CHECK(r.sacarSalidas().empty());  // temporizador nuevo: aún no se postula
}

PRUEBA(sucesos_registra_eleccion) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  const Raft& L = red.nodo(*l);
  CHECK(tieneSuceso(L, "postulo"));
  CHECK(tieneSuceso(L, "gano"));
  std::string gano = "Servidor " + std::to_string(*l) + " ganó la elección y es el líder";
  bool textoOk = false;
  for (const Suceso& s : L.sucesos())
    if (s.tipo == "gano" && s.texto == gano && s.termino == L.termino()) textoOk = true;
  CHECK(textoOk);
  for (int n = 1; n <= 3; n++) {
    if (n == *l || red.persistencia(n).votadoPor != *l) continue;
    std::string voto = "Servidor " + std::to_string(n) + " votó por Servidor " + std::to_string(*l);
    bool ok = false;
    for (const Suceso& s : red.nodo(n).sucesos())
      if (s.tipo == "voto" && s.texto == voto) ok = true;
    CHECK(ok);
  }
}

PRUEBA(sucesos_tope_50) {
  PersistenciaMem p;
  ConfigRaft c;
  c.yo = 1;
  c.semilla = kSemilla;
  Raft r(c, p, reloj);
  for (int i = 0; i < 60; i++) {
    r.caer(i * 10);
    r.recuperar(i * 10 + 5);
  }
  CHECK_EQ(r.sucesos().size(), 50u);
  CHECK_EQ(r.sucesosSeq(), 120u);
  CHECK_EQ(r.sucesos().back().seq, 120u);
  CHECK_EQ(r.sucesos().front().seq, 71u);
  CHECK_EQ(r.sucesos().back().texto, std::string("Servidor 1 se recuperó"));
  CHECK_EQ(r.sucesos().back().t, reloj());
}

PRUEBA(con_perdida_20_por_ciento_igual_elige) {
  RedSimulada red(kSemilla);
  red.setPerdida(0.2);
  red.avanzar(15000);
  CHECK(red.lideres().has_value());
  CHECK(!red.violacionSeguridad());
}

PRUEBA(particion_minoritaria_no_elige) {
  RedSimulada red(kSemilla);
  red.avanzar(5000);
  auto l = red.lideres();
  CHECK(l.has_value());
  if (!l) return;
  // El líder queda solo: la mayoría elige otro con término mayor.
  std::set<int> resto;
  for (int n = 1; n <= 3; n++)
    if (n != *l) resto.insert(n);
  red.partir({*l}, resto);
  red.avanzar(8000);
  auto l2 = red.lideres();
  CHECK(l2.has_value());
  if (!l2) return;
  CHECK(*l2 != *l);
  // Al unir, el viejo líder baja a seguidor.
  red.unir();
  red.avanzar(3000);
  CHECK(red.nodo(*l).rol() == Rol::Seguidor);
  CHECK(red.lideres().has_value());
  CHECK(!red.violacionSeguridad());
}

PRUEBA(filtro_descarta_mensajes) {
  RedSimulada red(kSemilla);
  red.setFiltro([](int, int, const Msg& m) { return m.tipo == Tipo::VoteResp; });
  red.avanzar(10000);
  CHECK(!red.lideres().has_value());
  red.setFiltro(nullptr);
  red.avanzar(10000);
  CHECK(red.lideres().has_value());
  CHECK(!red.violacionSeguridad());
}

// ================================================================ Tarea 4: replicación

static Evento evento(const std::string& id, int nodo, uint64_t t = 0, int nivel = 5) {
  Evento ev;
  ev.id = id;
  ev.nodo = nodo;
  ev.nivel = nivel;
  ev.duracion_ms = 900;
  ev.pga = 0.5f;
  ev.t = t;
  return ev;
}

// Elige un líder y lo devuelve (0 si no hubo).
static int elegir(RedSimulada& red) {
  red.avanzar(5000);
  auto l = red.lideres();
  return l ? *l : 0;
}

static int otro(int a, int b = 0) {
  for (int n = 1; n <= 3; n++)
    if (n != a && n != b) return n;
  return 0;
}

static int contarId(const Raft& r, const std::string& id) {
  int c = 0;
  for (const Entrada& e : r.log())
    if (e.clase == Clase::Evento && e.ev.id == id) c++;
  return c;
}

static bool confirmado(const Raft& r, const std::string& id) {
  for (uint32_t i = 0; i < r.commitIndex() && i < r.logLen(); i++)
    if (r.log()[i].clase == Clase::Evento && r.log()[i].ev.id == id) return true;
  return false;
}

static bool enSismo(const Raft& r, const std::string& id) {
  for (const Evento& e : r.sismo().eventos())
    if (e.id == id) return true;
  return false;
}

// Log matching: los nodos vivos tienen el mismo commitIndex y el mismo prefijo confirmado.
static bool prefijosIguales(const RedSimulada& red) {
  const Raft* ref = nullptr;
  for (int n = 1; n <= 3; n++) {
    const Raft& r = red.nodo(n);
    if (r.caido()) continue;
    if (!ref) { ref = &r; continue; }
    if (r.commitIndex() != ref->commitIndex()) return false;
    for (uint32_t i = 0; i < r.commitIndex(); i++) {
      const Entrada& a = r.log()[i];
      const Entrada& b = ref->log()[i];
      if (a.indice != b.indice || a.termino != b.termino || a.clase != b.clase || a.ev.id != b.ev.id)
        return false;
    }
  }
  return true;
}

PRUEBA(evento_en_lider_se_confirma_en_todos) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  uint64_t ahora = red.ahora();
  CHECK(red.nodo(l).proponer(evento("n1-1", 1, RedSimulada::kEpoch + ahora), ahora) == Propuesta::Aceptada);
  const Entrada& e = red.nodo(l).log().back();
  CHECK(e.clase == Clase::Evento);
  CHECK_EQ(e.lider, l);
  CHECK_EQ(e.termino, red.nodo(l).termino());
  CHECK_EQ(e.ev.t_lider, RedSimulada::kEpoch + ahora);
  red.avanzar(1000);
  for (int n = 1; n <= 3; n++) {
    CHECK_EQ(red.nodo(n).commitIndex(), red.nodo(l).commitIndex());
    CHECK(enSismo(red.nodo(n), "n1-1"));
    CHECK(confirmado(red.nodo(n), "n1-1"));
  }
  CHECK(prefijosIguales(red));
}

PRUEBA(evento_en_seguidor_llega_por_forward) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  int s = otro(l);
  CHECK(red.nodo(s).proponer(evento("s-1", s, RedSimulada::kEpoch + red.ahora()), red.ahora()) ==
        Propuesta::Pendiente);
  CHECK_EQ(red.nodo(s).pendientes(), 1u);
  red.avanzar(1000);
  for (int n = 1; n <= 3; n++) {
    CHECK(confirmado(red.nodo(n), "s-1"));
    CHECK(enSismo(red.nodo(n), "s-1"));
    CHECK_EQ(contarId(red.nodo(n), "s-1"), 1);
  }
  CHECK_EQ(red.nodo(s).pendientes(), 0u);
  CHECK(prefijosIguales(red));
}

PRUEBA(lider_rechaza_id_duplicado) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  CHECK(red.nodo(l).proponer(evento("d-1", l), red.ahora()) == Propuesta::Aceptada);
  uint32_t len = red.nodo(l).logLen();
  // Duplicado aún sin confirmar.
  CHECK(red.nodo(l).proponer(evento("d-1", l), red.ahora()) == Propuesta::Duplicada);
  red.avanzar(1000);
  // Duplicado ya confirmado.
  CHECK(red.nodo(l).proponer(evento("d-1", l), red.ahora()) == Propuesta::Duplicada);
  CHECK_EQ(red.nodo(l).logLen(), len);
  CHECK_EQ(contarId(red.nodo(l), "d-1"), 1);
}

PRUEBA(forward_duplicado_tras_cambio_de_lider_no_duplica) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  int s = otro(l);
  red.setFiltro([](int, int, const Msg& m) { return m.tipo == Tipo::ForwardAck; });
  CHECK(red.nodo(s).proponer(evento("fw-1", s, RedSimulada::kEpoch + red.ahora()), red.ahora()) ==
        Propuesta::Pendiente);
  red.avanzar(100);  // el líder lo agrega y lo replica, pero el ack se pierde
  red.nodo(l).caer(red.ahora());
  red.avanzar(8000);
  auto l2 = red.lideres();
  CHECK(l2.has_value());
  if (!l2) return;
  CHECK(*l2 != l);
  CHECK_EQ(contarId(red.nodo(*l2), "fw-1"), 1);
  CHECK(confirmado(red.nodo(*l2), "fw-1"));
  for (int n = 1; n <= 3; n++)
    if (n != l) CHECK_EQ(contarId(red.nodo(n), "fw-1"), 1);
  CHECK_EQ(red.nodo(s).pendientes(), 0u);  // lo vio confirmado en su log
  CHECK(prefijosIguales(red));
  CHECK(!red.violacionSeguridad());
}

PRUEBA(sin_quorum_queda_pendiente_y_luego_confirma) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  int vivo = otro(l);
  int tercero = otro(l, vivo);
  red.nodo(l).caer(red.ahora());
  red.nodo(tercero).caer(red.ahora());
  CHECK(red.nodo(vivo).proponer(evento("q-1", vivo, RedSimulada::kEpoch + red.ahora()), red.ahora()) ==
        Propuesta::Pendiente);
  red.avanzar(5000);
  CHECK(!confirmado(red.nodo(vivo), "q-1"));
  CHECK(!enSismo(red.nodo(vivo), "q-1"));
  CHECK_EQ(red.nodo(vivo).pendientes(), 1u);
  red.nodo(tercero).recuperar(red.ahora());
  red.avanzar(6000);
  for (int n : {vivo, tercero}) {
    CHECK(confirmado(red.nodo(n), "q-1"));
    CHECK(enSismo(red.nodo(n), "q-1"));
    CHECK_EQ(contarId(red.nodo(n), "q-1"), 1);
  }
  CHECK_EQ(red.nodo(vivo).pendientes(), 0u);
  CHECK(prefijosIguales(red));
  CHECK(!red.violacionSeguridad());
}

PRUEBA(nodo_reiniciado_se_pone_al_dia_en_menos_de_1s) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  for (int i = 0; i < 300; i++) {
    CHECK(red.nodo(l).proponer(evento("r-" + std::to_string(i), 1 + i % 3), red.ahora()) ==
          Propuesta::Aceptada);
    if (i % 10 == 9) red.avanzar(50);
  }
  red.avanzar(1000);
  CHECK(red.lideres() == l);
  CHECK(red.nodo(l).commitIndex() >= 301u);
  CHECK(prefijosIguales(red));
  int f = otro(l);
  red.setRetraso(5, 20);
  red.reiniciar(f);
  CHECK_EQ(red.nodo(f).logLen(), 0u);
  red.avanzar(1000);
  CHECK_EQ(red.nodo(f).logLen(), red.nodo(l).logLen());
  CHECK(prefijosIguales(red));
  CHECK_EQ(red.nodo(f).sismo().eventos().size(), 100u);  // reconstruido aplicando el log
  CHECK(!red.violacionSeguridad());
}

PRUEBA(alertas_iguales_en_los_3) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  uint64_t t0 = RedSimulada::kEpoch + red.ahora();
  Propuesta p1 = red.nodo(1).proponer(evento("a-1", 1, t0, 6), red.ahora());
  Propuesta p2 = red.nodo(2).proponer(evento("a-2", 2, t0 + 3000, 8), red.ahora());
  CHECK(p1 == Propuesta::Aceptada || p1 == Propuesta::Pendiente);
  CHECK(p2 == Propuesta::Aceptada || p2 == Propuesta::Pendiente);
  red.avanzar(1000);
  const auto& ref = red.nodo(l).sismo().alertas();
  CHECK_EQ(ref.size(), 1u);
  if (ref.size() != 1) return;
  CHECK_EQ(ref[0].eventos.size(), 2u);
  CHECK_EQ(ref[0].lider, l);
  for (int n = 1; n <= 3; n++) {
    const auto& a = red.nodo(n).sismo().alertas();
    CHECK_EQ(a.size(), 1u);
    if (a.size() != 1) continue;
    CHECK_EQ(a[0].id, ref[0].id);
    CHECK(a[0].eventos == ref[0].eventos);
    CHECK_EQ(a[0].termino, ref[0].termino);
    CHECK_EQ(a[0].lider, ref[0].lider);
  }
  CHECK(prefijosIguales(red));
}

PRUEBA(log_lleno_rechaza) {
  ConfigRaft base;
  base.topeLog = 20;
  RedSimulada red(kSemilla, base);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  Raft& L = red.nodo(l);
  int i = 0;
  while (L.logLen() < 20 && i < 40) {
    CHECK(L.proponer(evento("ll-" + std::to_string(i), l), red.ahora()) == Propuesta::Aceptada);
    i++;
  }
  CHECK(L.logLleno());
  CHECK(tieneSuceso(L, "log_lleno"));
  std::vector<Entrada> antes = L.log();
  CHECK(L.proponer(evento("ll-x", l), red.ahora()) == Propuesta::LogLleno);
  CHECK(L.proponer(evento("ll-0", l), red.ahora()) == Propuesta::Duplicada);
  CHECK_EQ(L.logLen(), 20u);
  CHECK_EQ(L.log().size(), antes.size());
  CHECK(L.log().back().ev.id == antes.back().ev.id);
  red.avanzar(1000);
  CHECK_EQ(L.logLen(), 20u);
  CHECK_EQ(L.commitIndex(), 20u);
  for (int n = 1; n <= 3; n++) CHECK(red.nodo(n).logLleno());
  CHECK(prefijosIguales(red));
}

PRUEBA(caido_ignora_propuesta) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  int s = otro(l);
  red.nodo(s).caer(red.ahora());
  CHECK(red.nodo(s).proponer(evento("c-1", s), red.ahora()) == Propuesta::Caido);
  CHECK_EQ(red.nodo(s).pendientes(), 0u);
  red.nodo(l).caer(red.ahora());
  uint32_t len = red.nodo(l).logLen();
  CHECK(red.nodo(l).proponer(evento("c-2", l), red.ahora()) == Propuesta::Caido);
  CHECK_EQ(red.nodo(l).logLen(), len);
  CHECK_EQ(red.nodo(l).pendientes(), 0u);
}

PRUEBA(particion_minoritaria_no_confirma) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  red.avanzar(500);
  uint32_t commitAntes = red.nodo(l).commitIndex();
  int x = otro(l), y = otro(l, x);
  red.partir({l}, {x, y});
  CHECK(red.nodo(l).proponer(evento("p-1", l), red.ahora()) == Propuesta::Aceptada);
  bool seConfirmo = false;
  for (int i = 0; i < 80; i++) {
    red.avanzar(100);
    if (red.nodo(l).commitIndex() != commitAntes || confirmado(red.nodo(l), "p-1")) seConfirmo = true;
  }
  CHECK(!seConfirmo);
  CHECK(!enSismo(red.nodo(l), "p-1"));
  auto l2 = red.lideres();
  CHECK(l2.has_value());
  if (!l2) return;
  CHECK(*l2 != l);
  CHECK(red.nodo(*l2).proponer(evento("p-2", *l2), red.ahora()) == Propuesta::Aceptada);
  red.unir();
  red.avanzar(3000);
  for (int n = 1; n <= 3; n++) {
    CHECK_EQ(contarId(red.nodo(n), "p-1"), 0);
    CHECK(confirmado(red.nodo(n), "p-2"));
    CHECK_EQ(red.nodo(n).logLen(), red.nodo(*l2).logLen());
  }
  CHECK(red.nodo(l).rol() == Rol::Seguidor);
  CHECK(prefijosIguales(red));
  CHECK(!red.violacionSeguridad());
}

PRUEBA(append_respeta_8_entradas) {
  RedSimulada red(kSemilla);
  int l = elegir(red);
  CHECK(l != 0);
  if (!l) return;
  int f = otro(l);
  red.nodo(f).caer(red.ahora());
  for (int i = 0; i < 30; i++)
    CHECK(red.nodo(l).proponer(evento("e8-" + std::to_string(i), 1 + i % 3, RedSimulada::kEpoch + i),
                               red.ahora()) == Propuesta::Aceptada);
  red.avanzar(100);
  size_t maxEntradas = 0, maxBytes = 0;
  int conOcho = 0;
  red.setFiltro([&](int de, int a, const Msg& m) {
    if (m.tipo == Tipo::Append && de == l && a == f) {
      maxEntradas = std::max(maxEntradas, m.entradas.size());
      maxBytes = std::max(maxBytes, codificar(m).size());
      if (m.entradas.size() == 8) conOcho++;
    }
    return false;
  });
  red.nodo(f).recuperar(red.ahora());
  red.avanzar(2000);
  CHECK(maxEntradas <= 8u);
  CHECK(conOcho >= 1);  // hubo lotes completos
  CHECK(maxBytes <= 1400u);
  CHECK_EQ(red.nodo(f).logLen(), red.nodo(l).logLen());
  CHECK(prefijosIguales(red));
  CHECK(!red.violacionSeguridad());
}

PRUEBA(lider_que_baja_reinicia_temporizador) {
  PersistenciaMem p;
  ConfigRaft c;
  c.yo = 1;
  c.semilla = kSemilla;
  Raft r(c, p, reloj);
  r.tick(0);
  r.tick(5000);
  Msg v(Tipo::VoteResp);
  v.de = 2; v.termino = 1; v.concedido = true;
  r.recibir(v, 5010);
  CHECK(r.rol() == Rol::Lider);
  for (uint64_t t = 5010; t <= 20000; t += 10) r.tick(t);
  r.sacarSalidas();
  // Un candidato con log vacío y término mayor: el líder baja pero no le da el voto.
  Msg q(Tipo::VoteReq);
  q.de = 3; q.termino = 2;
  r.recibir(q, 20000);
  CHECK(r.rol() == Rol::Seguidor);
  CHECK(tieneSuceso(r, "perdio_lider"));
  r.sacarSalidas();
  for (uint64_t t = 20010; t < 21500; t += 10) r.tick(t);
  CHECK(r.rol() == Rol::Seguidor);
  CHECK_EQ(r.termino(), 2u);
  for (const Salida& s : r.sacarSalidas()) CHECK(s.msg.tipo != Tipo::VoteReq);
}
