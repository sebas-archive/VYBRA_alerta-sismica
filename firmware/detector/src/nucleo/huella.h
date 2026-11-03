// Huella WiFi: los AP vecinos que ve un nodo sirven para saber si lo movieron de sitio.
// C++ puro (sin Arduino): detector.ino hace el escaneo y se lo entrega a este módulo.
#pragma once
#include <cstddef>
#include <string>
#include <vector>

namespace nucleo {

struct Ap {
  std::string bssid;  // "aa:bb:cc:dd:ee:ff" en minúsculas
  int rssi;           // dBm
};

// Los `max` AP más fuertes, ordenados por RSSI descendente y sin BSSID repetidos.
std::vector<Ap> mejoresAps(std::vector<Ap> vistas, size_t max = 8);

// Proporción de BSSID de `ref` que siguen en `actual` con una diferencia de RSSI <= tolDb.
// Con `ref` vacía devuelve 1.0 (nada con qué comparar).
float parecido(const std::vector<Ap>& ref, const std::vector<Ap>& actual, int tolDb = 12);

// Marca el nodo como movido tras 2 escaneos seguidos con parecido < 0.5.
class DetectorMovimiento {
 public:
  void fijarReferencia(const std::vector<Ap>& ref);  // limpia movido y el contador
  bool tieneReferencia() const { return !ref_.empty(); }
  const std::vector<Ap>& referencia() const { return ref_; }
  void nuevoEscaneo(const std::vector<Ap>& actual);
  bool movido() const { return movido_; }
  // Tras reiniciar: vuelve a marcar "movido" si se había guardado así. Sin referencia no aplica.
  void restaurarMovido(bool movido);

 private:
  std::vector<Ap> ref_;
  int malosSeguidos_ = 0;
  bool movido_ = false;
};

}  // namespace nucleo
