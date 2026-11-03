#include "raft.h"
#include <algorithm>
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
  if (rol_ != Rol::Lider && !pendientes_.empty() && ahoraMs >= proximoForward_) reenviarPendientes(ahoraMs);
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
  adelantados_.clear();
  for (int p = kPrimerNodo; p <= kUltimoNodo; p++) {
    nextIdx_[p] = ultimoIndice() + 1;
    matchIdx_[p] = 0;
    respondio_[p] = false;
    retroceso_[p] = 0;
    enVuelo_[p] = 0;
  }
  // Entrada del término nuevo: permite confirmar lo heredado (sección 5.4.2).
  if (!logLleno()) {
    Entrada e;
    e.indice = ultimoIndice() + 1;
    e.termino = termino_;
    e.clase = Clase::InicioTermino;
    e.lider = cfg_.yo;
    log_.push_back(e);
    revisarLleno();
  }
  suceso("gano", servidor() + " ganó la elección y es el líder");
  // Lo que este nodo tenía en su cola de reenvío ahora lo agrega él mismo.
  std::deque<Evento> cola;
  cola.swap(pendientes_);
  for (Evento& ev : cola)
    if (agregarComoLider(ev) == Propuesta::LogLleno) pendientes_.push_back(ev);
  matchIdx_[cfg_.yo] = ultimoIndice();
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
  if (m.termino > termino_) {
    bool eraLider = rol_ == Rol::Lider;
    subirTermino(m.termino);
    if (eraLider) {
      // Su plazo de elección venció hace rato: sin esto se postularía enseguida.
      reiniciarTemporizador(ahoraMs);
      suceso("perdio_lider", servidor() + " vio el término " + std::to_string(m.termino) +
                                 " y dejó de ser líder");
    }
  }
  switch (m.tipo) {
    case Tipo::VoteReq: alVoteReq(m, ahoraMs); break;
    case Tipo::VoteResp: alVoteResp(m, ahoraMs); break;
    case Tipo::Append: alAppend(m, ahoraMs); break;
    case Tipo::AppendResp: alAppendResp(m, ahoraMs); break;
    case Tipo::Forward: alForward(m); break;
    case Tipo::ForwardAck: alForwardAck(m); break;
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
    r.match_idx = ultimoIndice();
    enviar(m.de, r);
    return;
  }
  // Hay un líder legítimo en este término.
  if (rol_ != Rol::Seguidor) pasarASeguidor();
  lider_ = m.de;
  reiniciarTemporizador(ahoraMs);

  // Chequeo de consistencia (sección 5.3). Al fallar, match_idx lleva una pista para que el
  // líder retroceda de una vez: el largo del log, o el índice anterior al término en conflicto.
  if (m.prev_idx > ultimoIndice()) {
    // Un lote que se adelantó a otro en vuelo se guarda y se procesa cuando llegue el hueco
    // (equivale a que la red lo entregara más tarde). Igual se responde el fallo con la pista:
    // si el hueco no está en camino (p. ej. el líder cree que tengo más log del que tengo),
    // el líder retrocede en vez de esperar una respuesta que nunca llegaría.
    if (!m.entradas.empty()) guardarAdelantado(m);
    r.ok = false;
    r.match_idx = ultimoIndice();
    enviar(m.de, r);
    return;
  }
  if (m.prev_idx > 0 && terminoEn(m.prev_idx) != m.prev_term) {
    if (m.prev_idx <= commitIndex_) {  // choca con lo confirmado: el clúster lo olvidó
      resincronizar(m.de);
      return;
    }
    uint32_t t = terminoEn(m.prev_idx), i = m.prev_idx;
    while (i > 1 && terminoEn(i - 1) == t) i--;
    r.ok = false;
    r.match_idx = std::max(i - 1, commitIndex_);  // lo confirmado siempre coincide con el líder
    enviar(m.de, r);
    return;
  }

  // Copia las entradas: las que ya coinciden se saltan; ante un conflicto se corta el log
  // desde ahí (nunca se tocan entradas confirmadas); no se pasa del tope.
  uint32_t ultimoNuevo = m.prev_idx;
  for (const Entrada& e : m.entradas) {
    uint32_t idx = ultimoNuevo + 1;
    if (idx <= ultimoIndice()) {
      if (terminoEn(idx) == e.termino) {
        ultimoNuevo = idx;
        continue;
      }
      if (idx <= commitIndex_) {  // ídem: choca con lo confirmado
        resincronizar(m.de);
        return;
      }
      log_.resize(idx - 1);
    }
    if (logLleno()) break;
    Entrada c = e;
    c.indice = idx;
    log_.push_back(c);
    ultimoNuevo = idx;
  }
  revisarLleno();

  uint32_t nuevoCommit = std::min(m.commit, ultimoNuevo);
  if (nuevoCommit > commitIndex_) {
    commitIndex_ = nuevoCommit;
    aplicarConfirmadas();
  }
  r.ok = true;
  r.match_idx = ultimoNuevo;
  enviar(m.de, r);
  procesarAdelantados(ahoraMs);
}

