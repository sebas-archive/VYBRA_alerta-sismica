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
}

PRUEBA(filtro_descarta_mensajes) {
  RedSimulada red(kSemilla);
  red.setFiltro([](int, int, const Msg& m) { return m.tipo == Tipo::VoteResp; });
  red.avanzar(10000);
  CHECK(!red.lideres().has_value());
  red.setFiltro(nullptr);
  red.avanzar(10000);
  CHECK(red.lideres().has_value());
}
