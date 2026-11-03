#include "nucleo/huella.h"
#include "prueba.h"
using namespace nucleo;

// Lista de n AP con BSSID distintos y RSSI -40, -45, -50...
static std::vector<Ap> lista(int n, int delta = 0) {
  std::vector<Ap> v;
  for (int i = 0; i < n; i++) {
    char b[24];
    std::snprintf(b, sizeof b, "aa:bb:cc:dd:ee:%02x", i);
    v.push_back({b, -40 - 5 * i + delta});
  }
  return v;
}

PRUEBA(mejores_ordena_y_recorta) {
  std::vector<Ap> v = lista(10);
  v.push_back({"aa:bb:cc:dd:ee:03", -90});  // repetido y más débil: se descarta
  std::vector<Ap> r = {v[7], v[2], v[9], v[0], v[5], v[10], v[1], v[8], v[3], v[6], v[4]};
  std::vector<Ap> m = mejoresAps(r);
  CHECK_EQ(m.size(), 8u);
  for (size_t i = 1; i < m.size(); i++) CHECK(m[i - 1].rssi >= m[i].rssi);
  for (size_t i = 0; i < m.size(); i++)
    for (size_t j = i + 1; j < m.size(); j++) CHECK(m[i].bssid != m[j].bssid);
  CHECK_EQ(m[0].rssi, -40);
  CHECK_EQ(m[3].bssid, std::string("aa:bb:cc:dd:ee:03"));
  CHECK_EQ(m[3].rssi, -55);  // se conserva el más fuerte del repetido
}

PRUEBA(parecido_igual_es_1) {
  CHECK_EQ(parecido(lista(5), lista(5)), 1.0f);
}

PRUEBA(parecido_tolera_12db) {
  CHECK_EQ(parecido(lista(5), lista(5, 12)), 1.0f);
  CHECK_EQ(parecido(lista(5), lista(5, 13)), 0.0f);
}

PRUEBA(parecido_mitad) {
  std::vector<Ap> a = lista(8);
  std::vector<Ap> b(a.begin(), a.begin() + 4);
  CHECK_EQ(parecido(a, b), 0.5f);
}

PRUEBA(parecido_referencia_vacia_es_1) {
  CHECK_EQ(parecido({}, lista(3)), 1.0f);
}

PRUEBA(sin_referencia_no_movido) {
  DetectorMovimiento d;
  CHECK(!d.tieneReferencia());
  d.nuevoEscaneo(lista(5, 30));
  d.nuevoEscaneo(lista(5, 30));
  CHECK(!d.movido());
}

PRUEBA(movido_tras_2_seguidos) {
  DetectorMovimiento d;
  d.fijarReferencia(lista(5));
  CHECK(d.tieneReferencia());
  CHECK_EQ(d.referencia().size(), 5u);
  std::vector<Ap> malo = lista(5, 30);
  malo.resize(1);  // parecido 0.2 a lo sumo
  d.nuevoEscaneo({});
  CHECK(!d.movido());
  d.nuevoEscaneo(malo);
  CHECK(d.movido());
}

PRUEBA(uno_malo_y_uno_bueno_no_movido) {
  DetectorMovimiento d;
  d.fijarReferencia(lista(5));
  std::vector<Ap> malo = lista(1);  // parecido 0.2
  d.nuevoEscaneo(malo);
  d.nuevoEscaneo(lista(5, 3));
  d.nuevoEscaneo(malo);
  CHECK(!d.movido());
}

PRUEBA(fijar_referencia_limpia) {
  DetectorMovimiento d;
  d.fijarReferencia(lista(5));
  d.nuevoEscaneo({});
  d.nuevoEscaneo({});
  CHECK(d.movido());
  d.fijarReferencia(lista(5));
  CHECK(!d.movido());
  d.nuevoEscaneo({});
  CHECK(!d.movido());  // el contador también se limpió
}

