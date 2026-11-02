// Configuración compartida por los 3 detectores.
// El número de detector NO va aquí: se elige al compilar (./cargar.sh 1, 2 o 3).
#pragma once
#include <stdint.h>

#define WIFI_SSID "Apt_105"
#include "secretos.h"   // WIFI_PASS y OTA_CLAVE; no va en git

// IP fija de cada nodo (nodo-N usa IP_NODOS[N-1]). El gateway también hace de DNS.
static const char* const IP_NODOS[3] = {"192.168.80.201", "192.168.80.202", "192.168.80.203"};
static const char* const GATEWAY = "192.168.80.1";
static const char* const MASCARA = "255.255.255.0";

// Puerto UDP de los mensajes Raft entre nodos; la API HTTP va en el 80.
static const uint16_t PUERTO_RAFT = 4210;

// Zona horaria de Colombia (UTC-5, sin horario de verano)
#define GMT_OFFSET_S (-5 * 3600)
