#!/usr/bin/env python3
"""Comprobaciones y avisos de la revisión diaria de Bandcamp.

Lo usa la GitHub Action "Actualizar discos desde Bandcamp", que ya no pide
aceptar nada: guarda los cambios directamente. Por eso este script hace dos
cosas:

1) comprobar ANTES DESPUES
   Compara grupos.json antes y después de leer Bandcamp. Si algo no cuadra
   (falta un grupo, desaparece un disco, cambia algo que no sea discos o
   portada, o el archivo está dañado), termina con error y NO se guarda nada.
   GitHub manda entonces un correo avisando del fallo.

2) publicar LISTA
   LISTA es el archivo que escribe actualizar-bandcamp.py con los discos
   nuevos. Cada disco salido en los últimos 14 días se publica en Supabase
   como si lo hubiera publicado el grupo desde "Mi panel". Así sale el aviso
   al móvil por el camino de siempre (10 minutos después, nunca de noche y
   como mucho uno por grupo al día). Si el grupo ya lo había publicado (mismo
   enlace o mismo título), no se publica otra vez.

   Necesita la clave secreta de Supabase en la variable SUPABASE_SECRET_KEY
   (un "secreto" de GitHub, nunca en el repositorio). Sin ella, no publica
   nada y solo lo dice.

Uso a mano (para probar):
  python3 discos-nuevos.py comprobar viejo.json grupos.json
  python3 discos-nuevos.py publicar nuevos.json --seco
"""

import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

URL_SUPABASE = os.environ.get('SUPABASE_URL', 'https://zyvrmiqqqdawskurvuvw.supabase.co')
DIAS_MAXIMO = 14  # solo avisan los discos salidos en estos últimos días
AGENTE = 'Backline-Bot/1.0 (https://backlineapp.github.io/backline/)'


# ---------------------------------------------------------------- comprobar

def clave_disco(d):
    return (d.get('enlace') or '').rstrip('/') or re.sub(r'[^a-z0-9]', '', (d.get('titulo') or '').lower())


def comprobar(antes_ruta, despues_ruta):
    problemas = []
    try:
        antes = json.load(open(antes_ruta, encoding='utf-8'))
        despues = json.load(open(despues_ruta, encoding='utf-8'))
    except (OSError, ValueError) as e:
        print(f'✗ No se puede leer grupos.json: {e}')
        return 1

    ga, gd = antes.get('grupos', []), despues.get('grupos', [])
    ids_a, ids_d = [g.get('id') for g in ga], [g.get('id') for g in gd]
    if ids_a != ids_d:
        problemas.append(f'la lista de grupos ha cambiado ({len(ids_a)} antes, {len(ids_d)} después)')
    if despues.get('total') != antes.get('total'):
        problemas.append('el total de grupos ha cambiado')
    # Fuera de "grupos" no debe cambiar nada.
    if {k: v for k, v in antes.items() if k != 'grupos'} != {k: v for k, v in despues.items() if k != 'grupos'}:
        problemas.append('han cambiado datos generales del archivo')

    for a, d in zip(ga, gd):
        if a.get('id') != d.get('id'):
            continue
        otros_a = {k: v for k, v in a.items() if k not in ('discos', 'portada')}
        otros_d = {k: v for k, v in d.items() if k not in ('discos', 'portada')}
        if otros_a != otros_d:
            problemas.append(f'{a["nombre"]}: han cambiado datos que no son discos')
        viejos = a.get('discos', [])
        nuevos = d.get('discos', [])
        # Lo que había sigue igual y al final; solo se añaden discos delante.
        if len(nuevos) < len(viejos) or (viejos and nuevos[-len(viejos):] != viejos):
            problemas.append(f'{a["nombre"]}: falta o ha cambiado algún disco que ya estaba')
        for disco in nuevos[:len(nuevos) - len(viejos)]:
            if not disco.get('titulo') or not (disco.get('enlace') or '').startswith('https://'):
                problemas.append(f'{a["nombre"]}: disco nuevo incompleto ({disco})')

    if problemas:
        print('✗ La actualización NO se guarda. Problemas encontrados:')
        for p in problemas[:30]:
            print('  -', p)
        return 1
    print('✓ Comprobación correcta: solo se han añadido discos.')
    return 0


# ---------------------------------------------------------------- publicar

