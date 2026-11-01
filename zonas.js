// Zonas de España para el filtro de Explorar: comunidad autónoma y provincia
// de cada grupo, sacadas del texto de su ciudad en grupos.json.
//
// Cómo se reconoce la zona de "ciudad" (sin mayúsculas ni tildes):
//  1. Si es una comunidad ("Galicia", "País Vasco"...), el grupo va en esa
//     comunidad, sin provincia concreta.
//  2. Si lleva la provincia entre paréntesis ("Algeciras (Cádiz)"), esa.
//  3. Si es una ciudad conocida ("Vigo", "Pamplona"...), su provincia.
//  4. Si el texto contiene el nombre de una provincia ("Sierra de Cádiz"), esa.
// Si no se reconoce ("España"), el grupo solo sale en "Toda España".
// Para un grupo nuevo de una ciudad que no esté aquí, basta con añadirla a CIUDADES.

(function () {
  'use strict';

  // Provincia -> comunidad. El nombre es el que se ve en el filtro.
  var PROVINCIAS = {
    'Almería': 'Andalucía', 'Cádiz': 'Andalucía', 'Córdoba': 'Andalucía', 'Granada': 'Andalucía',
    'Huelva': 'Andalucía', 'Jaén': 'Andalucía', 'Málaga': 'Andalucía', 'Sevilla': 'Andalucía',
    'Huesca': 'Aragón', 'Teruel': 'Aragón', 'Zaragoza': 'Aragón',
    'Asturias': 'Asturias',
    'Illes Balears': 'Illes Balears',
    'Las Palmas': 'Canarias', 'Santa Cruz de Tenerife': 'Canarias',
    'Cantabria': 'Cantabria',
    'Albacete': 'Castilla-La Mancha', 'Ciudad Real': 'Castilla-La Mancha', 'Cuenca': 'Castilla-La Mancha',
    'Guadalajara': 'Castilla-La Mancha', 'Toledo': 'Castilla-La Mancha',
    'Ávila': 'Castilla y León', 'Burgos': 'Castilla y León', 'León': 'Castilla y León',
    'Palencia': 'Castilla y León', 'Salamanca': 'Castilla y León', 'Segovia': 'Castilla y León',
    'Soria': 'Castilla y León', 'Valladolid': 'Castilla y León', 'Zamora': 'Castilla y León',
    'Barcelona': 'Cataluña', 'Girona': 'Cataluña', 'Lleida': 'Cataluña', 'Tarragona': 'Cataluña',
    'Alicante': 'Comunidad Valenciana', 'Castellón': 'Comunidad Valenciana', 'Valencia': 'Comunidad Valenciana',
    'Badajoz': 'Extremadura', 'Cáceres': 'Extremadura',
    'A Coruña': 'Galicia', 'Lugo': 'Galicia', 'Ourense': 'Galicia', 'Pontevedra': 'Galicia',
    'Madrid': 'Madrid',
    'Murcia': 'Murcia',
    'Navarra': 'Navarra',
    'Álava': 'País Vasco', 'Bizkaia': 'País Vasco', 'Gipuzkoa': 'País Vasco',
    'La Rioja': 'La Rioja',
    'Ceuta': 'Ceuta', 'Melilla': 'Melilla'
  };

  // Otras formas de escribir una provincia o comunidad.
  var OTROS_NOMBRES = {
    'vizcaya': 'Bizkaia', 'guipuzcoa': 'Gipuzkoa', 'araba': 'Álava', 'la coruna': 'A Coruña',
    'coruna': 'A Coruña', 'baleares': 'Illes Balears', 'islas baleares': 'Illes Balears',
    'mallorca': 'Illes Balears', 'menorca': 'Illes Balears', 'ibiza': 'Illes Balears', 'eivissa': 'Illes Balears',
    'gran canaria': 'Las Palmas', 'lanzarote': 'Las Palmas', 'fuerteventura': 'Las Palmas',
    'tenerife': 'Santa Cruz de Tenerife', 'la palma': 'Santa Cruz de Tenerife',
    'gerona': 'Girona', 'lerida': 'Lleida', 'orense': 'Ourense', 'castello': 'Castellón',
    'castellon de la plana': 'Castellón', 'alacant': 'Alicante', 'nafarroa': 'Navarra',
    'comunidad de madrid': 'Madrid', 'region de murcia': 'Murcia', 'principado de asturias': 'Asturias'
  };

  // Comunidades escritas tal cual en "ciudad" (sin provincia concreta).
  var COMUNIDADES = {
    'andalucia': 'Andalucía', 'aragon': 'Aragón', 'canarias': 'Canarias', 'islas canarias': 'Canarias',
    'castilla-la mancha': 'Castilla-La Mancha', 'castilla la mancha': 'Castilla-La Mancha',
    'castilla y leon': 'Castilla y León', 'cataluna': 'Cataluña', 'catalunya': 'Cataluña',
    'comunidad valenciana': 'Comunidad Valenciana', 'pais valenciano': 'Comunidad Valenciana',
    'extremadura': 'Extremadura', 'galicia': 'Galicia', 'pais vasco': 'País Vasco', 'euskadi': 'País Vasco',
    'euskal herria': 'País Vasco'
  };

  // Ciudades y comarcas -> provincia.
  var CIUDADES = {
    'pamplona': 'Navarra', 'iruna': 'Navarra', 'tudela': 'Navarra', 'estella': 'Navarra',
    'vigo': 'Pontevedra', 'santiago de compostela': 'A Coruña', 'ferrol': 'A Coruña',
    'bilbao': 'Bizkaia', 'getxo': 'Bizkaia', 'barakaldo': 'Bizkaia', 'durango': 'Bizkaia',
    'vitoria': 'Álava', 'vitoria-gasteiz': 'Álava', 'gasteiz': 'Álava',
    'san sebastian': 'Gipuzkoa', 'donostia': 'Gipuzkoa', 'donostia-san sebastian': 'Gipuzkoa',
    'irun': 'Gipuzkoa', 'zarautz': 'Gipuzkoa', 'azkoitia': 'Gipuzkoa', 'urretxu': 'Gipuzkoa', 'zestoa': 'Gipuzkoa',
    'santander': 'Cantabria', 'torrelavega': 'Cantabria',
    'oviedo': 'Asturias', 'gijon': 'Asturias', 'aviles': 'Asturias',
    'jerez': 'Cádiz', 'jerez de la frontera': 'Cádiz', 'algeciras': 'Cádiz', 'sanlucar de barrameda': 'Cádiz',
    'antequera': 'Málaga', 'marbella': 'Málaga', 'los palacios': 'Sevilla', 'dos hermanas': 'Sevilla',
    'mancha real': 'Jaén', 'linares': 'Jaén', 'ubeda': 'Jaén',
    'xativa': 'Valencia', 'gandia': 'Valencia', 'denia': 'Alicante', 'elche': 'Alicante', 'benidorm': 'Alicante',
    'rojales': 'Alicante', 'benicarlo': 'Castellón',
    'terrassa': 'Barcelona', 'sabadell': 'Barcelona', 'badalona': 'Barcelona', 'manresa': 'Barcelona',
    'mataro': 'Barcelona', 'hospitalet': 'Barcelona', "l'hospitalet de llobregat": 'Barcelona',
    'roda de ter': 'Barcelona', 'la floresta': 'Barcelona', 'polinya': 'Barcelona', 'vic': 'Barcelona',
    'reus': 'Tarragona', 'banyoles': 'Girona', 'figueres': 'Girona', 'calonge': 'Girona',
    'mostoles': 'Madrid', 'alcala de henares': 'Madrid', 'getafe': 'Madrid', 'leganes': 'Madrid',
    'fuenlabrada': 'Madrid', 'alcorcon': 'Madrid', 'humanes de madrid': 'Madrid',
    'talavera de la reina': 'Toledo', 'argamasilla de alba': 'Ciudad Real', 'alcazar de san juan': 'Ciudad Real',
    'puertollano': 'Ciudad Real', 'el bierzo': 'León', 'ponferrada': 'León',
    'palma': 'Illes Balears', 'palma de mallorca': 'Illes Balears',
    'cartagena': 'Murcia', 'lorca': 'Murcia', 'merida': 'Badajoz', 'logrono': 'La Rioja'
  };

  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // Índice de nombres normalizados -> provincia.
  var NOMBRES = {};
  Object.keys(PROVINCIAS).forEach(function (p) { NOMBRES[normalizar(p)] = p; });
  Object.keys(OTROS_NOMBRES).forEach(function (k) { NOMBRES[k] = OTROS_NOMBRES[k]; });
  // Para buscar dentro del texto: los nombres más largos primero
  // ("ciudad real" antes que "real"...).
  var BUSCABLES = Object.keys(NOMBRES).sort(function (a, b) { return b.length - a.length; });

  function deProvincia(provincia) {
    return provincia ? { comunidad: PROVINCIAS[provincia], provincia: provincia } : null;
  }

  // Lo que se reconoce en un trozo de texto: comunidad, provincia o ciudad.
  function reconocer(texto) {
    if (!texto) return null;
    if (COMUNIDADES[texto]) return { comunidad: COMUNIDADES[texto], provincia: null };
    if (NOMBRES[texto]) return deProvincia(NOMBRES[texto]);
    if (CIUDADES[texto]) return deProvincia(CIUDADES[texto]);
    return null;
  }

  // { comunidad, provincia } de un texto de ciudad, o null si no se reconoce.
  // provincia es null cuando solo se sabe la comunidad.
  function zonaDe(ciudad) {
    var texto = normalizar(ciudad);
    if (!texto) return null;
    var m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(texto);
    var antes = m ? m[1] : texto;
    var dentro = m ? m[2] : '';
    var zona = reconocer(dentro) || reconocer(antes) || reconocer(texto);
    if (zona) return zona;
    // Último intento: un nombre de provincia dentro del texto, como palabra entera.
    for (var i = 0; i < BUSCABLES.length; i++) {
      var nombre = BUSCABLES[i];
      var pos = antes.indexOf(nombre);
      if (pos === -1) continue;
      var antesOk = pos === 0 || /[\s,\/-]/.test(antes[pos - 1]);
      var fin = pos + nombre.length;
      var despuesOk = fin === antes.length || /[\s,\/-]/.test(antes[fin]);
      if (antesOk && despuesOk) return deProvincia(NOMBRES[nombre]);
    }
    return null;
  }

  // ¿Cuántas provincias tiene una comunidad? (para no repetir "Navarra · Navarra")
  function provinciasDe(comunidad) {
    return Object.keys(PROVINCIAS).filter(function (p) { return PROVINCIAS[p] === comunidad; });
  }

  window.Zonas = { zonaDe: zonaDe, provinciasDe: provinciasDe, normalizar: normalizar };
})();
