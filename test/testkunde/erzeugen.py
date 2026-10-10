#!/usr/bin/env python3
"""Testkunde für die Ende-zu-Ende-Tests = Musterfirma „Beispiel Haustechnik GmbH“ (test/musterfirmen/).
Aufruf: python3 test/testkunde/erzeugen.py && npm run paket -- test/testkunde"""
import os, sys
HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, '..', 'musterfirmen'))
from bauen import bauen
from firmen.haustechnik import F
bauen(F, HIER)
print('Testkunde erzeugt:', os.path.join(HIER, 'quellen'))
