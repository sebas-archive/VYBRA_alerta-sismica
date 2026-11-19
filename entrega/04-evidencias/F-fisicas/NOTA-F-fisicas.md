# Procedencia de la evidencia `F-fisicas`

Capturas **reales** del panel y de la vista pública durante la **campaña física del 2026-11-17**:

- `cap-FIS-00-*`: P0 (preparación de campaña), panel y vista pública con el clúster físico conectado.
- `cap-FIS-01-*`: T1 (evento con pulsador), panel antes y después de la pulsación.
  T1 **no fue aprobada**: el pulsador registró dos eventos cortos (301 ms y 174 ms, separados 3,2 s)
  en lugar de uno de ~900 ms; el sistema replicó y confirmó correctamente y no emitió alerta (un solo
  detector). Diagnóstico en `entrega/10-informes-fase3/diagnostico-pulsador.md`.

Se conservan **intactas** (no regenerables sin hardware) y sus identificadores están saneados.
Los datos crudos de la campaña están en `05-pruebas/datos/FIS-*` y `05-pruebas/logs/FIS-*`.

## Fotografías del montaje

Tres fotografías reales del **montaje del prototipo** (ESP32 DevKit V1 + protoboard + pulsador),
proporcionadas por el autor de la campaña y recibidas el **2026-11-18**; corresponden al día del
montaje. Son **imágenes no regenerables sin hardware**.

| Archivo | Qué muestra |
|---|---|
| `fot-FIS-03-prototipo-montado-a.png` | Vista general (900×1600): ESP32 DevKit V1 montado sobre protoboard blanca, pulsador táctil conectado con dos cables dupont y sostenido con la mano; al fondo, el PC con el monitor serie abierto y otra placa/protoboard. |
| `fot-FIS-03-prototipo-montado-b.png` | Detalle del ESP32 (1200×1600): módulo ESP32-WROOM-32, conector micro-USB, botones EN/BOOT y serigrafía de pines, insertado en la protoboard; se ven los dos cables que salen de sus pines inferiores hacia el pulsador. |
| `fot-FIS-03-prototipo-montado-c.png` | Detalle del pulsador (1200×1600): pulsador táctil de 4 patas tipo B3F-4055 sobre la protoboard, patas y puentes visibles, con los dos cables dupond que lo conectan; el ESP32 asoma por el borde izquierdo. |

Alcance: estas fotos acreditan el **montaje físico** (placa, protoboard, pulsador y cableado), no la
operación del firmware, la identidad `SIS-Dn` ni los estados del LED. Por eso **FIS-04 (los tres
prototipos encendidos) y FIS-05 (estados del LED) siguen PENDIENTES**, igual que FIS-06 en adelante.