// Un líder legítimo (término >= el nuestro) choca con una entrada que ya confirmamos. Con logs
// durables eso es imposible (sección 5.4.3: el líder tiene todo lo confirmado); acá los logs
// viven en RAM y, si se reinician en frío el líder y otro nodo, la mayoría olvida lo
// confirmado y se elige con un log más nuevo. Insistir dejaría a este nodo divergente para
// siempre (el líder no puede retroceder por debajo de nuestro commitIndex_), así que se
// descarta el log y se copia de cero el del líder: la mayoría ya decidió sin nosotros.
void Raft::resincronizar(int lider) {
  log_.clear();
  sismo_ = Sismo{};
  commitIndex_ = 0;
  ultimoAplicado_ = 0;
  adelantados_.clear();
  revisarLleno();
  suceso("resincroniza", servidor() + " borró su log y se resincroniza con el líder");
  Msg r(Tipo::AppendResp);
  r.ok = false;
  r.match_idx = 0;  // el líder reenvía desde el índice 1
  enviar(lider, r);
}

void Raft::guardarAdelantado(const Msg& m) {
  // Solo lotes del líder y término actuales; los de otro término ya no sirven.
  adelantados_.erase(std::remove_if(adelantados_.begin(), adelantados_.end(),
                                    [&](const Msg& a) { return a.termino != termino_ || a.de != lider_; }),
                     adelantados_.end());
  for (const Msg& a : adelantados_)
    if (a.prev_idx == m.prev_idx) return;  // ya estaba
  if (adelantados_.size() >= kLotesEnVuelo) return;
  adelantados_.push_back(m);
}

void Raft::procesarAdelantados(uint64_t ahoraMs) {
  for (size_t i = 0; i < adelantados_.size(); i++) {
    if (adelantados_[i].prev_idx > ultimoIndice()) continue;
    Msg m = std::move(adelantados_[i]);
    adelantados_.erase(adelantados_.begin() + (long)i);
    if (m.termino == termino_ && m.de == lider_) alAppend(m, ahoraMs);  // vuelve a llamar aquí
    return;
  }
}

void Raft::alAppendResp(const Msg& m, uint64_t) {
  // El cambio a un término mayor ya se aplicó en recibir().
  if (rol_ != Rol::Lider || m.termino != termino_) return;
  int p = m.de;
  bool conocido = respondio_[p];
  respondio_[p] = true;
  if (enVuelo_[p] > 0) enVuelo_[p]--;
  if (m.ok) {
    matchIdx_[p] = std::max(matchIdx_[p], std::min(m.match_idx, ultimoIndice()));
    nextIdx_[p] = std::max(nextIdx_[p], matchIdx_[p] + 1);
    avanzarCommit();
    rellenar(p);  // si quedan entradas, el siguiente lote sale ya (no espera al latido)
    return;
  }
  // Falló el chequeo: retrocede nextIdx_ hasta la pista del seguidor y reintenta enseguida.
  uint32_t pista = std::min(m.match_idx, ultimoIndice());
  // Con lotes en vuelo, uno que llega antes que el anterior también falla. Si ya se retrocedió
  // a este punto (o antes) y aún no hay confirmación más allá, ese reintento está en camino.
  if (conocido && retroceso_[p] > matchIdx_[p] && pista + 1 >= retroceso_[p]) return;
  matchIdx_[p] = std::min(matchIdx_[p], pista);
  nextIdx_[p] = pista + 1;
  retroceso_[p] = nextIdx_[p];
  rellenar(p);
}

void Raft::alForward(const Msg& m) {
  if (rol_ != Rol::Lider) return;  // el seguidor lo reintenta cuando conozca al líder
  Propuesta r = agregarComoLider(m.ev);
  if (r == Propuesta::Aceptada || r == Propuesta::Duplicada) {
    Msg a(Tipo::ForwardAck);
    a.id = m.ev.id;
    enviar(m.de, a);
  }
}

void Raft::alForwardAck(const Msg& m) { quitarPendiente(m.id); }

void Raft::enviarLatidos() {
  for (int p = kPrimerNodo; p <= kUltimoNodo; p++) {
    if (p == cfg_.yo) continue;
    // Lo enviado y no confirmado pudo perderse: se reenvía desde la última coincidencia.
    // Lo que siga en vuelo a esta altura se da por perdido (o ya respondido).
    if (respondio_[p] && nextIdx_[p] > matchIdx_[p] + 1) {
      nextIdx_[p] = matchIdx_[p] + 1;
      retroceso_[p] = nextIdx_[p];
    }
    enVuelo_[p] = 0;
    enviarAppend(p);
  }
}

void Raft::enviarAppend(int peer) {
  Msg m(Tipo::Append);
  if (nextIdx_[peer] < 1) nextIdx_[peer] = 1;
  if (nextIdx_[peer] > ultimoIndice() + 1) nextIdx_[peer] = ultimoIndice() + 1;
  m.prev_idx = nextIdx_[peer] - 1;
  m.prev_term = terminoEn(m.prev_idx);
  m.commit = commitIndex_;
  for (uint32_t i = nextIdx_[peer]; i <= ultimoIndice() && m.entradas.size() < cfg_.maxPorAppend; i++)
    m.entradas.push_back(log_[i - 1]);
  nextIdx_[peer] += (uint32_t)m.entradas.size();
  if (!m.entradas.empty()) enVuelo_[peer]++;
  enviar(peer, m);
}

