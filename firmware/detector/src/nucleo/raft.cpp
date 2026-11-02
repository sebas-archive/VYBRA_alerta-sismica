#include "raft.h"
#include <utility>

namespace nucleo {

Raft::Raft(const ConfigRaft& cfg, Persistencia& pers, std::function<uint64_t()> relojEpochMs)
    : cfg_(cfg), pers_(pers), reloj_(std::move(relojEpochMs)), rng_(cfg.semilla) {
  pers_.cargar(termino_, votadoPor_);
}

// ---------------------------------------------------------------- tiempo

void Raft::reiniciarTemporizador(uint64_t ahoraMs) {
  std::uniform_int_distribution<uint32_t> d(cfg_.eleccionMinMs, cfg_.eleccionMaxMs);
  plazoEleccion_ = ahoraMs + d(rng_);
  temporizadorListo_ = true;
}

void Raft::tick(uint64_t ahoraMs) {
  if (caido_) return;
  if (!temporizadorListo_) reiniciarTemporizador(ahoraMs);
  if (rol_ == Rol::Lider) {
    if (ahoraMs >= proximoLatido_) {
      enviarLatidos();
      proximoLatido_ = ahoraMs + cfg_.latidoMs;
    }
    return;
  }
  if (ahoraMs >= plazoEleccion_) postularse(ahoraMs);
}

// ---------------------------------------------------------------- elección

void Raft::guardar() { pers_.guardar(termino_, votadoPor_); }

void Raft::subirTermino(uint32_t t) {
  termino_ = t;
  votadoPor_ = 0;
  guardar();
  pasarASeguidor();
  lider_ = 0;
}

void Raft::pasarASeguidor() {
  rol_ = Rol::Seguidor;
  votos_.clear();
}

void Raft::postularse(uint64_t ahoraMs) {
  termino_++;
  votadoPor_ = cfg_.yo;
  guardar();  // antes de pedir votos
  rol_ = Rol::Candidato;
  lider_ = 0;
  votos_.clear();
  votos_.insert(cfg_.yo);
  reiniciarTemporizador(ahoraMs);
  suceso("postulo", servidor() + " no recibió latidos y se postuló");
  for (int p = kPrimerNodo; p <= kUltimoNodo; p++) {
    if (p == cfg_.yo) continue;
    Msg m(Tipo::VoteReq);
    m.last_idx = ultimoIndice();
    m.last_term = terminoEn(m.last_idx);
    enviar(p, m);
  }
}

void Raft::ganar(uint64_t ahoraMs) {
  rol_ = Rol::Lider;
  lider_ = cfg_.yo;
  votos_.clear();
  for (int p = kPrimerNodo; p <= kUltimoNodo; p++) {
    nextIdx_[p] = ultimoIndice() + 1;
    matchIdx_[p] = 0;
  }
  // Entrada del término nuevo: permite confirmar lo heredado (sección 5.4.2).
  if (!logLleno()) {
    Entrada e;
    e.indice = ultimoIndice() + 1;
    e.termino = termino_;
    e.clase = Clase::InicioTermino;
    e.lider = cfg_.yo;
    log_.push_back(e);
  }
  matchIdx_[cfg_.yo] = ultimoIndice();
  suceso("gano", servidor() + " ganó la elección y es el líder");
  enviarLatidos();
  proximoLatido_ = ahoraMs + cfg_.latidoMs;
}

// Regla de "log al día" (sección 5.4.1): último término mayor, o igual con índice >=.
bool Raft::logAlDia(uint32_t lastIdx, uint32_t lastTerm) const {
  uint32_t miTerm = terminoEn(ultimoIndice());
  if (lastTerm != miTerm) return lastTerm > miTerm;
  return lastIdx >= ultimoIndice();
}

// ---------------------------------------------------------------- mensajes

void Raft::recibir(const Msg& m, uint64_t ahoraMs) {
  if (caido_) return;
  if (m.de < kPrimerNodo || m.de > kUltimoNodo || m.de == cfg_.yo) return;
  if (!temporizadorListo_) reiniciarTemporizador(ahoraMs);
  // Término mayor: se adopta y se vuelve a seguidor (sección 5.1).
  if (m.termino > termino_) subirTermino(m.termino);
  switch (m.tipo) {
    case Tipo::VoteReq: alVoteReq(m, ahoraMs); break;
    case Tipo::VoteResp: alVoteResp(m, ahoraMs); break;
    case Tipo::Append: alAppend(m, ahoraMs); break;
    case Tipo::AppendResp: alAppendResp(m, ahoraMs); break;
    case Tipo::Forward:
    case Tipo::ForwardAck:
      break;  // Tarea 4
  }
}

void Raft::alVoteReq(const Msg& m, uint64_t ahoraMs) {
  bool concedo = m.termino == termino_ && (votadoPor_ == 0 || votadoPor_ == m.de) &&
                 logAlDia(m.last_idx, m.last_term);
  if (concedo) {
    bool nuevo = votadoPor_ != m.de;
    votadoPor_ = m.de;
    guardar();  // antes de responder
    reiniciarTemporizador(ahoraMs);
    if (nuevo) suceso("voto", servidor() + " votó por Servidor " + std::to_string(m.de));
  }
  Msg r(Tipo::VoteResp);
  r.concedido = concedo;
  enviar(m.de, r);
}

void Raft::alVoteResp(const Msg& m, uint64_t ahoraMs) {
  if (rol_ != Rol::Candidato || m.termino != termino_ || !m.concedido) return;
  votos_.insert(m.de);
  if ((int)votos_.size() >= mayoria()) ganar(ahoraMs);
}

void Raft::alAppend(const Msg& m, uint64_t ahoraMs) {
  Msg r(Tipo::AppendResp);
  if (m.termino < termino_) {  // líder viejo: se le informa el término actual
    r.ok = false;
    enviar(m.de, r);
    return;
  }
  // Hay un líder legítimo en este término.
  if (rol_ != Rol::Seguidor) pasarASeguidor();
  lider_ = m.de;
  reiniciarTemporizador(ahoraMs);
  // Chequeo de consistencia (sección 5.3). Copiar entradas y avanzar commit: Tarea 4.
  r.ok = m.prev_idx == 0 || (m.prev_idx <= ultimoIndice() && terminoEn(m.prev_idx) == m.prev_term);
  r.match_idx = r.ok ? m.prev_idx : 0;
  enviar(m.de, r);
}

void Raft::alAppendResp(const Msg&, uint64_t) {
  // El cambio de término ya se aplicó en recibir(); avanzar next/match: Tarea 4.
}

void Raft::enviarLatidos() {
  for (int p = kPrimerNodo; p <= kUltimoNodo; p++)
    if (p != cfg_.yo) enviarAppend(p);
}

void Raft::enviarAppend(int peer) {
  Msg m(Tipo::Append);
  m.prev_idx = nextIdx_[peer] - 1;
  m.prev_term = terminoEn(m.prev_idx);
  m.commit = commitIndex_;
  enviar(peer, m);
}

void Raft::enviar(int a, Msg m) {
  m.de = cfg_.yo;
  m.termino = termino_;
  salidas_.push_back({a, std::move(m)});
}

std::vector<Salida> Raft::sacarSalidas() {
  std::vector<Salida> s;
  s.swap(salidas_);
  return s;
}

// ---------------------------------------------------------------- caída simulada

void Raft::caer(uint64_t) {
  if (caido_) return;
  caido_ = true;
  pasarASeguidor();
  lider_ = 0;
  salidas_.clear();
  temporizadorListo_ = false;
  suceso("cayo", servidor() + " simuló una caída");
}

void Raft::recuperar(uint64_t ahoraMs) {
  if (!caido_) return;
  caido_ = false;
  pasarASeguidor();
  lider_ = 0;
  reiniciarTemporizador(ahoraMs);
  suceso("recupero", servidor() + " se recuperó");
}

// ---------------------------------------------------------------- sucesos

void Raft::suceso(const char* tipo, const std::string& texto) {
  Suceso s;
  s.seq = ++sucesosSeq_;
  s.t = reloj_ ? reloj_() : 0;
  s.tipo = tipo;
  s.texto = texto;
  s.termino = termino_;
  sucesos_.push_back(std::move(s));
  while (sucesos_.size() > kTopeSucesos) sucesos_.pop_front();
}

}  // namespace nucleo
