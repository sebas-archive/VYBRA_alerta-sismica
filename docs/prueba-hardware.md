# Prueba guiada con los 3 prototipos

Checklist para cargar el firmware Raft en las 3 placas y comprobar la demostración completa. Marca cada casilla al terminar.

## Reglas durante la prueba y la demostración

- **Dos nodos caídos solo con "Simular caída"** desde el panel. Para desenchufar placas de verdad, hazlo **de a una** y espera "3 / 3 copias idénticas" en Registros antes de desenchufar otra.
- **No abras las IP de los nodos (`192.168.80.201`–`.203`) en un navegador.** Atienden de a un cliente y el navegador los puede dejar ocupados varios segundos; el panel los mostraría como inalcanzables.
- **Antes de probar alertas, revisa que los 3 nodos tengan hora:** en Clúster Raft no debe aparecer "sin hora", y `con_hora` debe ser `true` en `/api/estado`. Un evento sin hora nunca forma alerta.

## 1. Carga por USB (una placa a la vez)

Para cada placa N = 1, 2, 3:

- [ ] Conecta solo esa placa al PC y da permiso al puerto:
  ```bash
  sudo setfacl -m u:t1an:rw /dev/ttyUSB0
  ```
- [ ] Carga: `firmware/cargar.sh N`
- [ ] Monitor serie (115200): debe decir `nodo-N conectado a Apt_105, IP 192.168.80.20N`.
- [ ] Desconéctala, márcala SIS-DN y enchúfala a su toma.

## 2. El clúster se forma

- [ ] Con los 3 enchufados:
  ```bash
  for i in 1 2 3; do curl -s http://192.168.80.20$i/estado; echo; done
  ```
  Esperado: exactamente un `"rol":"lider"` y el mismo `lider_conocido` en los 3.
- [ ] El LED azul de cada placa queda fijo (hay líder).

## 3. Carga por WiFi (OTA)

- [ ] `firmware/cargar.sh 2 --wifi` → carga sin cable y el nodo 2 vuelve al clúster como seguidor.

## 4. Interfaz

- [ ] `cd web && npm start` → abre el panel en `http://localhost:8080` y la vista pública en `http://192.168.80.227:8080/publico`, también desde un celular conectado a `Apt_105`.

## 5. Casos de la demostración

| # | Acción | Resultado esperado | ✓ |
|---|---|---|---|
| 1 | Botón de cada prototipo | El evento queda confirmado en Registros con el nodo correcto. En un seguidor, el aviso dice "reenviado al líder". | [ ] |
| 2 | Botones de dos prototipos con < 10 s de diferencia | Alerta en el panel y a pantalla completa en `/publico`, con la franja SIMULACRO. | [ ] |
| 3 | Botones con > 10 s de diferencia | Sin alerta. | [ ] |
| 4 | Desenchufar el líder | Nuevo líder en < 5 s; el panel marca el viejo como inalcanzable. | [ ] |
| 5 | Volver a enchufarlo | Regresa como seguidor y se pone al día ("3 / 3 copias idénticas"). | [ ] |
| 6 | "Simular caída" en 2 nodos | Banner "Sin quórum"; el botón del nodo vivo queda pendiente. | [ ] |
| 7 | "Recuperar" uno | El pendiente se confirma. | [ ] |
| 8 | Cerrar el servidor del PC (Ctrl+C) | Los nodos siguen; al reabrirlo, el panel muestra el estado actual. | [ ] |
| 9 | Reiniciar el router | Cada placa vuelve con su misma IP (`.201`–`.203`). | [ ] |

## 6. Mediciones a anotar

- [ ] Tiempo de respuesta de `/estado` con el panel abierto:
  ```bash
  curl -o /dev/null -s -w '%{time_total}\n' http://192.168.80.201/estado
  ```
  Debe estar por debajo de 0,25 s.
- [ ] Tiempo de reelección al desenchufar el líder: ______ s.
