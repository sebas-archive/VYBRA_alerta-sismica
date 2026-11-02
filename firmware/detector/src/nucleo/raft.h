// Nodo Raft sin hardware: elección de líder, persistencia de término/voto, caída simulada,
// replicación del log, confirmación por mayoría y reenvío (forward) de eventos al líder.
// Lo maneja el loop de detector.ino: UDP → recibir(), tick(millis()), sacarSalidas() → UDP.
#pragma once
#include <cstddef>
#include <cstdint>
#include <deque>
#include <functional>
#include <random>
#include <set>
#include <string>
#include <vector>
#include "sismo.h"
#include "tipos.h"

namespace nucleo {

// Almacenamiento estable de currentTerm y votedFor (NVS en el ESP32, memoria en pruebas).
struct Persistencia {
  virtual void guardar(uint32_t termino, int votadoPor) = 0;
  virtual void cargar(uint32_t& termino, int& votadoPor) = 0;
  virtual ~Persistencia() = default;
};

// Mensaje por enviar al nodo `a`.
struct Salida {
  int a;
  Msg msg;
};

struct ConfigRaft {
  int yo = 0;
  uint32_t semilla = 0;
  uint32_t latidoMs = 300, eleccionMinMs = 1500, eleccionMaxMs = 3000;
  size_t topeLog = 1000;
  size_t maxPorAppend = 8;
  uint32_t reintentoForwardMs = 500;
};

// Resultado de proponer un evento:
//  Aceptada  = el líder lo agregó a su log (falta confirmarlo).
//  Pendiente = quedó en la cola de reenvío al líder (o sin líder conocido).
//  Caido     = el nodo está caído; no se guarda nada.
//  LogLleno  = el log llegó al tope; se rechaza sin sobrescribir.
//  Duplicada = ese id ya está en el log (o ya en la cola de reenvío).
enum class Propuesta { Aceptada, Pendiente, Caido, LogLleno, Duplicada };

class Raft {
 public:
  static constexpr int kPrimerNodo = 1, kUltimoNodo = 3;  // los pares son siempre 1..3
  static constexpr size_t kTopeSucesos = 50;
  // Lotes de append sin respuesta por seguidor (y lotes adelantados que guarda un seguidor).
  static constexpr uint32_t kLotesEnVuelo = 4;

  Raft(const ConfigRaft& cfg, Persistencia& pers, std::function<uint64_t()> relojEpochMs);

  void tick(uint64_t ahoraMs);
  void recibir(const Msg& m, uint64_t ahoraMs);  // se ignora si está caído
  std::vector<Salida> sacarSalidas();            // vacía la cola de salida
  Propuesta proponer(Evento ev, uint64_t ahoraMs);
  void caer(uint64_t ahoraMs);
  void recuperar(uint64_t ahoraMs);

  Rol rol() const { return rol_; }
  uint32_t termino() const { return termino_; }
  int votadoPor() const { return votadoPor_; }
  int lider() const { return lider_; }  // 0 si no se conoce
  bool caido() const { return caido_; }
  uint32_t logLen() const { return (uint32_t)log_.size(); }
  uint32_t commitIndex() const { return commitIndex_; }
  size_t pendientes() const { return pendientes_.size(); }  // en cola de reenvío, sin ack ni confirmar
  bool logLleno() const { return log_.size() >= cfg_.topeLog; }
  const std::vector<Entrada>& log() const { return log_; }
  const Sismo& sismo() const { return sismo_; }
  const std::deque<Suceso>& sucesos() const { return sucesos_; }
  uint32_t sucesosSeq() const { return sucesosSeq_; }

 private:
  // --- elección ---
  void reiniciarTemporizador(uint64_t ahoraMs);
  void postularse(uint64_t ahoraMs);
  void ganar(uint64_t ahoraMs);
  void pasarASeguidor();
  void subirTermino(uint32_t t);  // nuevo término sin voto; guarda antes de seguir
  void guardar();
  bool logAlDia(uint32_t lastIdx, uint32_t lastTerm) const;
  int mayoria() const { return (kUltimoNodo - kPrimerNodo + 1) / 2 + 1; }

