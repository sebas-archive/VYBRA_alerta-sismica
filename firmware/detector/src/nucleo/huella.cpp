#include "huella.h"
#include <algorithm>
#include <cstdlib>

namespace nucleo {

std::vector<Ap> mejoresAps(std::vector<Ap> vistas, size_t max) {
  // Más fuerte primero; a igual RSSI, por BSSID para que el resultado sea estable.
  std::sort(vistas.begin(), vistas.end(), [](const Ap& a, const Ap& b) {
    return a.rssi != b.rssi ? a.rssi > b.rssi : a.bssid < b.bssid;
  });
  std::vector<Ap> r;
  for (const Ap& ap : vistas) {
    if (r.size() >= max) break;
    bool repetido = false;
    for (const Ap& x : r) repetido = repetido || x.bssid == ap.bssid;
    if (!repetido) r.push_back(ap);  // el primero de cada BSSID es el más fuerte
  }
  return r;
}

float parecido(const std::vector<Ap>& ref, const std::vector<Ap>& actual, int tolDb) {
  if (ref.empty()) return 1.0f;
  size_t iguales = 0;
  for (const Ap& r : ref) {
    for (const Ap& a : actual) {
      if (a.bssid == r.bssid) {
        if (std::abs(a.rssi - r.rssi) <= tolDb) iguales++;
        break;
      }
    }
  }
  return (float)iguales / (float)ref.size();
}

void DetectorMovimiento::fijarReferencia(const std::vector<Ap>& ref) {
  ref_ = ref;
  malosSeguidos_ = 0;
  movido_ = false;
}

void DetectorMovimiento::nuevoEscaneo(const std::vector<Ap>& actual) {
  if (ref_.empty()) return;  // sin referencia no hay nada que comparar
  if (parecido(ref_, actual) < 0.5f) {
    if (++malosSeguidos_ >= 2) movido_ = true;
  } else {
    malosSeguidos_ = 0;
  }
}

}  // namespace nucleo
