// Tipos compartidos del núcleo (sin dependencias de Arduino).
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace nucleo {

enum class Rol { Seguidor, Candidato, Lider };

// Un sismo detectado por un nodo.
struct Evento {
  std::string id;
  int nodo = 0;
  int nivel = 0;
  float pga = 0;
  uint32_t duracion_ms = 0;
  uint64_t t = 0;          // hora del nodo que lo detectó (ms epoch)
  uint64_t t_lider = 0;    // hora del líder al aceptarlo
  int recibido_por = 0;
};

enum class Clase { InicioTermino, Evento };

// Entrada del log replicado.
struct Entrada {
  uint32_t indice = 0;
  uint32_t termino = 0;
  Clase clase = Clase::Evento;
  int lider = 0;
  Evento ev;
};

enum class Tipo { VoteReq, VoteResp, Append, AppendResp, Forward, ForwardAck };

// Mensaje UDP entre nodos.
struct Msg {
  Msg() = default;
  Msg(Tipo t) : tipo(t) {}
  Tipo tipo = Tipo::VoteReq;
  int de = 0;
  uint32_t termino = 0;
  // votos
  uint32_t last_idx = 0, last_term = 0;
  bool concedido = false;
  // append
  uint32_t prev_idx = 0, prev_term = 0, commit = 0;
  std::vector<Entrada> entradas;
  // append_resp
  bool ok = false;
  uint32_t match_idx = 0;
  // forward / ack
  Evento ev;
  std::string id;
};

// Registro de sucesos para el panel.
struct Suceso {
  uint32_t seq;
  uint64_t t;
  std::string tipo;
  std::string texto;
  uint32_t termino;
};

}  // namespace nucleo
