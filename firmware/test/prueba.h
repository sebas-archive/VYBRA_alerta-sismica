// Mini framework de pruebas: PRUEBA(nombre), CHECK(cond), CHECK_EQ(a,b).
#pragma once
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

struct PruebaReg {
  const char* nombre;
  void (*fn)();
};
inline std::vector<PruebaReg>& pruebas_registradas() {
  static std::vector<PruebaReg> v;
  return v;
}
inline int& pruebas_fallas() {
  static int n = 0;
  return n;
}
struct PruebaAuto {
  PruebaAuto(const char* n, void (*f)()) { pruebas_registradas().push_back({n, f}); }
};

#define PRUEBA(nombre)                                    \
  static void prueba_##nombre();                          \
  static PruebaAuto auto_##nombre(#nombre, prueba_##nombre); \
  static void prueba_##nombre()

#define CHECK(cond)                                                          \
  do {                                                                       \
    if (!(cond)) {                                                           \
      std::printf("  FALLA %s:%d: %s\n", __FILE__, __LINE__, #cond);         \
      pruebas_fallas()++;                                                    \
    }                                                                        \
  } while (0)

#define CHECK_EQ(a, b)                                                       \
  do {                                                                       \
    if (!((a) == (b))) {                                                     \
      std::printf("  FALLA %s:%d: %s == %s\n", __FILE__, __LINE__, #a, #b);  \
      pruebas_fallas()++;                                                    \
    }                                                                        \
  } while (0)

#ifdef PRUEBA_MAIN
int main() {
  int total = 0, malas = 0;
  for (auto& p : pruebas_registradas()) {
    int antes = pruebas_fallas();
    p.fn();
    total++;
    bool bien = pruebas_fallas() == antes;
    if (!bien) malas++;
    std::printf("[%s] %s\n", bien ? "ok" : "FALLA", p.nombre);
  }
  std::printf("%d ok, %d fallas\n", total - malas, pruebas_fallas());
  return pruebas_fallas() ? 1 : 0;
}
#endif
