// Configuración compartida por los 3 detectores.
// El número de detector NO va aquí: se elige al compilar (./cargar.sh 1, 2 o 3).
#pragma once

#define WIFI_SSID "Apt_105"
#include "secretos.h"   // WIFI_PASS (y luego OTA_CLAVE); no va en git

// IP y puerto de cada servidor del clúster. Cámbialas por las reales.
static const char* SERVIDORES[3] = {
  "http://192.168.1.11:8000",   // Servidor 1
  "http://192.168.1.12:8000",   // Servidor 2
  "http://192.168.1.13:8000"    // Servidor 3
};

// Zona horaria de Colombia (UTC-5, sin horario de verano)
#define GMT_OFFSET_S (-5 * 3600)
