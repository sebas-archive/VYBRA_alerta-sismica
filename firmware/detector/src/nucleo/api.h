// JSON de la API HTTP de cada nodo: /estado, /log, /sucesos y /alertas (contrato con web/).
#pragma once
#include <cstdint>
#include <string>
#include "raft.h"

namespace nucleo {

// Datos de la red que el núcleo no conoce (los pone detector.ino).
struct InfoRed {
  std::string ip;
  int rssi;
  uint64_t uptimeMs;
  bool conHora;  // NTP ya sincronizó
  bool movido;     // la huella WiFi cambió: el nodo ya no está donde se ubicó
  bool conHuella;  // el nodo tiene una huella de referencia guardada
};

// Tamaño de página de /log.
constexpr uint32_t kPaginaLog = 50;

// Situación para la página de estado y el panel:
//  "caido"         = caída simulada.
//  "sincronizando" = sin líder conocido, candidato, seguidor detrás del commit del líder,
//                    o líder con entradas sin confirmar.
//  "funcionando"   = en otro caso.
const char* situacion(const Raft& r);

std::string jsonEstado(const Raft& r, int nodo, const InfoRed& red);  // < 1 KB
std::string jsonLog(const Raft& r, uint32_t desde);      // entradas [desde, desde+49], 1-based
std::string jsonSucesos(const Raft& r, uint32_t desde);  // sucesos con seq > desde
std::string jsonAlertas(const Raft& r);

}  // namespace nucleo
