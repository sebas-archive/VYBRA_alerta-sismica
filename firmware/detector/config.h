// Configuración compartida por los 3 detectores.
// El número de detector NO va aquí: se elige al compilar (./cargar.sh 1, 2 o 3).
#pragma once
#include <stdint.h>

#define WIFI_SSID "Tomas"
#include "secretos.h"   // WIFI_PASS y OTA_CLAVE; no va en git

// Las IP las da el DHCP del router. Los nodos se encuentran por broadcast UDP.
static const uint16_t PUERTO_DESCUBRIR = 4211;
static const uint32_t HOLA_CADA_MS = 2000;

// Tiempos de Raft. Con el hotspot del celular el WiFi llega a 200-600 ms y pierde paquetes:
// con 1.5-3 s de elección los latidos se pierden y los nodos se disputan el liderazgo sin parar.
// En un router normal sirven latido 300 y elección 1500-3000.
static const uint32_t RAFT_LATIDO_MS = 500;
static const uint32_t RAFT_ELECCION_MIN_MS = 5000;
static const uint32_t RAFT_ELECCION_MAX_MS = 9000;

// Puerto UDP de los mensajes Raft entre nodos; la API HTTP va en el 80.
static const uint16_t PUERTO_RAFT = 4210;

// Zona horaria de Colombia (UTC-5, sin horario de verano)
#define GMT_OFFSET_S (-5 * 3600)

// Portal de configuración WiFi: la placa crea la red SISMO-D<N>-config (clave PORTAL_CLAVE, mínimo 8)
// si no logra conectarse al arrancar, o si se mantiene el botón presionado al encenderla.
#define PORTAL_CLAVE "[REDACTADO]"
static const uint32_t PORTAL_BOTON_MS = 3000;     // botón presionado al encender: abre el portal
static const uint32_t PORTAL_MAX_MS = 300000;     // sin configurarla en 5 min, reinicia y reintenta
