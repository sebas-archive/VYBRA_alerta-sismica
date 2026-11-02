#include <cmath>
#include "prueba.h"
#include "nucleo/mensajes.h"
using namespace nucleo;

PRUEBA(append_ida_y_vuelta) {
  Msg m{Tipo::Append}; m.de=2; m.termino=5; m.prev_idx=3; m.prev_term=4; m.commit=3;
  Entrada e; e.indice=4; e.termino=5; e.clase=Clase::Evento;
  e.ev = {"nodo-2-ab12cd34-7", 2, 6, 0.183f, 2300, 1793650000123ULL, 0, 2};
  m.entradas = {e};
  Msg r; std::string s = codificar(m);
  CHECK(decodificar(s.data(), s.size(), r));
  CHECK_EQ(r.tipo, Tipo::Append); CHECK_EQ(r.prev_idx, 3u); CHECK_EQ(r.entradas.size(), 1u);
  CHECK_EQ(r.de, 2); CHECK_EQ(r.termino, 5u); CHECK_EQ(r.prev_term, 4u); CHECK_EQ(r.commit, 3u);
  CHECK_EQ(r.entradas[0].ev.id, std::string("nodo-2-ab12cd34-7"));
  CHECK_EQ(r.entradas[0].ev.t, 1793650000123ULL);
  CHECK_EQ(r.entradas[0].ev.nivel, 6); CHECK(std::fabs(r.entradas[0].ev.pga - 0.183f) < 1e-6f);  // el parser puede errar 1 ulp
  CHECK_EQ(r.entradas[0].ev.duracion_ms, 2300u); CHECK_EQ(r.entradas[0].ev.recibido_por, 2);
  CHECK_EQ(r.entradas[0].indice, 4u); CHECK(r.entradas[0].clase == Clase::Evento);
}

PRUEBA(append_con_8_entradas_cabe_en_1400_bytes) {
  Msg m{Tipo::Append}; m.de=1; m.termino=12; m.prev_idx=998; m.prev_term=11; m.commit=997;
  for (int i = 0; i < 8; i++) {
    Entrada e; e.indice=999+i; e.termino=12; e.clase=Clase::Evento; e.lider=1;
    e.ev = {"nodo-3-ab12cd34-1234567", 3, 10, 0.987654f, 4294967u, 1793650000123ULL, 1793650000456ULL, 3};
    m.entradas.push_back(e);
  }
  std::string s = codificar(m);
  CHECK(s.size() <= 1400);
  Msg r; CHECK(decodificar(s.data(), s.size(), r)); CHECK_EQ(r.entradas.size(), 8u);
  CHECK_EQ(r.entradas[7].indice, 1006u);
  CHECK_EQ(r.entradas[7].ev.t_lider, 1793650000456ULL);
}

PRUEBA(inicio_termino_ida_y_vuelta) {
  Msg m{Tipo::Append}; Entrada e; e.indice=1; e.termino=2; e.clase=Clase::InicioTermino; e.lider=3;
  m.entradas = {e};
  Msg r; std::string s = codificar(m);
  CHECK(decodificar(s.data(), s.size(), r));
  CHECK(r.entradas[0].clase == Clase::InicioTermino); CHECK_EQ(r.entradas[0].lider, 3);
}

PRUEBA(votereq_ida_y_vuelta) {
  Msg m{Tipo::VoteReq}; m.de=3; m.termino=9; m.last_idx=40; m.last_term=8;
  Msg r; std::string s = codificar(m);
  CHECK(decodificar(s.data(), s.size(), r));
  CHECK(r.tipo == Tipo::VoteReq); CHECK_EQ(r.de, 3); CHECK_EQ(r.termino, 9u);
  CHECK_EQ(r.last_idx, 40u); CHECK_EQ(r.last_term, 8u);
}

PRUEBA(voteresp_ida_y_vuelta) {
  Msg m{Tipo::VoteResp}; m.de=1; m.termino=9; m.concedido=true;
  Msg r; std::string s = codificar(m);
  CHECK(decodificar(s.data(), s.size(), r));
  CHECK(r.tipo == Tipo::VoteResp); CHECK(r.concedido);
  m.concedido = false; s = codificar(m);
  CHECK(decodificar(s.data(), s.size(), r)); CHECK(!r.concedido);
}

PRUEBA(appendresp_ida_y_vuelta) {
  Msg m{Tipo::AppendResp}; m.de=2; m.termino=7; m.ok=true; m.match_idx=55;
  Msg r; std::string s = codificar(m);
  CHECK(decodificar(s.data(), s.size(), r));
  CHECK(r.tipo == Tipo::AppendResp); CHECK(r.ok); CHECK_EQ(r.match_idx, 55u);
}

PRUEBA(forward_ida_y_vuelta) {
  Msg m{Tipo::Forward}; m.de=2; m.termino=3;
  m.ev = {"nodo-2-ab12cd34-9", 2, 4, 0.05f, 900, 1793650000999ULL, 0, 2};
  Msg r; std::string s = codificar(m);
  CHECK(decodificar(s.data(), s.size(), r));
  CHECK(r.tipo == Tipo::Forward); CHECK_EQ(r.ev.id, std::string("nodo-2-ab12cd34-9"));
  CHECK_EQ(r.ev.t, 1793650000999ULL); CHECK_EQ(r.ev.nivel, 4);
}

PRUEBA(forwardack_ida_y_vuelta) {
  Msg m{Tipo::ForwardAck}; m.de=1; m.termino=3; m.id="nodo-2-ab12cd34-9";
  Msg r; std::string s = codificar(m);
  CHECK(decodificar(s.data(), s.size(), r));
  CHECK(r.tipo == Tipo::ForwardAck); CHECK_EQ(r.id, std::string("nodo-2-ab12cd34-9"));
}

PRUEBA(basura_no_decodifica) {
  Msg r;
  CHECK(!decodificar("{no json", 8, r));
  CHECK(!decodificar("{}", 2, r));
  CHECK(!decodificar("[1,2]", 5, r));
  CHECK(!decodificar("{\"k\":99}", 8, r));
}
