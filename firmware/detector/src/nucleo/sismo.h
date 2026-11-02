// Máquina de estados sísmica: eventos confirmados + regla de alerta.
#pragma once
#include <cstdint>
#include <deque>
#include <string>
#include <vector>
#include "tipos.h"

namespace nucleo {

struct Alerta {
  uint32_t id = 0;                    // índice de log del evento que la disparó
  float promedio = 0;                 // promedio de niveles del grupo
  std::vector<std::string> eventos;   // ids de los eventos del grupo
  uint32_t termino = 0;
  int lider = 0;
};

class Sismo {
 public:
  void aplicar(const Entrada& e);  // solo entradas confirmadas, en orden
  const std::deque<Evento>& eventos() const { return eventos_; }  // últimos 100
  const std::vector<Alerta>& alertas() const { return alertas_; }
  bool enAlerta(const std::string& idEvento) const;
  static int nivelPorTiempo(uint32_t ms);          // min(10, 1 + ms/450)
  static const char* nivelAlerta(float promedio);  // "baja" | "media" | "alta"
  static uint64_t horaDe(const Evento& ev);        // t, si no t_lider, si no 0

 private:
  struct Reg { uint32_t indice; bool libre; };
  static constexpr size_t kTope = 100;
  static constexpr uint64_t kVentana = 10000;
  std::deque<Evento> eventos_;
  std::deque<Reg> regs_;  // paralelo a eventos_
  std::vector<Alerta> alertas_;
};

}  // namespace nucleo