  // --- mensajes ---
  void alVoteReq(const Msg& m, uint64_t ahoraMs);
  void alVoteResp(const Msg& m, uint64_t ahoraMs);
  void alAppend(const Msg& m, uint64_t ahoraMs);
  void alAppendResp(const Msg& m, uint64_t ahoraMs);
  void guardarAdelantado(const Msg& m);      // seguidor: lote que llegó antes que su anterior
  void procesarAdelantados(uint64_t ahoraMs);
  void alForward(const Msg& m);
  void alForwardAck(const Msg& m);
  void enviarLatidos();
  void enviarAppend(int peer);  // un lote desde nextIdx_[peer] (≤ maxPorAppend); avanza nextIdx_
  void rellenar(int peer);      // manda lotes mientras haya entradas y menos de kLotesEnVuelo sin respuesta
  void enviar(int a, Msg m);

  // --- replicación ---
  Propuesta agregarComoLider(Evento ev);
  void avanzarCommit();
  void aplicarConfirmadas();
  void reenviarPendientes(uint64_t ahoraMs);
  void quitarPendiente(const std::string& id);
  bool idEnLog(const std::string& id, bool soloConfirmadas) const;
  void revisarLleno();

  // --- log (índices 1-based: log_[i-1].indice == i) ---
  uint32_t ultimoIndice() const { return (uint32_t)log_.size(); }
  uint32_t terminoEn(uint32_t idx) const { return idx == 0 || idx > log_.size() ? 0 : log_[idx - 1].termino; }

  void suceso(const char* tipo, const std::string& texto);
  std::string servidor() const { return "Servidor " + std::to_string(cfg_.yo); }

  ConfigRaft cfg_;
  Persistencia& pers_;
  std::function<uint64_t()> reloj_;
  std::mt19937 rng_;

  // Estado persistente.
  uint32_t termino_ = 0;
  int votadoPor_ = 0;

  // Estado volátil.
  Rol rol_ = Rol::Seguidor;
  int lider_ = 0;
  bool caido_ = false;
  bool temporizadorListo_ = false;
  uint64_t plazoEleccion_ = 0;
  uint64_t proximoLatido_ = 0;
  std::set<int> votos_;

  // Log replicado y su máquina de estados.
  std::vector<Entrada> log_;
  uint32_t commitIndex_ = 0;
  uint32_t ultimoAplicado_ = 0;  // entradas ya aplicadas a sismo_ (siempre ≤ commitIndex_)
  bool avisoLleno_ = false;      // ya se registró el suceso "log_lleno"
  // Líder: nextIdx_ es optimista (avanza al enviar); matchIdx_ solo con respuestas ok.
  uint32_t nextIdx_[kUltimoNodo + 1] = {};
  uint32_t matchIdx_[kUltimoNodo + 1] = {};
  bool respondio_[kUltimoNodo + 1] = {};  // el seguidor ya respondió en este término
  uint32_t retroceso_[kUltimoNodo + 1] = {};  // último nextIdx_ al que se retrocedió por un fallo
  uint32_t enVuelo_[kUltimoNodo + 1] = {};    // lotes con entradas sin respuesta (≤ kLotesEnVuelo)
  std::deque<Evento> pendientes_;  // eventos reenviados al líder, sin ack ni vistos confirmados
  uint64_t proximoForward_ = 0;
  std::vector<Msg> adelantados_;  // seguidor: lotes adelantados (≤ kLotesEnVuelo)
  Sismo sismo_;

  std::vector<Salida> salidas_;
  std::deque<Suceso> sucesos_;
  uint32_t sucesosSeq_ = 0;
};

}  // namespace nucleo
