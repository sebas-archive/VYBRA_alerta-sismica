// ESP32 SIMULADO con el MISMO núcleo Raft del firmware (firmware/detector/src/nucleo) compilado para Linux.
// Mismo protocolo UDP entre nodos y mismo contrato HTTP que el ESP32 real (/estado, /log, /sucesos, /alertas,
// /control, /pulsar). Elección de líder, caída de un nodo, pérdida de quórum y reincorporación son Raft de verdad:
// si el contenedor se apaga, los otros nodos dejan de recibir sus latidos y lo detectan por sí solos.
//
// Variables: N (1-3, obligatoria) · PUERTO_HTTP (8080) · PUERTO_RAFT (4210) · PEER_1..PEER_3 (host[:puerto] de cada
// nodo; por defecto nodo1..nodo3) · DATOS_DIR (/var/lib/nodo: término y voto, como la NVS del ESP32) ·
// LATIDO_MS (300) · ELECCION_MIN_MS (1500) · ELECCION_MAX_MS (3000) · IP_PROPIA (opcional).
#include <arpa/inet.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <ArduinoJson.h>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <mutex>
#include <random>
#include <string>
#include <thread>

#include "nucleo/api.h"
#include "nucleo/mensajes.h"
#include "nucleo/raft.h"

using nucleo::Propuesta;

static volatile sig_atomic_t g_salir = 0;
static void alSalir(int) { g_salir = 1; }

static std::string env(const char* k, const char* def) {
  const char* v = std::getenv(k);
  return v && *v ? v : def;
}
static long envNum(const char* k, long def) {
  const char* v = std::getenv(k);
  return v && *v ? std::atol(v) : def;
}

