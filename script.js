// ----------------------
// UTILIDADES
// ----------------------
const $ = id => document.getElementById(id);
const formatPct = x => (100 * (isFinite(x) ? x : 0)).toFixed(1) + '%';
const formatDec = x => (isFinite(x) ? x.toFixed(2) : '0.00');
const parseNumberString = val => {
  const s = String(val || '').replace(/,/g, '.');
  const n = Number(s);
  return isFinite(n) ? n : 0;
};

// Caché para factorial (mejora eficiencia)
const factorialCache = [1, 1];
function factorial(n) {
  if (n < 0) return 0;
  if (factorialCache[n] !== undefined) return factorialCache[n];
  factorialCache[n] = n * factorial(n - 1);
  return factorialCache[n];
}
function poissonProb(lambda, k) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}
function dixonColesAdjustment(lambdaH, lambdaA, h, a, tau = 0.9) {
  if (h === 0 && a === 0) return tau * poissonProb(lambdaH, 0) * poissonProb(lambdaA, 0);
  if (h === 0 && a === 1) return tau * poissonProb(lambdaH, 0) * poissonProb(lambdaA, 1);
  if (h === 1 && a === 0) return tau * poissonProb(lambdaH, 1) * poissonProb(lambdaA, 0);
  if (h === 1 && a === 1) return tau * poissonProb(lambdaH, 1) * poissonProb(lambdaA, 1);
  return poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
}

// ----------------------
// CONFIGURACIÓN DE LIGAS
// ----------------------
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwVurxjaupDg88KrwZon1QbmMjwLLawtoIAFnPfOkDs4GUgtgsrI7AITC72SX4bWoEl/exec";
let teamsByLeague = {};
let __rawApiData = null; // guardamos la última respuesta para re-render si hace falta

const leagueNames = {
  "esp.1": "LaLiga España",
  "esp.2": "Segunda España",
  "eng.1": "Premier League Inglaterra",
  "eng.2": "Championship Inglaterra",
  "ita.1": "Serie A Italia",
  "ger.1": "Bundesliga Alemania",
  "fra.1": "Ligue 1 Francia",
  "ned.1": "Eredivisie Países Bajos",
  "ned.2": "Eerste Divisie Países Bajos",
  "por.1": "Liga Portugal",
  "mex.1": "Liga MX México",
  "usa.1": "MLS Estados Unidos",
  "bra.1": "Brasileirão Brasil",
  "gua.1": "Liga Nacional Guatemala",
  "crc.1": "Liga Promerica Costa Rica",
  "hon.1": "Liga Nacional Honduras",
  "ksa.1": "Pro League Arabia Saudita"
};

// ----------------------
// NORMALIZACIÓN DE DATOS
// ----------------------
function normalizeTeam(raw) {
  if (!raw) return null;
  const r = {};
  r.name = raw.name || '';
  if (!r.name) return null;

  r.pos   = parseNumberString(raw.rank || 0);
  r.gf    = parseNumberString(raw.goalsFor || 0);
  r.ga    = parseNumberString(raw.goalsAgainst || 0);
  r.pj    = parseNumberString(raw.gamesPlayed || 0);
  r.g     = parseNumberString(raw.wins || 0);
  r.e     = parseNumberString(raw.ties || 0);
  r.p     = parseNumberString(raw.losses || 0);
  r.points= parseNumberString(raw.points || (r.g * 3 + r.e) || 0);

  r.gfHome   = parseNumberString(raw.goalsForHome || 0);
  r.gfAway   = parseNumberString(raw.goalsForAway || 0);
  r.gaHome   = parseNumberString(raw.goalsAgainstHome || 0);
  r.gaAway   = parseNumberString(raw.goalsAgainstAway || 0);
  r.pjHome   = parseNumberString(raw.gamesPlayedHome || 0);
  r.pjAway   = parseNumberString(raw.gamesPlayedAway || 0);
  r.winsHome = parseNumberString(raw.winsHome || 0);
  r.winsAway = parseNumberString(raw.winsAway || 0);
  r.logoUrl  = raw.logoUrl || '';

  return r;
}

