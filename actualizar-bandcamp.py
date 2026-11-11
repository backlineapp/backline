#!/usr/bin/env python3
"""Actualiza la discografía y portada de los grupos de Backline desde Bandcamp.

Para cada grupo que tenga enlace de Bandcamp en grupos.json, visita su página
de música (/music) y extrae los discos, singles y EPs con su título, año,
enlace y portada. Si hay cambios respecto a lo que ya tiene, actualiza
grupos.json.

Uso:
  python3 actualizar-bandcamp.py           # actualiza todos
  python3 actualizar-bandcamp.py --solo 5  # solo los 5 primeros (para probar)
  python3 actualizar-bandcamp.py --seco    # muestra cambios sin escribir

Pensado para ejecutarse como GitHub Action semanal o a mano cuando se quiera.
"""

import json
import re
import sys
import time
import urllib.request
import urllib.error
import html as h
from pathlib import Path

ARCHIVO = Path(__file__).parent / 'grupos.json'
ESPERA = 1.5  # segundos entre peticiones para no saturar Bandcamp


def bandcamp_url(grupo):
    """Devuelve la URL base de Bandcamp del grupo, o None."""
    bc = grupo.get('bandcamp', '')
    if not bc:
        return None
    # Normalizar: quitar barra final
    return bc.rstrip('/')


def sacar_discos(html_texto, url_base):
    """Extrae la lista de discos de la página /music de Bandcamp.

    Cada disco: { titulo, anio, tipo, enlace, portada }.
    """
    discos = []

    # Bandcamp usa data-initial-values con JSON en el bloque de música,
    # pero es más fiable parsear el HTML de la lista de álbumes.
    # Los álbumes están en <li class="music-grid-item ...">
    patron_item = re.compile(
        r'<li[^>]*class="[^"]*music-grid-item[^"]*"[^>]*>(.*?)</li>',
        re.DOTALL
    )
    patron_enlace = re.compile(r'<a[^>]*href="([^"]*)"')
    patron_titulo = re.compile(r'<p[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)</p>', re.DOTALL)
    patron_img = re.compile(r'<img[^>]*(?:src|data-original)="([^"]*)"')
    patron_anio = re.compile(r'\b((?:19|20)\d{2})\b')

    for m in patron_item.finditer(html_texto):
        bloque = m.group(1)

        # Enlace
        me = patron_enlace.search(bloque)
        if not me:
            continue
        enlace = me.group(1).strip()
        if enlace.startswith('/'):
            enlace = url_base + enlace

        # Título: el texto antes del <br> (después viene el nombre del artista).
        mt = patron_titulo.search(bloque)
        if not mt:
            continue
        titulo_raw = mt.group(1)
        # Cortar en el <br> (lo de después es el nombre del artista).
        titulo_raw = re.split(r'<br\s*/?\s*>', titulo_raw)[0]
        # Quitar cualquier etiqueta HTML restante y limpiar.
        titulo = re.sub(r'<[^>]+>', ' ', titulo_raw)
        titulo = h.unescape(titulo).strip()
        titulo = re.sub(r'\s+', ' ', titulo)
        if not titulo:
            continue

        # Portada
        mi = patron_img.search(bloque)
        portada = ''
        if mi:
            portada = mi.group(1).strip()
            # Bandcamp usa _16.jpg para la grande; asegurarnos
            portada = re.sub(r'_\d+\.', '_16.', portada)

        # Año (del enlace o del bloque)
        ma = patron_anio.search(bloque)
        anio = ma.group(1) if ma else ''

        # Tipo: single si dice "single" o "track", EP si dice "ep"
        enlace_lower = enlace.lower()
        if '/track/' in enlace_lower:
            tipo = 'single'
        else:
            tipo = 'disco'

        discos.append({
            'titulo': titulo,
            'anio': anio,
            'tipo': tipo,
            'enlace': enlace,
            'portada': portada
        })

    return discos


def obtener_pagina(url):
    """Descarga una página como texto. Devuelve None si falla."""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Backline-Bot/1.0 (https://backlineapp.github.io/backline/)'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode('utf-8', errors='replace')
    except (urllib.error.URLError, OSError) as e:
        print(f'  ⚠ Error al descargar {url}: {e}')
        return None


def portada_principal(discos):
    """Devuelve la portada del disco más reciente (el primero de la lista)."""
    for d in discos:
        if d.get('portada'):
            return d['portada']
    return ''


def discos_iguales(a, b):
    """Compara dos listas de discos por título y enlace (ignora portada temporal)."""
    def clave(d):
        return (d.get('titulo', ''), d.get('enlace', ''))
    return [clave(d) for d in a] == [clave(d) for d in b]


def texto_discografia(discos):
    """Genera el texto de discografía: 'Título (Año), Título (Año), ...'"""
    partes = []
    for d in discos:
        if d.get('anio'):
            partes.append(f"{d['titulo']} ({d['anio']})")
        else:
            partes.append(d['titulo'])
    return ', '.join(partes)


def main():
    solo = None
    seco = False
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == '--solo' and i + 1 < len(args):
            solo = int(args[i + 1])
            i += 2
        elif args[i] == '--seco':
            seco = True
            i += 1
        else:
            i += 1

    with open(ARCHIVO, encoding='utf-8') as f:
        data = json.load(f)

    grupos = data['grupos']
    actualizados = 0
    errores = 0
    saltados = 0

    procesados = 0
    for g in grupos:
        url_base = bandcamp_url(g)
        if not url_base:
            saltados += 1
            continue

        if solo and procesados >= solo:
            break

        procesados += 1
        nombre = g['nombre']
        url_music = url_base + '/music'
        print(f'[{procesados}] {nombre} — {url_music}')

        html_texto = obtener_pagina(url_music)
        if not html_texto:
            # Intentar la página principal (algunos no tienen /music)
            html_texto = obtener_pagina(url_base)
            if not html_texto:
                errores += 1
                continue

        discos = sacar_discos(html_texto, url_base)

        if not discos:
            print(f'  → No se encontraron discos (puede que la página no tenga lista).')
            continue

        # ¿Hay cambios?
        discos_viejos = g.get('discos', [])
        if discos_iguales(discos_viejos, discos):
            print(f'  → Sin cambios ({len(discos)} discos).')
            continue

        # Actualizar
        print(f'  → Actualizado: {len(discos_viejos)} → {len(discos)} discos.')
        nuevos = set(d['titulo'] for d in discos) - set(d['titulo'] for d in discos_viejos)
        if nuevos:
            print(f'    Nuevos: {", ".join(nuevos)}')

        g['discos'] = discos
        g['discografia'] = texto_discografia(discos)
        nueva_portada = portada_principal(discos)
        if nueva_portada:
            g['portada'] = nueva_portada

        actualizados += 1
        time.sleep(ESPERA)

    print(f'\nResumen: {procesados} consultados, {actualizados} actualizados, '
          f'{errores} errores, {saltados} sin Bandcamp.')

    if actualizados and not seco:
        with open(ARCHIVO, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'grupos.json actualizado.')
    elif seco and actualizados:
        print('(modo seco: no se ha escrito nada)')


if __name__ == '__main__':
    main()
