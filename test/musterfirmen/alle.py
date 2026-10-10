#!/usr/bin/env python3
"""Baut alle sechs Musterfirmen (E-A41) nach test/musterfirmen/<slug>/ und – mit --paket – je ein Paket als ZIP
nach test/musterfirmen/zip/ (zum Import im Backoffice, dort als Vorlage markieren).
Aufruf: python3 test/musterfirmen/alle.py --paket"""
import os, sys, subprocess, shutil, importlib
HIER = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HIER)
from bauen import bauen
FIRMEN = ['haustechnik', 'metall', 'reinigung', 'zeitarbeit', 'it', 'handel']
WURZEL = os.path.abspath(os.path.join(HIER, '..', '..'))
os.makedirs(os.path.join(HIER, 'zip'), exist_ok=True)
for slug in FIRMEN:
    F = importlib.import_module('firmen.' + slug).F
    ziel = os.path.join(HIER, slug)
    s = bauen(F, ziel)
    print('%-12s Handbuch %d Seiten, Nachweise %d, Auftrag %d' % (slug, len(s['uph']), len(s['nachweise']), len(s['auftrag'])))
    if '--paket' in sys.argv:
        subprocess.run(['node', 'scripts/paket_bauen.mjs', os.path.relpath(ziel, WURZEL)], cwd=WURZEL, check=True, stdout=subprocess.DEVNULL)
        z = os.path.join(HIER, 'zip', 'Musterfirma_' + slug)
        shutil.make_archive(z, 'zip', os.path.join(ziel, 'netlify'))
