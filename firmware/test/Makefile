# Compila y corre las pruebas del núcleo en el PC (sin hardware).
CXX      ?= g++
JSON_DIR ?= $(HOME)/Arduino/libraries/ArduinoJson/src
CXXFLAGS  = -std=c++17 -Wall -Wextra -O1 -DPRUEBA_MAIN -I../detector/src -I$(JSON_DIR)
NUCLEO    = $(wildcard ../detector/src/nucleo/*.cpp)
TESTS     = $(wildcard test_*.cpp)
BINS      = $(patsubst test_%.cpp,bin/test_%,$(TESTS))

.PHONY: test limpiar
test: $(BINS)
	@fallo=0; for b in $(BINS); do echo "== $$b"; ./$$b || fallo=1; done; exit $$fallo

bin/test_%: test_%.cpp prueba.h $(NUCLEO) $(wildcard ../detector/src/nucleo/*.h) $(wildcard *.h)
	@mkdir -p bin
	$(CXX) $(CXXFLAGS) $< $(NUCLEO) -o $@

limpiar:
	rm -rf bin
