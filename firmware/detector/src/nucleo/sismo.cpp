#include "sismo.h"
#include <algorithm>

namespace nucleo {

int Sismo::nivelPorTiempo(uint32_t ms) {
  uint32_t n = 1 + ms / 450;
  return n > 10 ? 10 : (int)n;
}

const char* Sismo::nivelAlerta(float promedio) {
  if (promedio >= 7.5f) return "alta";
  if (promedio >= 4.5f) return "media";
  return "baja";
}

uint64_t Sismo::horaDe(const Evento& ev) {
  return ev.t != 0 ? ev.t : (ev.t_lider != 0 ? ev.t_lider : 0);
}

bool Sismo::enAlerta(const std::string& idEvento) const {
  for (const auto& a : alertas_)
    for (const auto& id : a.eventos)
      if (id == idEvento) return true;
  return false;
}

static uint64_t dist(uint64_t a, uint64_t b) { return a > b ? a - b : b - a; }

void Sismo::aplicar(const Entrada& e) {
  if (e.clase != Clase::Evento) return;  // InicioTermino no cambia el estado sísmico

  eventos_.push_back(e.ev);
  regs_.push_back({e.indice, true});
  if (eventos_.size() > kTope) { eventos_.pop_front(); regs_.pop_front(); }

  const uint64_t hE = horaDe(e.ev);
  if (hE == 0) return;
  const size_t pos = eventos_.size() - 1;  // posición del evento recién agregado

  // grupo: posiciones en eventos_/regs_, el evento disparador primero
  std::vector<size_t> grupo{pos};
  for (int d = 1; d <= 3; d++) {
    if (d == e.ev.nodo) continue;
    bool hay = false;
    size_t mejor = 0;
    uint64_t mejorDist = 0;
    for (size_t i = 0; i < pos; i++) {
      const Evento& c = eventos_[i];
      if (c.nodo != d || !regs_[i].libre) continue;
      uint64_t h = horaDe(c);
      if (h == 0) continue;
      uint64_t dd = dist(h, hE);
      if (dd > kVentana) continue;
      if (!hay || dd < mejorDist || (dd == mejorDist && regs_[i].indice < regs_[mejor].indice)) {
        hay = true; mejor = i; mejorDist = dd;
      }
    }
    if (hay) grupo.push_back(mejor);
  }
  if (grupo.size() < 2) return;

  uint64_t inicio = hE;
  for (size_t i : grupo) inicio = std::min(inicio, horaDe(eventos_[i]));
  grupo.erase(std::remove_if(grupo.begin(), grupo.end(),
                [&](size_t i) { return horaDe(eventos_[i]) > inicio + kVentana; }),
              grupo.end());
  if (grupo.size() < 2) return;

  Alerta a;
  a.id = e.indice; a.termino = e.termino; a.lider = e.lider;
  float suma = 0;
  for (size_t i : grupo) {
    suma += (float)eventos_[i].nivel;
    a.eventos.push_back(eventos_[i].id);
    regs_[i].libre = false;
  }
  a.promedio = suma / (float)grupo.size();
  alertas_.push_back(a);
}

}  // namespace nucleo