// ----------------------
// PARTIDOS DE HOY (Calendario_Futbol -> HTML)
// ----------------------
function toTodayStrings() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return {
    ddmmyyyy: `${dd}/${mm}/${yyyy}`,
    yyyymmdd: `${yyyy}-${mm}-${dd}`,
    mmddyyyy: `${mm}/${dd}/${yyyy}`
  };
}
function parseHourToMinutes(hhmm) {
  if (!hhmm) return Number.MAX_SAFE_INTEGER;
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h * 60 + min;
}
function safeField(obj, keys, def = '') {
  for (const k of keys) {
    if (obj && obj[k] != null) return String(obj[k]).trim();
  }
  return def;
}
function getCalendarArray(data) {
  // Intentamos detectar el arreglo del calendario bajo distintos nombres
  if (Array.isArray(data?.Calendario_Futbol)) return data.Calendario_Futbol;
  if (Array.isArray(data?.calendario_futbol)) return data.calendario_futbol;
  if (Array.isArray(data?.calendarioFutbol))  return data.calendarioFutbol;
  if (Array.isArray(data?.calendario))        return data.calendario;
  if (Array.isArray(data?.partidos))          return data.partidos;
  return [];
}

function displayTodayMatches(data) {
  const matchesList = $('matchesList');
  if (!matchesList) {
    console.error('Elemento #matchesList no encontrado en el HTML');
    const det = $('details');
    if (det) det.innerHTML = '<div class="error"><strong>Error:</strong> Elemento #matchesList no encontrado en el HTML.</div>';
    return;
  }

  console.log('Datos recibidos en displayTodayMatches:', data);

  // 1) Si el servidor ya trae "partidosFuturos" y no está vacío, lo mostramos tal cual
  if (Array.isArray(data?.partidosFuturos) && data.partidosFuturos.length > 0) {
    console.log('Usando data.partidosFuturos: ', data.partidosFuturos.length, ' partidos.');
    const matchesHtml = data.partidosFuturos.map(match => {
      const hora = safeField(match, ['hora', 'Hora', 'time'], '');
      const local = safeField(match, ['local', 'Local', 'home', 'homeTeam'], '—');
      const visitante = safeField(match, ['visitante', 'Visitante', 'away', 'awayTeam'], '—');
      const liga = safeField(match, ['liga', 'Liga', 'league'], '');
      const estadio = safeField(match, ['estadio', 'Estadio', 'venue'], '');

      console.log(`Renderizando partido (partidosFuturos): ${hora} - ${local} vs ${visitante} (${liga}) en ${estadio}`);
      return `
        <div class="match-item">
          <span class="match-time">${hora || '—:—'}</span>
          <span class="match-teams">${local} vs ${visitante}</span>
          <span class="match-league">${liga ? `(${liga})` : ''}</span>
          <span class="match-venue">${estadio}</span>
        </div>
      `;
    }).join('');
    matchesList.innerHTML = matchesHtml;
    return;
  }

  // 2) Fallback: usamos la hoja Calendario_Futbol (o variantes) y mostramos TODO lo de HOY
  const today = toTodayStrings();
  const calendar = getCalendarArray(data);
  console.log('Intentando con Calendario_Futbol. Total filas calendario:', calendar.length);

  const isTodayRow = (fecha) => {
    const f = (fecha || '').toString().trim().replace(/\./g, '/');
    return f === today.ddmmyyyy || f === today.yyyymmdd || f === today.mmddyyyy;
  };

  const todayMatches = calendar
    .filter(row => isTodayRow(safeField(row, ['fecha', 'Fecha', 'date', 'Date'])))
    .map(row => {
      return {
        hora:       safeField(row, ['hora', 'Hora', 'time']),
        local:      safeField(row, ['local', 'Local', 'home', 'homeTeam']),
        visitante:  safeField(row, ['visitante', 'Visitante', 'away', 'awayTeam]()