def fecha_salida(enlace):
    """Fecha de salida del disco, leída de su página de Bandcamp (o None)."""
    try:
        req = urllib.request.Request(enlace, headers={'User-Agent': AGENTE})
        with urllib.request.urlopen(req, timeout=20) as r:
            html = r.read().decode('utf-8', errors='replace')
    except (urllib.error.URLError, OSError) as e:
        print(f'  ⚠ No se pudo abrir {enlace}: {e}')
        return None
    m = re.search(r'"datePublished"\s*:\s*"(\d{1,2} \w{3} \d{4})', html)
    if not m:
        m = re.search(r'release_date&quot;:&quot;(\d{1,2} \w{3} \d{4})', html)
    if not m:
        return None
    try:
        return datetime.datetime.strptime(m.group(1), '%d %b %Y').date()
    except ValueError:
        return None


def cabeceras(clave):
    c = {'apikey': clave, 'Content-Type': 'application/json'}
    # Las claves antiguas (eyJ...) van también como "Authorization".
    if not clave.startswith('sb_'):
        c['Authorization'] = 'Bearer ' + clave
    return c


def pedir(metodo, ruta, clave, cuerpo=None):
    datos = json.dumps(cuerpo).encode('utf-8') if cuerpo is not None else None
    req = urllib.request.Request(URL_SUPABASE + '/rest/v1/' + ruta, data=datos,
                                 method=metodo, headers=cabeceras(clave))
    if metodo == 'POST':
        req.add_header('Prefer', 'return=minimal')
    with urllib.request.urlopen(req, timeout=20) as r:
        texto = r.read().decode('utf-8')
        return json.loads(texto) if texto else None


def normaliza(t):
    return re.sub(r'[^a-z0-9]', '', (t or '').lower())


def publicar(lista_ruta, seco=False):
    try:
        discos = json.load(open(lista_ruta, encoding='utf-8'))
    except (OSError, ValueError):
        print('No hay discos nuevos que publicar.')
        return 0
    if not discos:
        print('No hay discos nuevos que publicar.')
        return 0

    clave = os.environ.get('SUPABASE_SECRET_KEY', '').strip()
    if not clave and not seco:
        print('⚠ Falta el secreto SUPABASE_SECRET_KEY: los discos se han guardado, '
              'pero no se publica ninguno ni sale aviso.')
        return 0

    hoy = datetime.date.today()
    fallos = 0
    for d in discos:
        print(f'- {d["grupo"]}: «{d["titulo"]}»')
        salida = fecha_salida(d['enlace'])
        time.sleep(1.5)
        if not salida:
            print('  → sin fecha de salida en Bandcamp: no se avisa.')
            continue
        dias = (hoy - salida).days
        if dias > DIAS_MAXIMO:
            print(f'  → salió el {salida} (hace {dias} días): no se avisa.')
            continue
        fila = {
            'grupo_id': d['grupo_id'],
            'tipo': 'disco',
            'titulo': d['titulo'][:200],
            'enlace': d['enlace'],
            'formato': 'single' if d.get('tipo') == 'single' else 'disco',
            'salida': salida.isoformat(),
        }
        if seco:
            print(f'  → (prueba) se publicaría: {fila}')
            continue
        try:
            ya = pedir('GET', 'publicaciones?select=titulo,enlace&tipo=eq.disco&grupo_id=eq.'
                       + urllib.parse.quote(d['grupo_id']), clave) or []
            enlace = d['enlace'].rstrip('/')
            if any((p.get('enlace') or '').rstrip('/') == enlace or normaliza(p.get('titulo')) == normaliza(d['titulo'])
                   for p in ya):
                print('  → el grupo ya lo había publicado: no se repite.')
                continue
            pedir('POST', 'publicaciones', clave, fila)
            print(f'  → publicado (salió el {salida}); el aviso sale en unos minutos.')
        except urllib.error.HTTPError as e:
            fallos += 1
            print(f'  ✗ Supabase respondió {e.code}: {e.read().decode("utf-8", "replace")[:300]}')
        except (urllib.error.URLError, OSError) as e:
            fallos += 1
            print(f'  ✗ No se pudo conectar con Supabase: {e}')

    return 1 if fallos else 0


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) >= 3 and args[0] == 'comprobar':
        sys.exit(comprobar(args[1], args[2]))
    if len(args) >= 2 and args[0] == 'publicar':
        sys.exit(publicar(args[1], seco='--seco' in args))
    print(__doc__)
    sys.exit(2)