static const auto kInicio = std::chrono::steady_clock::now();
static uint64_t ahoraMs() {
  return 1000 + (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - kInicio).count();
}
static uint64_t ahoraEpochMs() {
  return (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
}

// Término y voto en disco: Raft los exige estables entre reinicios (en el ESP32 son la NVS).
struct PersArchivo : nucleo::Persistencia {
  std::string ruta;
  explicit PersArchivo(std::string r) : ruta(std::move(r)) {}
  void guardar(uint32_t termino, int votadoPor) override {
    std::string tmp = ruta + ".tmp";
    {
      std::ofstream f(tmp, std::ios::trunc);
      f << termino << " " << votadoPor << "\n";
    }
    std::rename(tmp.c_str(), ruta.c_str());
  }
  void cargar(uint32_t& termino, int& votadoPor) override {
    std::ifstream f(ruta);
    uint32_t t = 0;
    int v = 0;
    if (f >> t >> v) { termino = t; votadoPor = v; }
  }
};

struct Peer {
  std::string host;
  int puerto = 4210;
  sockaddr_in dir{};
  bool ok = false;
  uint64_t proxima = 0;
};

// Los contenedores pueden cambiar de IP al reiniciarse: un hilo aparte las vuelve a resolver cada 1,5 s.
// La resolución DNS puede tardar segundos (p. ej. un par apagado): NUNCA debe hacerlo el bucle principal, o el nodo
// dejaría de latir y de atender HTTP.
static std::mutex g_mx;
static void resolver(Peer& p) {
  addrinfo hints{}, *res = nullptr;
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_DGRAM;
  bool ok = getaddrinfo(p.host.c_str(), nullptr, &hints, &res) == 0 && res;
  std::lock_guard<std::mutex> l(g_mx);
  p.ok = ok;
  if (ok) {
    p.dir = *reinterpret_cast<sockaddr_in*>(res->ai_addr);
    p.dir.sin_port = htons((uint16_t)p.puerto);
  }
  if (res) freeaddrinfo(res);
}
static bool direccion(const Peer& p, sockaddr_in& out) {
  std::lock_guard<std::mutex> l(g_mx);
  if (p.ok) out = p.dir;
  return p.ok;
}

static std::string ipLocal(const Peer& referencia) {
  sockaddr_in ref{};
  bool hayRef = direccion(referencia, ref);
  std::string propia = env("IP_PROPIA", "");
  if (!propia.empty()) return propia;
  int s = socket(AF_INET, SOCK_DGRAM, 0);
  std::string r = "0.0.0.0";
  if (s >= 0) {
    sockaddr_in d{};
    d.sin_family = AF_INET;
    d.sin_port = htons(9);
    d.sin_addr.s_addr = hayRef ? ref.sin_addr.s_addr : inet_addr("10.255.255.255");
    if (connect(s, reinterpret_cast<sockaddr*>(&d), sizeof d) == 0) {
      sockaddr_in l{};
      socklen_t n = sizeof l;
      if (getsockname(s, reinterpret_cast<sockaddr*>(&l), &n) == 0) r = inet_ntoa(l.sin_addr);
    }
    close(s);
  }
  return r;
}

// ---------------------------------------------------------------- HTTP

static const char* PAGINA =
    "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>Detector simulado</title><style>body{font:16px system-ui;margin:24px;max-width:480px}pre{background:#f2f2f2;padding:12px;"
    "border-radius:8px;overflow:auto}</style><h1>Detector simulado</h1><p>ESP32 simulado con el núcleo Raft del firmware. "
    "No es hardware real.</p><pre id=e>…</pre><script>async function t(){try{e.textContent=JSON.stringify(await (await fetch('/estado')).json(),null,2)}"
    "catch(x){e.textContent=String(x)}}t();setInterval(t,3000)</script></html>";

static void enviarHttp(int fd, int codigo, const char* tipo, const std::string& cuerpo) {
  const char* msg = codigo == 200 ? "OK" : codigo == 202 ? "Accepted" : codigo == 204 ? "No Content" : codigo == 400 ? "Bad Request"
                  : codigo == 404 ? "Not Found" : codigo == 409 ? "Conflict" : codigo == 507 ? "Insufficient Storage" : "Error";
  std::string r = "HTTP/1.1 " + std::to_string(codigo) + " " + msg + "\r\nContent-Type: " + tipo +
                  "\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\nContent-Length: " +
                  std::to_string(cuerpo.size()) + "\r\n\r\n" + cuerpo;
  size_t off = 0;
  while (off < r.size()) {
    ssize_t n = send(fd, r.data() + off, r.size() - off, MSG_NOSIGNAL);
    if (n <= 0) break;
    off += (size_t)n;
  }
}
static void json(int fd, int codigo, const std::string& cuerpo) { enviarHttp(fd, codigo, "application/json", cuerpo); }
static void error(int fd, int codigo, const char* texto) {
  JsonDocument d;
  d["error"] = texto;
  std::string s;
  serializeJson(d, s);
  json(fd, codigo, s);
}

static const char* nombrePropuesta(Propuesta p) {
  switch (p) {
    case Propuesta::Aceptada: return "aceptada";
    case Propuesta::Pendiente: return "pendiente";
    case Propuesta::Caido: return "caido";
    case Propuesta::LogLleno: return "log_lleno";
    case Propuesta::ColaLlena: return "cola_llena";
    default: return "duplicada";
  }
}

// nodo-sim --salud: comprueba que el propio nodo responde /estado (healthcheck de Docker).
static int salud() {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in d{};
  d.sin_family = AF_INET;
  d.sin_port = htons((uint16_t)envNum("PUERTO_HTTP", 8080));
  d.sin_addr.s_addr = inet_addr("127.0.0.1");
  timeval tv{2, 0};
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof tv);
  if (connect(fd, reinterpret_cast<sockaddr*>(&d), sizeof d) != 0) return 1;
  const char* q = "GET /estado HTTP/1.0\r\n\r\n";
  if (send(fd, q, std::strlen(q), 0) < 0) return 1;
  char b[64] = {0};
  ssize_t n = recv(fd, b, sizeof b - 1, 0);
  close(fd);
  return n > 0 && std::strstr(b, " 200 ") ? 0 : 1;
}

