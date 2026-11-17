#!/usr/bin/env python3
"""Reinicia una placa ESP32 por software (RTS=EN, DTR=IO0) y captura su arranque.
No escribe flash: solo conmuta líneas de control y lee el puerto serie.

Uso: reset_read.py /dev/ttyUSB0 [segundos]
"""
import sys, os, time, termios, fcntl, struct

PORT = sys.argv[1]
SECS = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0
BAUD = termios.B115200

TIOCM_DTR = 0x002
TIOCM_RTS = 0x004


def mod_bit(fd, bit, on):
    op = termios.TIOCMBIS if on else termios.TIOCMBIC
    fcntl.ioctl(fd, op, struct.pack("I", bit))


fd = os.open(PORT, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
try:
    # modo crudo
    attrs = termios.tcgetattr(fd)
    iflag, oflag, cflag, lflag = attrs[0], attrs[1], attrs[2], attrs[3]
    iflag &= ~(termios.IGNBRK | termios.BRKINT | termios.PARMRK | termios.ISTRIP |
               termios.INLCR | termios.IGNCR | termios.ICRNL | termios.IXON | termios.IXOFF)
    oflag &= ~termios.OPOST
    lflag &= ~(termios.ECHO | termios.ECHONL | termios.ICANON | termios.ISIG | termios.IEXTEN)
    cflag &= ~(termios.CSIZE | termios.PARENB | termios.CSTOPB)
    cflag |= termios.CS8 | termios.CREAD | termios.CLOCAL
    attrs[0], attrs[1], attrs[2], attrs[3] = iflag, oflag, cflag, lflag
    attrs[4] = BAUD  # velocidad de entrada
    attrs[5] = BAUD  # velocidad de salida
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    termios.tcflush(fd, termios.TCIFLUSH)

    # Secuencia de reset normal: IO0 alto (DTR off) y pulso en EN (RTS on -> off)
    mod_bit(fd, TIOCM_DTR, False)   # IO0 = alto -> arranque normal (no bootloader)
    mod_bit(fd, TIOCM_RTS, True)    # EN = bajo -> en reset
    time.sleep(0.15)
    mod_bit(fd, TIOCM_RTS, False)   # EN = alto -> arranca
    time.sleep(0.05)

    fin = time.time() + SECS
    buf = b""
    while time.time() < fin:
        try:
            chunk = os.read(fd, 4096)
            if chunk:
                buf += chunk
        except BlockingIOError:
            time.sleep(0.02)
        except OSError:
            break
    sys.stdout.buffer.write(buf)
    sys.stdout.buffer.flush()
finally:
    mod_bit(fd, TIOCM_RTS, False)
    mod_bit(fd, TIOCM_DTR, False)
    os.close(fd)
