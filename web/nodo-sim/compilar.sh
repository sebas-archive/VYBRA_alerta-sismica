#!/usr/bin/env bash
# Compila el nodo simulado en el PC (sin Docker): usa el núcleo Raft del firmware y ArduinoJson.
#   JSON_DIR=/ruta/a/ArduinoJson/src  bash web/nodo-sim/compilar.sh   → web/nodo-sim/nodo-sim
set -euo pipefail
cd "$(dirname "$0")"
JSON_DIR="${JSON_DIR:-$HOME/Arduino/libraries/ArduinoJson/src}"
NUCLEO="../../firmware/detector/src"
g++ -std=c++17 -O2 -pthread -Wall -Wextra -I"$NUCLEO" -I"$JSON_DIR" nodo_sim.cpp "$NUCLEO"/nucleo/*.cpp -o nodo-sim
echo "compilado: $(pwd)/nodo-sim"