PRUEBA(ap_nuevos_mas_fuertes_no_mueven) {
  // Referencia de 8; el escaneo actual trae los mismos 8 y 10 AP nuevos más fuertes.
  std::vector<Ap> ref = lista(8);
  std::vector<Ap> actual = ref;
  for (int i = 0; i < 10; i++) {
    char b[24];
    std::snprintf(b, sizeof b, "11:22:33:44:55:%02x", i);
    actual.push_back({b, -20 - i});
  }
  std::vector<Ap> completo = mejoresAps(actual, actual.size());  // como detector.ino: sin recortar
  CHECK_EQ(completo.size(), 18u);
  CHECK_EQ(parecido(ref, completo), 1.0f);
  CHECK(parecido(ref, mejoresAps(actual)) < 0.5f);  // con solo los 8 mejores se perdería todo
  DetectorMovimiento d;
  d.fijarReferencia(ref);
  d.nuevoEscaneo(completo);
  d.nuevoEscaneo(completo);
  CHECK(!d.movido());
}

PRUEBA(restaurar_movido) {
  DetectorMovimiento d;
  d.restaurarMovido(true);
  CHECK(!d.movido());  // sin referencia no aplica
  d.fijarReferencia(lista(5));
  d.restaurarMovido(true);
  CHECK(d.movido());
  d.nuevoEscaneo(lista(5));
  CHECK(d.movido());  // un escaneo bueno no lo desmarca: solo una referencia nueva
  d.fijarReferencia(lista(5));
  CHECK(!d.movido());
  d.restaurarMovido(false);
  d.nuevoEscaneo({});
  CHECK(!d.movido());  // el contador arranca de cero
}

PRUEBA(union_evita_falso_positivo) {
  // Cada escaneo ve solo la mitad de la referencia (beacons perdidos), pero entre los dos la ven toda.
  DetectorMovimiento d;
  std::vector<Ap> ref = lista(8);
  d.fijarReferencia(ref);
  std::vector<Ap> a(ref.begin(), ref.begin() + 4);
  std::vector<Ap> b(ref.begin() + 4, ref.end());
  d.nuevoEscaneo(a);
  d.nuevoEscaneo(b);
  CHECK(!d.movido());
  d.nuevoEscaneo(a);
  d.nuevoEscaneo(b);
  CHECK(!d.movido());
}

PRUEBA(movido_real_con_union) {
  DetectorMovimiento d;
  d.fijarReferencia(lista(8));
  std::vector<Ap> otros;
  for (int i = 0; i < 6; i++) {
    char b[24];
    std::snprintf(b, sizeof b, "11:22:33:44:55:%02x", i);
    otros.push_back({b, -50 - i});
  }
  d.nuevoEscaneo(otros);
  CHECK(!d.movido());
  d.nuevoEscaneo(otros);
  CHECK(d.movido());
}

PRUEBA(union_se_queda_con_rssi_mas_fuerte) {
  // El AP 0 se ve débil (-80) en un escaneo y bien (-40) en el otro: cuenta como igual.
  DetectorMovimiento d;
  d.fijarReferencia(lista(1));
  d.nuevoEscaneo({{"aa:bb:cc:dd:ee:00", -40}});
  d.nuevoEscaneo({{"aa:bb:cc:dd:ee:00", -80}});
  d.nuevoEscaneo({{"aa:bb:cc:dd:ee:00", -40}});
  CHECK(!d.movido());
}

PRUEBA(fijar_referencia_limpia_historial) {
  // Un escaneo anterior a la referencia nueva no debe sumarse a la unión.
  DetectorMovimiento d;
  std::vector<Ap> ref = lista(8);
  d.fijarReferencia(ref);
  d.nuevoEscaneo(ref);
  d.fijarReferencia(ref);
  d.nuevoEscaneo({});
  d.nuevoEscaneo({});
  CHECK(d.movido());
}

PRUEBA(union_evita_falso_positivo_3_y_3) {
  // Cada escaneo solo ve 3 de 8 (parecido 0.375 < 0.5), pero la unión ve 6 de 8 (0.75).
  DetectorMovimiento d;
  std::vector<Ap> ref = lista(8);
  d.fijarReferencia(ref);
  std::vector<Ap> a(ref.begin(), ref.begin() + 3);
  std::vector<Ap> b(ref.begin() + 3, ref.begin() + 6);
  d.nuevoEscaneo(a);
  d.nuevoEscaneo(b);
  d.nuevoEscaneo(a);
  CHECK(!d.movido());
}
