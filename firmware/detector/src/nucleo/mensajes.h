// Codificación de mensajes Raft a JSON (claves cortas para caber en un paquete UDP).
#pragma once
#include <cstddef>
#include <string>
#include "tipos.h"

namespace nucleo {

std::string codificar(const Msg& m);
// false si el JSON es inválido o falta el tipo.
bool decodificar(const char* datos, size_t len, Msg& out);

}  // namespace nucleo
