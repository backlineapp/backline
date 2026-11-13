#!/usr/bin/env python3
"""Genera una pagina estatica por grupo (grupo/{id}/index.html) con meta tags
Open Graph para que al compartir un enlace de un grupo en WhatsApp, Telegram,
etc. se vea su nombre, portada y descripcion.

Cada pagina redirige automaticamente a la SPA (#/grupo/{id}).

Uso: python3 generar-grupo-paginas.py
Leer grupos.json del directorio actual y escribir en grupo/.
"""

import json
import os
import html as h

PLANTILLA = '''<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{nombre} · Backline</title>
  <meta name="description" content="{descripcion}">
  <meta name="theme-color" content="#0B0E13">
  <meta property="og:title" content="{nombre} · Backline">
  <meta property="og:description" content="{descripcion}">
  <meta property="og:image" content="{imagen}">
  <meta property="og:url" content="https://backlineapp.github.io/backline/grupo/{id_url}">
  <meta property="og:type" content="music.musician">
  <meta property="og:site_name" content="Backline">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="../icono.svg" type="image/svg+xml">
  <meta http-equiv="refresh" content="0;url=https://backlineapp.github.io/backline/#/grupo/{id_url}">
  <style>
    body {{ background: #0B0E13; color: #EAEEF4; font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; text-align: center; }}
    a {{ color: #4FC4D6; }}
  </style>
</head>
<body>
  <p>Abriendo {nombre} en Backline&hellip; <a href="https://backlineapp.github.io/backline/#/grupo/{id_url}">Ir ahora</a></p>
</body>
</html>'''

ICONO = 'https://backlineapp.github.io/backline/icono-512.png'


def main():
    with open('grupos.json', encoding='utf-8') as f:
        data = json.load(f)

    count = 0
    for g in data['grupos']:
        gid = g['id']
        nombre = h.escape(g.get('nombre', gid))
        estilos = h.escape(g.get('estilos', ''))
        ciudad = h.escape(g.get('ciudad', ''))
        portada = g.get('portada', '')

        partes = [p for p in [estilos, ciudad] if p]
        sufijo = ' (' + ' · '.join(partes) + ')' if partes else ''
        descripcion = h.escape(
            nombre + sufijo +
            ' en Backline, el backstage de tus grupos favoritos.')

        imagen = portada if portada else ICONO

        carpeta = os.path.join('grupo', gid)
        os.makedirs(carpeta, exist_ok=True)

        with open(os.path.join(carpeta, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(PLANTILLA.format(
                nombre=nombre,
                descripcion=descripcion,
                imagen=imagen,
                id_url=gid))
        count += 1

    print(f'Generadas {count} paginas en grupo/')


if __name__ == '__main__':
    main()