int main(int argc, char** argv) {
  if (argc > 1 && std::strcmp(argv[1], "--salud") == 0) return salud();
  const int N = (int)envNum("N", 0);
  if (N < 1 || N > 3) { std::fprintf(stderr, "Falta N=1, 2 o 3\n"); return 1; }
  std::signal(SIGTERM, alSalir);
  std::signal(SIGINT, alSalir);
  std::signal(SIGPIPE, SIG_IGN);

  const int puertoHttp = (int)envNum("PUERTO_HTTP", 8080), puertoRaft = (int)envNum("PUERTO_RAFT", 4210);
  std::string datos = env("DATOS_DIR", "/var/lib/nodo");
  PersArchivo pers(datos + "/raft-" + std::to_string(N) + ".txt");

  nucleo::ConfigRaft cfg;
  cfg.yo = N;
  std::random_device rd;
  const uint32_t arranque = rd();
  cfg.semilla = arranque ^ (uint32_t)(N * 7919);
  cfg.latidoMs = (uint32_t)envNum("LATIDO_MS", 300);
  cfg.eleccionMinMs = (uint32_t)envNum("ELECCION_MIN_MS", 1500);
  cfg.eleccionMaxMs = (uint32_t)envNum("ELECCION_MAX_MS", 3000);
  nucleo::Raft raft(cfg, pers, ahoraEpochMs);

  Peer peers[4];
  for (int i = 1; i <= 3; i++) {
    std::string def = "nodo" + std::to_string(i), v = env(("PEER_" + std::to_string(i)).c_str(), def.c_str());
    size_t c = v.rfind(':');
    if (c != std::string::npos) { peers[i].host = v.substr(0, c); peers[i].puerto = std::atoi(v.c_str() + c + 1); }
    else { peers[i].host = v; peers[i].puerto = puertoRaft; }
  }

  int udp = socket(AF_INET, SOCK_DGRAM, 0);
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_addr.s_addr = INADDR_ANY;
  a.sin_port = htons((uint16_t)puertoRaft);
  int uno = 1;
  setsockopt(udp, SOL_SOCKET, SO_REUSEADDR, &uno, sizeof uno);
  if (bind(udp, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0) { std::perror("bind udp"); return 1; }
  fcntl(udp, F_SETFL, O_NONBLOCK);

  int tcp = socket(AF_INET, SOCK_STREAM, 0);
  setsockopt(tcp, SOL_SOCKET, SO_REUSEADDR, &uno, sizeof uno);
  a.sin_port = htons((uint16_t)puertoHttp);
  if (bind(tcp, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0 || listen(tcp, 128) != 0) { std::perror("bind http"); return 1; }
  fcntl(tcp, F_SETFL, O_NONBLOCK);

  std::printf("Nodo %d simulado (núcleo Raft del firmware) · HTTP :%d · UDP :%d · término guardado %u\n", N, puertoHttp, puertoRaft, raft.termino());
  std::fflush(stdout);
  uint32_t contador = 0;
  char buf[4096];
  std::thread resolvedor([&] {
    while (!g_salir) {
      for (int i = 1; i <= 3; i++) if (i != N) resolver(peers[i]);
      for (int k = 0; k < 15 && !g_salir; k++) std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
  });

  while (!g_salir) {
    pollfd fds[2] = {{udp, POLLIN, 0}, {tcp, POLLIN, 0}};
    poll(fds, 2, 20);
    uint64_t ahora = ahoraMs();

    // UDP de los otros nodos
    for (;;) {
      ssize_t n = recvfrom(udp, buf, sizeof buf, 0, nullptr, nullptr);
      if (n <= 0) break;
      nucleo::Msg m;
      if (nucleo::decodificar(buf, (size_t)n, m)) raft.recibir(m, ahora);
    }
    raft.tick(ahora);
    for (const nucleo::Salida& s : raft.sacarSalidas()) {
      if (s.a < 1 || s.a > 3 || s.a == N) continue;
      sockaddr_in destino{};
      if (!direccion(peers[s.a], destino)) continue;      // aún sin resolver o apagado: el mensaje se pierde (UDP)
      std::string txt = nucleo::codificar(s.msg);
      sendto(udp, txt.data(), txt.size(), 0, reinterpret_cast<const sockaddr*>(&destino), sizeof destino);
    }

    // HTTP (un cliente a la vez, igual que el WebServer del ESP32)
    int fd = accept(tcp, nullptr, nullptr);
    if (fd < 0) continue;
    timeval tv{0, 300000};
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof tv);
    std::string req;
    size_t fin = std::string::npos;
    while (req.size() < 8192 && (fin = req.find("\r\n\r\n")) == std::string::npos) {
      ssize_t n = recv(fd, buf, sizeof buf, 0);
      if (n <= 0) break;
      req.append(buf, (size_t)n);
    }
    if (fin == std::string::npos) { close(fd); continue; }
    std::string cabeza = req.substr(0, fin), cuerpo = req.substr(fin + 4);
    size_t largo = 0, p = cabeza.find("Content-Length:");
    if (p == std::string::npos) p = cabeza.find("content-length:");
    if (p != std::string::npos) largo = (size_t)std::atol(cabeza.c_str() + p + 15);
    while (cuerpo.size() < largo && cuerpo.size() < 4096) {
      ssize_t n = recv(fd, buf, sizeof buf, 0);
      if (n <= 0) break;
      cuerpo.append(buf, (size_t)n);
    }
    size_t sp1 = cabeza.find(' '), sp2 = cabeza.find(' ', sp1 + 1);
    std::string metodo = cabeza.substr(0, sp1), objetivo = sp1 == std::string::npos ? "" : cabeza.substr(sp1 + 1, sp2 - sp1 - 1);
    std::string ruta = objetivo.substr(0, objetivo.find('?')), consulta = objetivo.find('?') == std::string::npos ? "" : objetivo.substr(objetivo.find('?') + 1);
    uint32_t desde = 0;
    size_t q = consulta.find("desde=");
    if (q != std::string::npos) { long v = std::atol(consulta.c_str() + q + 6); desde = v > 0 ? (uint32_t)v : 0; }

    if (metodo == "OPTIONS") {
      enviarHttp(fd, 204, "text/plain", "");
    } else if (metodo == "GET" && ruta == "/") {
      enviarHttp(fd, 200, "text/html; charset=utf-8", PAGINA);
    } else if (metodo == "GET" && ruta == "/estado") {
      nucleo::InfoRed info;
      info.ip = ipLocal(peers[N == 1 ? 2 : 1]);
      info.rssi = 0;                 // sin WiFi: el simulador no inventa una señal
      info.uptimeMs = ahora;
      info.conHora = true;
      info.movido = false;
      info.conHuella = false;
      json(fd, 200, nucleo::jsonEstado(raft, N, info));
    } else if (metodo == "GET" && ruta == "/log") {
      json(fd, 200, nucleo::jsonLog(raft, desde));
    } else if (metodo == "GET" && ruta == "/sucesos") {
      json(fd, 200, nucleo::jsonSucesos(raft, desde));
    } else if (metodo == "GET" && ruta == "/alertas") {
      json(fd, 200, nucleo::jsonAlertas(raft));
    } else if (metodo == "POST" && ruta == "/control") {
      JsonDocument d;
      if (deserializeJson(d, cuerpo)) { error(fd, 400, "json invalido"); }
      else {
        const char* accion = d["accion"] | "";
        if (std::strcmp(accion, "caer") == 0) raft.caer(ahora);
        else if (std::strcmp(accion, "recuperar") == 0) raft.recuperar(ahora);
        else { error(fd, 400, "accion invalida"); close(fd); continue; }
        JsonDocument r;
        r["ok"] = true;
        r["caido"] = raft.caido();
        std::string s;
        serializeJson(r, s);
        json(fd, 200, s);
      }
    } else if (metodo == "POST" && ruta == "/pulsar") {
      JsonDocument d;
      if (deserializeJson(d, cuerpo)) { error(fd, 400, "json invalido"); }
      else {
        long ms = d["ms"] | -1L;
        if (ms < 80 || ms > 60000) error(fd, 400, "ms fuera de rango");
        else if (raft.caido()) error(fd, 409, "caido");
        else {
          char id[40];
          std::snprintf(id, sizeof id, "nodo-%d-%08lx-%lu", N, (unsigned long)arranque, (unsigned long)++contador);
          nucleo::Evento ev;
          ev.id = id;
          ev.nodo = N;
          ev.nivel = nucleo::Sismo::nivelPorTiempo((uint32_t)ms);
          ev.pga = 0.028f * ev.nivel + 0.015f;   // misma escala que el firmware
          ev.duracion_ms = (uint32_t)ms;
          ev.t = ahoraEpochMs();
          ev.recibido_por = N;
          Propuesta pr = raft.proponer(ev, ahora);
          if (pr == Propuesta::Caido) error(fd, 409, "caido");
          else if (pr == Propuesta::LogLleno) error(fd, 507, "log lleno");
          else if (pr == Propuesta::ColaLlena) error(fd, 507, "cola de reenvio llena");
          else {
            JsonDocument r;
            r["ok"] = true;
            r["id"] = ev.id;
            r["nivel"] = ev.nivel;
            r["resultado"] = nombrePropuesta(pr);
            std::string s;
            serializeJson(r, s);
            json(fd, 200, s);
          }
        }
      }
    } else if (metodo == "POST" && ruta == "/huella") {
      json(fd, raft.caido() ? 409 : 202, raft.caido() ? "{\"error\":\"caido\"}" : "{\"ok\":true}");
    } else {
      error(fd, 404, "no existe");
    }
    close(fd);
  }
  g_salir = 1;
  resolvedor.join();
  std::printf("Nodo %d: apagado ordenado\n", N);
  return 0;
}