void Raft::rellenar(int peer) {
  if (!respondio_[peer]) return;  // primero hay que saber dónde está su log
  // Tope duro de lotes sin respuesta: cada respuesta libera a lo sumo un lugar, así que el
  // tráfico no se multiplica aunque el seguidor conteste fallos en cadena.
  while (nextIdx_[peer] <= ultimoIndice() && enVuelo_[peer] < kLotesEnVuelo) enviarAppend(peer);
}

// ---------------------------------------------------------------- replicación

Propuesta Raft::proponer(Evento ev, uint64_t ahoraMs) {
  if (caido_) return Propuesta::Caido;
  if (ev.recibido_por == 0) ev.recibido_por = cfg_.yo;
  if (rol_ == Rol::Lider) return agregarComoLider(std::move(ev));
  // Seguidor o candidato: a la cola de reenvío.
  if (idEnLog(ev.id, true)) return Propuesta::Duplicada;
  for (const Evento& p : pendientes_)
    if (p.id == ev.id) return Propuesta::Duplicada;
  if (logLleno()) return Propuesta::LogLleno;  // su log es copia del líder: también está lleno
  if (pendientes_.empty()) proximoForward_ = ahoraMs + cfg_.reintentoForwardMs;
  pendientes_.push_back(ev);
  if (lider_ != 0 && lider_ != cfg_.yo) {
    Msg m(Tipo::Forward);
    m.ev = ev;
    enviar(lider_, m);
  }
  return Propuesta::Pendiente;
}

Propuesta Raft::agregarComoLider(Evento ev) {
  if (idEnLog(ev.id, false)) return Propuesta::Duplicada;
  if (logLleno()) {
    revisarLleno();
    return Propuesta::LogLleno;
  }
  ev.t_lider = reloj_ ? reloj_() : 0;
  Entrada e;
  e.indice = ultimoIndice() + 1;
  e.termino = termino_;
  e.clase = Clase::Evento;
  e.lider = cfg_.yo;
  e.ev = std::move(ev);
  log_.push_back(std::move(e));
  matchIdx_[cfg_.yo] = ultimoIndice();
  revisarLleno();
  for (int p = kPrimerNodo; p <= kUltimoNodo; p++)
    if (p != cfg_.yo) rellenar(p);
  return Propuesta::Aceptada;
}

// Avanza commitIndex_ al mayor N del término actual que tenga una mayoría (sección 5.4.2).
void Raft::avanzarCommit() {
  for (uint32_t n = ultimoIndice(); n > commitIndex_; n--) {
    if (terminoEn(n) != termino_) break;  // lo de términos viejos se confirma solo de arrastre
    int votos = 0;
    for (int p = kPrimerNodo; p <= kUltimoNodo; p++)
      if (p == cfg_.yo || matchIdx_[p] >= n) votos++;
    if (votos >= mayoria()) {
      commitIndex_ = n;
      aplicarConfirmadas();
      return;
    }
  }
}

void Raft::aplicarConfirmadas() {
  while (ultimoAplicado_ < commitIndex_ && ultimoAplicado_ < ultimoIndice()) {
    const Entrada& e = log_[ultimoAplicado_++];
    sismo_.aplicar(e);
    if (e.clase == Clase::Evento) quitarPendiente(e.ev.id);
  }
}

void Raft::reenviarPendientes(uint64_t ahoraMs) {
  proximoForward_ = ahoraMs + cfg_.reintentoForwardMs;
  if (lider_ == 0 || lider_ == cfg_.yo) return;
  for (const Evento& ev : pendientes_) {
    Msg m(Tipo::Forward);
    m.ev = ev;
    enviar(lider_, m);
  }
}

void Raft::quitarPendiente(const std::string& id) {
  pendientes_.erase(std::remove_if(pendientes_.begin(), pendientes_.end(),
                                   [&](const Evento& e) { return e.id == id; }),
                    pendientes_.end());
}

bool Raft::idEnLog(const std::string& id, bool soloConfirmadas) const {
  uint32_t hasta = soloConfirmadas ? commitIndex_ : ultimoIndice();
  for (uint32_t i = 0; i < hasta && i < log_.size(); i++)
    if (log_[i].clase == Clase::Evento && log_[i].ev.id == id) return true;
  return false;
}

// Registra "log_lleno" una vez al llegar al tope; se rearma si el log vuelve a bajar.
void Raft::revisarLleno() {
  if (!logLleno()) {
    avisoLleno_ = false;
    return;
  }
  if (avisoLleno_) return;
  avisoLleno_ = true;
  suceso("log_lleno", servidor() + ": log lleno (" + std::to_string(cfg_.topeLog) +
                          " entradas), se rechazan eventos nuevos");
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
