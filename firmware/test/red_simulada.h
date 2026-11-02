// Red en memoria de 3 nodos Raft con pérdida, retraso, particiones y filtro de mensajes.
// Los mensajes viajan serializados con codificar/decodificar, como en UDP.
#pragma once
#include <algorithm>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <random>
#include <set>
#include <string>
#include <vector>
#include "nucleo/mensajes.h"
#include "nucleo/raft.h"

// Persistencia en memoria (en el ESP32 es NVS).
struct PersistenciaMem : nucleo::Persistencia {
  uint32_t termino = 0;
  int votadoPor = 0;
  int guardados = 0;
  void guardar(uint32_t t, int v) override {
    termino = t;
    votadoPor = v;
    guardados++;
  }
  void cargar(uint32_t& t, int& v) override {
    t = termino;
    v = votadoPor;
  }
};

class RedSimulada {
 public:
  static constexpr int kNodos = 3;
  static constexpr uint64_t kEpoch = 1700000000000ull;  // hora "real" simulada al arrancar

  explicit RedSimulada(uint32_t semilla, nucleo::ConfigRaft base = {})
      : semilla_(semilla), base_(base), rng_(semilla) {
    for (int n = 1; n <= kNodos; n++) crear(n);
  }

  // Avanza el reloj de a `pasoMs`: entrega lo que llegó, hace tick y despacha salidas.
  void avanzar(uint64_t ms, uint32_t pasoMs = 10) {
    uint64_t fin = ahora_ + ms;
    while (ahora_ < fin) {
      ahora_ = std::min<uint64_t>(ahora_ + pasoMs, fin);
      entregar();
      registrarLideres();
      for (int n = 1; n <= kNodos; n++) {
        nodo(n).tick(ahora_);
        despachar(n);
        registrarLideres();
      }
    }
  }

  // Seguridad de elección: true si alguna vez hubo dos líderes distintos en el mismo término.
  bool violacionSeguridad() const { return violacion_; }

  nucleo::Raft& nodo(int n) { return *nodos_[n - 1]; }
  const nucleo::Raft& nodo(int n) const { return *nodos_[n - 1]; }
  PersistenciaMem& persistencia(int n) { return *pers_[n - 1]; }
  uint64_t ahora() const { return ahora_; }

  // Los mensajes entre `a` y `b` se pierden (en ambos sentidos).
  void partir(std::set<int> a, std::set<int> b) {
    grupoA_ = std::move(a);
    grupoB_ = std::move(b);
  }
  void unir() {
    grupoA_.clear();
    grupoB_.clear();
  }
  void setPerdida(double p) { perdida_ = p; }
  void setRetraso(uint32_t minMs, uint32_t maxMs) {
    retrasoMin_ = minMs;
    retrasoMax_ = std::max(minMs, maxMs);
  }
  // true = descartar ese mensaje. nullptr quita el filtro.
  void setFiltro(std::function<bool(int de, int a, const nucleo::Msg& m)> descartar) {
    filtro_ = std::move(descartar);
  }

  // Reinicio en frío: Raft nuevo con la misma persistencia y el log vacío.
  void reiniciar(int n) {
    reinicios_++;
    crear(n);
  }

  // Líder único del término más alto entre los nodos vivos; nullopt si hay 0 o más de 1.
  std::optional<int> lideres() const {
    uint32_t mejor = 0;
    std::vector<int> ls;
    for (int n = 1; n <= kNodos; n++) {
      const nucleo::Raft& r = nodo(n);
      if (r.caido() || r.rol() != nucleo::Rol::Lider) continue;
      if (ls.empty() || r.termino() > mejor) {
        ls = {n};
        mejor = r.termino();
      } else if (r.termino() == mejor) {
        ls.push_back(n);
      }
    }
    if (ls.size() != 1) return std::nullopt;
    return ls[0];
  }

 private:
  struct EnVuelo {
    uint64_t entrega;
    uint64_t orden;
    int a;
    std::string datos;
  };

  void crear(int n) {
    if (pers_.size() < (size_t)n) pers_.resize(n);
    if (!pers_[n - 1]) pers_[n - 1] = std::make_unique<PersistenciaMem>();
    nucleo::ConfigRaft c = base_;
    c.yo = n;
    c.semilla = semilla_ * 1000003u + (uint32_t)n * 7919u + reinicios_ * 104729u;
    if (nodos_.size() < (size_t)n) nodos_.resize(n);
    uint64_t* reloj = &ahora_;
    nodos_[n - 1] = std::make_unique<nucleo::Raft>(c, *pers_[n - 1], [reloj] { return kEpoch + *reloj; });
  }

  // Anota término → líder de cada nodo vivo que hoy es líder.
  void registrarLideres() {
    for (int n = 1; n <= kNodos; n++) {
      const nucleo::Raft& r = nodo(n);
      if (r.caido() || r.rol() != nucleo::Rol::Lider) continue;
      auto it = lideresPorTermino_.find(r.termino());
      if (it == lideresPorTermino_.end())
        lideresPorTermino_[r.termino()] = n;
      else if (it->second != n)
        violacion_ = true;
    }
  }

  bool cortado(int de, int a) const {
    return (grupoA_.count(de) && grupoB_.count(a)) || (grupoB_.count(de) && grupoA_.count(a));
  }

  void despachar(int de) {
    for (nucleo::Salida& s : nodo(de).sacarSalidas()) {
      if (s.a < 1 || s.a > kNodos || s.a == de) continue;
      if (cortado(de, s.a)) continue;
      if (perdida_ > 0 && std::uniform_real_distribution<double>(0, 1)(rng_) < perdida_) continue;
      if (filtro_ && filtro_(de, s.a, s.msg)) continue;
      uint32_t r = std::uniform_int_distribution<uint32_t>(retrasoMin_, retrasoMax_)(rng_);
      vuelo_.push_back({ahora_ + r, orden_++, s.a, nucleo::codificar(s.msg)});
    }
  }

  void entregar() {
    // Los mensajes que se generen al entregar llegan como mínimo en el próximo paso.
    std::vector<EnVuelo> listos;
    auto it = std::stable_partition(vuelo_.begin(), vuelo_.end(),
                                    [this](const EnVuelo& v) { return v.entrega > ahora_; });
    listos.assign(std::make_move_iterator(it), std::make_move_iterator(vuelo_.end()));
    vuelo_.erase(it, vuelo_.end());
    std::sort(listos.begin(), listos.end(), [](const EnVuelo& x, const EnVuelo& y) {
      return x.entrega != y.entrega ? x.entrega < y.entrega : x.orden < y.orden;
    });
    for (const EnVuelo& v : listos) {
      nucleo::Msg m;
      if (!nucleo::decodificar(v.datos.data(), v.datos.size(), m)) continue;
      nodo(v.a).recibir(m, ahora_);
      despachar(v.a);
    }
  }

  uint32_t semilla_;
  nucleo::ConfigRaft base_;
  std::mt19937 rng_;
  uint32_t reinicios_ = 0;
  uint64_t ahora_ = 0;
  uint64_t orden_ = 0;
  std::vector<std::unique_ptr<PersistenciaMem>> pers_;
  std::vector<std::unique_ptr<nucleo::Raft>> nodos_;
  std::vector<EnVuelo> vuelo_;
  std::set<int> grupoA_, grupoB_;
  double perdida_ = 0;
  uint32_t retrasoMin_ = 1, retrasoMax_ = 10;
  std::function<bool(int, int, const nucleo::Msg&)> filtro_;
  std::map<uint32_t, int> lideresPorTermino_;
  bool violacion_ = false;
};
