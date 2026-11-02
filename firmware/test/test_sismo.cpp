#include <cmath>
#include "prueba.h"
#include "nucleo/sismo.h"
using namespace nucleo;

// Aplica un evento como entrada confirmada con el índice dado.
static void ap(Sismo& s, uint32_t idx, int nodo, uint64_t t, uint64_t t_lider = 0, int nivel = 5) {
  Entrada e; e.indice = idx; e.termino = 1; e.clase = Clase::Evento; e.lider = 1;
  e.ev.id = "n" + std::to_string(nodo) + "-" + std::to_string(idx);
  e.ev.nodo = nodo; e.ev.nivel = nivel; e.ev.t = t; e.ev.t_lider = t_lider;
  s.aplicar(e);
}

PRUEBA(nivel_por_tiempo) {
  CHECK_EQ(Sismo::nivelPorTiempo(0), 1); CHECK_EQ(Sismo::nivelPorTiempo(449), 1);
  CHECK_EQ(Sismo::nivelPorTiempo(450), 2); CHECK_EQ(Sismo::nivelPorTiempo(2200), 5);
  CHECK_EQ(Sismo::nivelPorTiempo(60000), 10);
}

PRUEBA(nivel_alerta) {
  CHECK_EQ(std::string(Sismo::nivelAlerta(4.4f)), std::string("baja"));
  CHECK_EQ(std::string(Sismo::nivelAlerta(4.5f)), std::string("media"));
  CHECK_EQ(std::string(Sismo::nivelAlerta(7.4f)), std::string("media"));
  CHECK_EQ(std::string(Sismo::nivelAlerta(7.5f)), std::string("alta"));
}

PRUEBA(dos_detectores_dentro_de_10s_alertan) {
  Sismo s; ap(s, 1, 1, 1000, 0, 4); ap(s, 2, 2, 9000, 0, 7);
  CHECK_EQ(s.alertas().size(), 1u);
  CHECK(std::fabs(s.alertas()[0].promedio - 5.5f) < 1e-6f);
  CHECK_EQ(s.alertas()[0].id, 2u);
  CHECK(s.enAlerta("n1-1")); CHECK(s.enAlerta("n2-2"));
}

PRUEBA(mismo_detector_no_alerta) {
  Sismo s; ap(s, 1, 1, 1000); ap(s, 2, 1, 2000);
  CHECK_EQ(s.alertas().size(), 0u);
}

PRUEBA(fuera_de_ventana_no_alerta) {
  Sismo s; ap(s, 1, 1, 1); ap(s, 2, 2, 11002);
  CHECK_EQ(s.alertas().size(), 0u);
}

PRUEBA(elige_el_mas_cercano) {
  Sismo s; ap(s, 1, 1, 1000); ap(s, 2, 1, 8000); ap(s, 3, 2, 9000);
  CHECK_EQ(s.alertas().size(), 1u);
  CHECK(s.enAlerta("n1-2")); CHECK(s.enAlerta("n2-3")); CHECK(!s.enAlerta("n1-1"));
}

PRUEBA(tercero_fuera_de_ventana_del_primero_no_entra) {
  Sismo s; ap(s, 1, 1, 1000); ap(s, 2, 2, 12000); ap(s, 3, 3, 10500);
  CHECK_EQ(s.alertas().size(), 1u);
  CHECK(s.enAlerta("n3-3")); CHECK(s.enAlerta("n1-1")); CHECK(!s.enAlerta("n2-2"));
  CHECK_EQ(s.alertas()[0].eventos.size(), 2u);
}

PRUEBA(evento_sin_hora_no_cuenta) {
  Sismo s; ap(s, 1, 1, 0, 0); ap(s, 2, 2, 1000);
  CHECK_EQ(s.alertas().size(), 0u);
}

PRUEBA(usa_t_lider_si_no_hay_t) {
  Sismo s; ap(s, 1, 1, 0, 5000); ap(s, 2, 2, 6000);
  CHECK_EQ(s.alertas().size(), 1u);
}

PRUEBA(inicio_termino_se_ignora) {
  Sismo s; Entrada e; e.indice = 1; e.clase = Clase::InicioTermino; e.lider = 2;
  s.aplicar(e);
  CHECK_EQ(s.eventos().size(), 0u);
}

PRUEBA(tope_de_100_eventos) {
  Sismo s;
  for (uint32_t i = 1; i <= 120; i++) ap(s, i, 1, 1000ULL * i);
  CHECK_EQ(s.eventos().size(), 100u);
  CHECK_EQ(s.eventos().front().id, std::string("n1-21"));
}
