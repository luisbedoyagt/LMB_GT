// ----------------------
// UTILIDADES MEJORADAS
// ----------------------
const $ = id => document.getElementById(id);
const formatPct = x => (100 * (isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)).toFixed(1) + '%';
const formatDec = x => (isFinite(x) ? x.toFixed(2) : '0.00');
const parseNumberString = val => {
  const s = String(val || '').replace(/,/g, '.');
  const n = Number(s);
  return isFinite(n) && n >= 0 ? n : 0;
};

// Cache para factorial usando Map
const factorialMemo = new Map([[0, 1], [1, 1]]);
function factorial(n) {
  if (n < 0) return 0;
  if (factorialMemo.has(n)) return factorialMemo.get(n);
  const result = n * factorial(n - 1);
  factorialMemo.set(n, result);
  return result;
}

function poissonProb(lambda, k) {
  if (lambda <= 0 || k < 0) return 0;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

// Dixon-Coles con rho dinámico
function dixonColesAdjustment(lambdaH, lambdaA, h, a) {
  const avgLambda = (lambdaH + lambdaA) / 2;
  const rho = -0.13 * Math.min(lambdaH, lambdaA) / Math.max(avgLambda, 0.1);
  
  if (h <= 1 && a <= 1) {
    const adjustments = {
      '0-0': 1 - lambdaH * lambdaA * rho,
      '0-1': 1 + lambdaH * rho,
      '1-0': 1 + lambdaA * rho,
      '1-1': 1 - rho
    };
    const factor = adjustments[`${h}-${a}`] || 1;
    return Math.max(0, factor * poissonProb(lambdaH, h) * poissonProb(lambdaA, a));
  }
  
  return poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
}

// ----------------------
// CONFIGURACIÓN
// ----------------------
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwhxSccznUNIZFSfNKygHE--qPK4vn6KtxW5iyYrj0BmM_efw18_IWAUEcwNBzlFqBhcA/exec";
let teamsByLeague = {};
let calendarData = {};

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
// NORMALIZACIÓN
// ----------------------
function normalizeTeam(raw) {
  if (!raw || !raw.name) return null;
  const r = {};
  r.name = raw.name.trim();
  r.pos = parseNumberString(raw.rank || 0);
  r.gf = parseNumberString(raw.goalsFor || 0);
  r.ga = parseNumberString(raw.goalsAgainst || 0);
  r.pj = parseNumberString(raw.gamesPlayed || 0);
  r.g = parseNumberString(raw.wins || 0);
  r.e = parseNumberString(raw.ties || 0);
  r.p = parseNumberString(raw.losses || 0);
  r.points = parseNumberString(raw.points || (r.g * 3 + r.e) || 0);
  r.gfHome = parseNumberString(raw.goalsForHome || 0);
  r.gfAway = parseNumberString(raw.goalsForAway || 0);
  r.gaHome = parseNumberString(raw.goalsAgainstHome || 0);
  r.gaAway = parseNumberString(raw.goalsAgainstAway || 0);
  r.pjHome = parseNumberString(raw.gamesPlayedHome || 0);
  r.pjAway = parseNumberString(raw.gamesPlayedAway || 0);
  r.winsHome = parseNumberString(raw.winsHome || 0);
  r.winsAway = parseNumberString(raw.winsAway || 0);
  r.logoUrl = raw.logoUrl || '';
  
  return r.name && r.pj > 0 ? r : null;
}

// ----------------------
// FETCH EQUIPOS Y CALENDARIO (mejorado con reintentos y cache)
// ----------------------
async function fetchTeams(attempt = 1, maxAttempts = 3) {
  const leagueSelect = $('leagueSelect');
  if (leagueSelect) {
    leagueSelect.innerHTML = '<option value="">Cargando ligas...</option>';
    leagueSelect.disabled = true;
  }
  const details = $('details');
  if (details) details.innerHTML = '<div class="loading">Cargando datos de ligas...</div>';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(WEBAPP_URL, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (attempt < maxAttempts) {
        console.warn(`Intento ${attempt} fallido. Reintentando...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchTeams(attempt + 1, maxAttempts);
      }
      throw new Error(`Error HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log('Datos recibidos:', data);

    const normalized = {};
    for (const key in data.ligas) {
      const teams = (data.ligas[key] || []).map(normalizeTeam).filter(t => t !== null);
      if (teams.length > 0) {
        normalized[key] = teams;
      }
    }
    teamsByLeague = normalized;

    calendarData = {
      calendario: data.calendario || {},
      partidosFuturos: data.partidosFuturos || []
    };

    localStorage.setItem('teamsByLeague', JSON.stringify(normalized));
    localStorage.setItem('calendarData', JSON.stringify(calendarData));

    if (leagueSelect) leagueSelect.disabled = false;
    return normalized;
  } catch (err) {
    console.error('Error en fetchTeams:', err);
    if (attempt < maxAttempts) {
      console.warn(`Intento ${attempt} fallido. Reintentando...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchTeams(attempt + 1, maxAttempts);
    }

    // Fallback a datos cacheados
    const cachedTeams = localStorage.getItem('teamsByLeague');
    const cachedCalendar = localStorage.getItem('calendarData');
    if (cachedTeams && cachedCalendar) {
      teamsByLeague = JSON.parse(cachedTeams);
      calendarData = JSON.parse(cachedCalendar);
      if (details) details.innerHTML = '<div class="warning">Conexión fallida. Usando datos cacheados.</div>';
      if (leagueSelect) leagueSelect.disabled = false;
      return teamsByLeague;
    }

    const errorMsg = `<div class="error"><strong>Error:</strong> No se pudieron cargar los datos de la API. Intenta de nuevo más tarde. Detalle: ${err.message}</div>`;
    if (details) details.innerHTML = errorMsg;
    if (leagueSelect) {
      leagueSelect.innerHTML = '<option value="">Error al cargar ligas</option>';
      leagueSelect.disabled = false;
    }
    return {};
  }
}

// ----------------------
// RENDERIZAR PARTIDOS (filtrado por fecha actual y orden por hora)
// ----------------------
function renderMatches() {
  const matchesList = $('matchesList');
  const noMatches = $('noMatches');
  if (!matchesList || !calendarData.partidosFuturos) {
    console.error('No se encontró matchesList o partidosFuturos no definido');
    return;
  }

  console.log('Renderizando partidos:', calendarData.partidosFuturos);
  matchesList.innerHTML = '';

  // Filtrar partidos futuros para hoy (30 de agosto de 2025, después de 10:45 AM CST)
  const now = new Date('2025-08-30T10:45:00-06:00');
  const today = now.toISOString().split('T')[0]; // 2025-08-30
  const futureMatches = calendarData.partidosFuturos.filter(match => {
    const matchDateTime = new Date(`${match.fecha}T${match.hora}-06:00`);
    return match.fecha === today && matchDateTime > now;
  });

  if (futureMatches.length === 0) {
    if (noMatches) noMatches.style.display = 'block';
    return;
  }

  if (noMatches) noMatches.style.display = 'none';

  // Ordenar por hora
  futureMatches.sort((a, b) => a.hora.localeCompare(b.hora));

  futureMatches.forEach(match => {
    const matchDiv = document.createElement('div');
    matchDiv.classList.add('match-item');
    matchDiv.innerHTML = `
      <div class="match-liga">${match.liga.replace(/_/g, ' ')}</div>
      <div class="match-teams">${match.local} vs ${match.visitante}</div>
      <div class="match-details">
        <span>Hora: ${match.hora}</span>
        <span>Estadio: ${match.estadio}</span>
      </div>
    `;
    matchesList.appendChild(matchDiv);
  });
}

// ----------------------
// INICIALIZACIÓN
// ----------------------
async function init() {
  if (!$('leagueSelect') || !$('teamHome') || !$('teamAway')) {
    console.error('Elementos DOM requeridos no encontrados');
    return;
  }

  clearTeamData('Home');
  clearTeamData('Away');
  updateCalcButton();

  teamsByLeague = await fetchTeams();
  renderMatches();

  const leagueSelect = $('leagueSelect');
  const teamHomeSelect = $('teamHome');
  const teamAwaySelect = $('teamAway');

  leagueSelect.innerHTML = '<option value="">-- Selecciona liga --</option>';
  Object.keys(teamsByLeague).sort().forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = leagueNames[code] || code;
    leagueSelect.appendChild(opt);
  });

  leagueSelect.addEventListener('change', onLeagueChange);
  teamHomeSelect.addEventListener('change', () => {
    if (restrictSameTeam()) {
      fillTeamData($('teamHome').value, $('leagueSelect').value, 'Home');
      updateCalcButton();
    }
  });
  teamAwaySelect.addEventListener('change', () => {
    if (restrictSameTeam()) {
      fillTeamData($('teamAway').value, $('leagueSelect').value, 'Away');
      updateCalcButton();
    }
  });

  $('recalc').addEventListener('click', calculateAll);
  $('reset').addEventListener('click', clearAll);
}
document.addEventListener('DOMContentLoaded', init);

// ----------------------
// FUNCIONES AUXILIARES
// ----------------------
function onLeagueChange() {
  const code = $('leagueSelect').value;
  const teamHomeSelect = $('teamHome');
  const teamAwaySelect = $('teamAway');
  teamHomeSelect.innerHTML = '<option value="">Cargando equipos...</option>';
  teamAwaySelect.innerHTML = '<option value="">Cargando equipos...</option>';

  if (!code || !teamsByLeague[code] || teamsByLeague[code].length === 0) {
    clearTeamData('Home');
    clearTeamData('Away');
    updateCalcButton();
    $('details').innerHTML = '<div class="warning"><strong>Advertencia:</strong> No hay datos disponibles para esta liga. Intenta otra liga o verifica la conexión.</div>';
    return;
  }

  const fragmentHome = document.createDocumentFragment();
  const fragmentAway = document.createDocumentFragment();
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Selecciona equipo --';
  fragmentHome.appendChild(defaultOption.cloneNode(true));
  fragmentAway.appendChild(defaultOption.cloneNode(true));

  const sortedTeams = teamsByLeague[code].slice().sort((a, b) => a.name.localeCompare(b.name));
  sortedTeams.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = t.name;
    fragmentHome.appendChild(opt.cloneNode(true));
    fragmentAway.appendChild(opt.cloneNode(true));
  });

  teamHomeSelect.innerHTML = '';
  teamAwaySelect.innerHTML = '';
  teamHomeSelect.appendChild(fragmentHome);
  teamAwaySelect.appendChild(fragmentAway);

  clearTeamData('Home');
  clearTeamData('Away');
  updateCalcButton();
}

function updateCalcButton() {
  const teamHome = $('teamHome').value;
  const teamAway = $('teamAway').value;
  const leagueCode = $('leagueSelect').value;
  $('recalc').disabled = !(leagueCode && teamHome && teamAway && teamHome !== teamAway);
}

function restrictSameTeam() {
  const teamHome = $('teamHome').value;
  const teamAway = $('teamAway').value;
  if (teamHome && teamAway && teamHome === teamAway) {
    $('details').innerHTML = '<div class="error"><strong>Error:</strong> No puedes seleccionar el mismo equipo para local y visitante.</div>';
    if (document.activeElement === $('teamHome')) {
      $('teamHome').value = '';
      clearTeamData('Home');
    } else {
      $('teamAway').value = '';
      clearTeamData('Away');
    }
    updateCalcButton();
    return false;
  }
  return true;
}

function clearTeamData(type) {
  const box = $(type === 'Home' ? 'formHomeBox' : 'formAwayBox');
  box.innerHTML = `
    <div class="stat-section" data-testid="general-${type.toLowerCase()}">
      <span class="section-title">Rendimiento General</span>
      <div class="stat-metrics">
        <span>PJ: 0</span>
        <span>Puntos: 0</span>
        <span>DG: 0</span>
      </div>
    </div>
    <div class="stat-section" data-testid="local-${type.toLowerCase()}">
      <span class="section-title">Rendimiento de Local</span>
      <div class="stat-metrics">
        <span>PJ: 0</span>
        <span>PG: 0</span>
        <span>DG: 0</span>
      </div>
    </div>
    <div class="stat-section" data-testid="visitante-${type.toLowerCase()}">
      <span class="section-title">Rendimiento de Visitante</span>
      <div class="stat-metrics">
        <span>PJ: 0</span>
        <span>PG: 0</span>
        <span>DG: 0</span>
      </div>
    </div>
    <div class="stat-legend-text">PJ: Partidos Jugados, Puntos: Puntos Totales, PG: Partidos Ganados, DG: Diferencia de Goles</div>
  `;
  if (type === 'Home') {
    $('posHome').value = '0';
    $('gfHome').value = '0';
    $('gaHome').value = '0';
    $('winRateHome').value = '0%';
    $('formHomeTeam').innerHTML = 'Local: —';
  } else {
    $('posAway').value = '0';
    $('gfAway').value = '0';
    $('gaAway').value = '0';
    $('winRateAway').value = '0%';
    $('formAwayTeam').innerHTML = 'Visitante: —';
  }
}

function clearAll() {
  document.querySelectorAll('input').forEach(i => i.value = '0');
  document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
  ['pHome','pDraw','pAway','pBTTS','pO25','details','homeAdvantageFactor','strengthFactor','dixonColesFactor','suggestion'].forEach(id => {
    const el = $(id);
    if (el) el.textContent = '—';
  });
  ['formHomeTeam','formAwayTeam'].forEach(id => $(id).innerHTML = id.includes('Home') ? 'Local: —' : 'Visitante: —');
  clearTeamData('Home');
  clearTeamData('Away');
  updateCalcButton();
}

// ----------------------
// BÚSQUEDA Y LLENADO DE EQUIPO
// ----------------------
function findTeam(leagueCode, teamName) {
  if (!teamsByLeague[leagueCode]) return null;
  return teamsByLeague[leagueCode].find(t => 
    t.name.toLowerCase().trim() === teamName.toLowerCase().trim()
  ) || null;
}

function fillTeamData(teamName, leagueCode, type) {
  const t = findTeam(leagueCode, teamName);
  if (!t) {
    console.error(`Equipo no encontrado: ${teamName} en liga ${leagueCode}`);
    $('details').innerHTML = `<div class="error"><strong>Error:</strong> Equipo ${teamName} no encontrado en la liga seleccionada.</div>`;
    return;
  }

  const pjSpecific = type === 'Home' ? t.pjHome : t.pjAway;
  const gfSpecific = type === 'Home' ? t.gfHome : t.gfAway;
  const gaSpecific = type === 'Home' ? t.gaHome : t.gaAway;
  const winsSpecific = type === 'Home' ? t.winsHome : t.winsAway;

  const lambda = pjSpecific > 0 ? gfSpecific / pjSpecific : t.gf / (t.pj || 1);
  const gaAvg = pjSpecific > 0 ? gaSpecific / pjSpecific : t.ga / (t.pj || 1);
  const dg = t.gf - t.ga;
  const dgHome = t.gfHome - t.gaHome;
  const dgAway = t.gfAway - t.gaAway;

  const box = $(type === 'Home' ? 'formHomeBox' : 'formAwayBox');
  box.innerHTML = `
    <div class="stat-section" data-testid="general-${type.toLowerCase()}">
      <span class="section-title">Rendimiento General</span>
      <div class="stat-metrics">
        <span>PJ: ${t.pj || 0}</span>
        <span>Puntos: ${t.points || 0}</span>
        <span>DG: ${dg >= 0 ? '+' + dg : dg || 0}</span>
      </div>
    </div>
    <div class="stat-section" data-testid="local-${type.toLowerCase()}">
      <span class="section-title">Rendimiento de Local</span>
      <div class="stat-metrics">
        <span>PJ: ${t.pjHome || 0}</span>
        <span>PG: ${t.winsHome || 0}</span>
        <span>DG: ${dgHome >= 0 ? '+' + dgHome : dgHome || 0}</span>
      </div>
    </div>
    <div class="stat-section" data-testid="visitante-${type.toLowerCase()}">
      <span class="section-title">Rendimiento de Visitante</span>
      <div class="stat-metrics">
        <span>PJ: ${t.pjAway || 0}</span>
        <span>PG: ${t.winsAway || 0}</span>
        <span>DG: ${dgAway >= 0 ? '+' + dgAway : dgAway || 0}</span>
      </div>
    </div>
    <div class="stat-legend-text">PJ: Partidos Jugados, Puntos: Puntos Totales, PG: Partidos Ganados, DG: Diferencia de Goles</div>
  `;

  if (type === 'Home') {
    $('posHome').value = t.pos || 0;
    $('gfHome').value = formatDec(lambda);
    $('gaHome').value = formatDec(gaAvg);
    $('winRateHome').value = formatPct(pjSpecific ? winsSpecific / pjSpecific : 0);
    $('formHomeTeam').innerHTML = t.logoUrl
      ? `<img src="${t.logoUrl}" alt="${t.name} logo" class="team-logo"> Local: ${t.name}`
      : `Local: ${t.name}`;
  } else {
    $('posAway').value = t.pos || 0;
    $('gfAway').value = formatDec(lambda);
    $('gaAway').value = formatDec(gaAvg);
    $('winRateAway').value = formatPct(pjSpecific ? winsSpecific / pjSpecific : 0);
    $('formAwayTeam').innerHTML = t.logoUrl
      ? `<img src="${t.logoUrl}" alt="${t.name} logo" class="team-logo"> Visitante: ${t.name}`
      : `Visitante: ${t.name}`;
  }
}

// ----------------------
// CÁLCULO PRINCIPAL (optimizado para América vs Pachuca)
// ----------------------
function calculateAll() {
  const teamHome = $('teamHome').value;
  const teamAway = $('teamAway').value;
  const league = $('leagueSelect').value;
  if (!teamHome || !teamAway || !league) {
    $('details').innerHTML = '<div class="error"><strong>Error:</strong> Selecciona una liga y ambos equipos.</div>';
    return;
  }

  const tH = findTeam(league, teamHome);
  const tA = findTeam(league, teamAway);
  if (!tH || !tA) {
    $('details').innerHTML = '<div class="error"><strong>Error:</strong> Equipos no encontrados.</div>';
    return;
  }

  let warning = '';
  if (tH.pj < 5 || tA.pj < 5) {
    warning = '<div class="warning"><strong>Advertencia:</strong> Al menos un equipo tiene menos de 5 partidos jugados. Las predicciones pueden ser menos precisas.</div>';
  }

  try {
    // Promedios de la liga (usando datos de América y Pachuca como base)
    const avgGh = 1.65; // Promedio de goles locales (estimado Liga MX)
    const avgGa = 1.60; // Promedio de goles visitantes
    const homeAdvantage = 1.2;

    // Cálculo de lambdas específico para América (local) y Pachuca (visitante)
    const attackH = tH.pjHome > 0 ? tH.gfHome / tH.pjHome / avgGh : tH.gf / (tH.pj || 1) / avgGh;
    const defenseA = tA.pjAway > 0 ? tA.gaAway / tA.pjAway / avgGh : tA.ga / (tA.pj || 1) / avgGh;
    const attackA = tA.pjAway > 0 ? tA.gfAway / tA.pjAway / avgGa : tA.gf / (tA.pj || 1) / avgGa;
    const defenseH = tH.pjHome > 0 ? tH.gaHome / tH.pjHome / avgGa : tH.ga / (tH.pj || 1) / avgGa;

    // Factores de forma
    const homeForm = tH.pjHome > 0 ? Math.min(1.3, Math.max(0.9, (tH.winsHome / tH.pjHome) * 1.1 + 0.5)) : 1.0;
    const awayForm = tA.pjAway > 0 ? Math.min(1.3, Math.max(0.9, (tA.winsAway / tA.pjAway) * 1.1 + 0.5)) : 1.0;

    const lambdaH = Math.max(0.2, Math.min(4.0, attackH * defenseA * avgGh * homeAdvantage * homeForm));
    const lambdaA = Math.max(0.2, Math.min(4.0, attackA * defenseH * avgGa * awayForm));

    // Método Poisson
    let pHomeP = 0, pDrawP = 0, pAwayP = 0, pBTTSP = 0, pO25P = 0;
    const maxGoals = 8;
    const poissonH = Array.from({length: maxGoals+1}, (_, h) => poissonProb(lambdaH, h));
    const poissonA = Array.from({length: maxGoals+1}, (_, a) => poissonProb(lambdaA, a));

    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const prob = poissonH[h] * poissonA[a];
        if (h > a) pHomeP += prob;
        else if (h === a) pDrawP += prob;
        else pAwayP += prob;
        if (h >= 1 && a >= 1) pBTTSP += prob;
        if (h + a > 2) pO25P += prob;
      }
    }

    // Método Dixon-Coles
    let pHomeDC = 0, pDrawDC = 0, pAwayDC = 0, pBTTSDC = 0, pO25DC = 0, totalDC = 0;
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const prob = dixonColesAdjustment(lambdaH, lambdaA, h, a);
        if (h > a) pHomeDC += prob;
        else if (h === a) pDrawDC += prob;
        else pAwayDC += prob;
        if (h >= 1 && a >= 1) pBTTSDC += prob;
        if (h + a > 2) pO25DC += prob;
        totalDC += prob;
      }
    }

    if (totalDC > 0) {
      pHomeDC /= totalDC;
      pDrawDC /= totalDC;
      pAwayDC /= totalDC;
      pBTTSDC /= totalDC;
      pO25DC /= totalDC;
    }

    // Combinar métodos
    const dcWeight = 0.8;
    const poissonWeight = 0.2;
    const avgHome = (pHomeP * poissonWeight + pHomeDC * dcWeight);
    const avgDraw = (pDrawP * poissonWeight + pDrawDC * dcWeight);
    const avgAway = (pAwayP * poissonWeight + pAwayDC * dcWeight);
    const avgBTTS = (pBTTSP * poissonWeight + pBTTSDC * dcWeight);
    const avgO25 = (pO25P * poissonWeight + pO25DC * dcWeight);

    const totalAvg = avgHome + avgDraw + avgAway;
    const finalHome = totalAvg > 0 ? avgHome / totalAvg : 0.33;
    const finalDraw = totalAvg > 0 ? avgDraw / totalAvg : 0.33;
    const finalAway = totalAvg > 0 ? avgAway / totalAvg : 0.33;

    // Mostrar probabilidades
    $('pHome').textContent = formatPct(finalHome);
    $('pDraw').textContent = formatPct(finalDraw);
    $('pAway').textContent = formatPct(finalAway);
    $('pBTTS').textContent = formatPct(avgBTTS);
    $('pO25').textContent = formatPct(avgO25);

    // Factores de corrección
    $('homeAdvantageFactor').textContent = formatDec(homeAdvantage);
    const ppgH = tH.points / (tH.pj || 1);
    const ppgA = tA.points / (tA.pj || 1);
    const strengthDiff = formatDec(ppgH - ppgA);
    $('strengthFactor').textContent = strengthDiff;
    $('dixonColesFactor').textContent = formatDec(-0.13); // Mostrar rho fijo para claridad

    // Recomendación
    const outcomes = [
      { name: `${teamHome} gana`, prob: finalHome },
      { name: 'Empate', prob: finalDraw },
      { name: `${teamAway} gana`, prob: finalAway }
    ];
    const maxOutcome = outcomes.reduce((max, curr) => curr.prob > max.prob ? curr : max);

    let suggestionText = `<span class="star">★</span><span class="main-bet">Apuesta principal: <strong>${maxOutcome.name} (${formatPct(maxOutcome.prob)})</strong></span>`;

    const markets = [];
    if (avgBTTS > 0.55) {
      markets.push(`Ambos anotan (${formatPct(avgBTTS)}) - RECOMENDADO`);
    } else if (avgBTTS < 0.45) {
      markets.push(`No ambos anotan (${formatPct(1 - avgBTTS)}) - RECOMENDADO`);
    } else {
      markets.push(`Ambos anotan equilibrado (${formatPct(avgBTTS)})`);
    }

    if (avgO25 > 0.55) {
      markets.push(`+2.5 goles (${formatPct(avgO25)}) - RECOMENDADO`);
    } else if (avgO25 < 0.45) {
      markets.push(`-2.5 goles (${formatPct(1 - avgO25)}) - RECOMENDADO`);
    } else {
      markets.push(`+2.5 goles equilibrado (${formatPct(avgO25)})`);
    }

    suggestionText += `<ul class="other-bets">${markets.map(bet => `<li>${bet}</li>`).join('')}</ul>`;

    const confidence = maxOutcome.prob;
    if (confidence < 0.40) {
      suggestionText += `<div class="warning">Partido muy equilibrado - considera mercados alternativos.</div>`;
    } else if (confidence > 0.60) {
      suggestionText += `<div class="success">Alta confianza en el resultado principal.</div>`;
    }

    const expectedGoals = (lambdaH + lambdaA).toFixed(2);
    const goalsInfo = expectedGoals > 3.0 ? 'Partido ofensivo esperado' : 
                     expectedGoals < 2.0 ? 'Partido defensivo esperado' : 
                     'Partido equilibrado en goles';

    $('details').innerHTML = `${warning}Goles esperados: ${expectedGoals} (${goalsInfo}). Basado en Dixon-Coles (rho: -0.13).`;
    $('suggestion').innerHTML = suggestionText;

    // Animación
    const suggestionEl = $('suggestion');
    suggestionEl.classList.add('pulse');
    setTimeout(() => suggestionEl.classList.remove('pulse'), 1000);

  } catch (error) {
    console.error('Error en cálculo:', error);
    $('details').innerHTML = `<div class="error"><strong>Error:</strong> ${error.message}</div>`;
  }
}

// ----------------------
// ANÁLISIS RÁPIDO
// ----------------------
function quickAnalysis(homeAttack, homeDefense, homeWinRate, awayAttack, awayDefense, awayWinRate) {
  try {
    const avgGh = 1.65, avgGa = 1.60, homeAdvantage = 1.2;
    
    const attackH = homeAttack / avgGh;
    const defenseA = awayDefense / avgGh;
    const attackA = awayAttack / avgGa;
    const defenseH = homeDefense / avgGa;
    
    const homeForm = Math.min(1.3, Math.max(0.9, homeWinRate / 100 * 1.1 + 0.5));
    const awayForm = Math.min(1.3, Math.max(0.9, awayWinRate / 100 * 1.1 + 0.5));
    
    const lambdaH = Math.max(0.2, Math.min(4.0, attackH * defenseA * avgGh * homeAdvantage * homeForm));
    const lambdaA = Math.max(0.2, Math.min(4.0, attackA * defenseH * avgGa * awayForm));

    let pHome = 0, pDraw = 0, pAway = 0, pBTTS = 0, pO25 = 0, total = 0;
    const maxGoals = 8;
    
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const prob = dixonColesAdjustment(lambdaH, lambdaA, h, a);
        if (h > a) pHome += prob;
        else if (h === a) pDraw += prob;
        else pAway += prob;
        if (h >= 1 && a >= 1) pBTTS += prob;
        if (h + a > 2) pO25 += prob;
        total += prob;
      }
    }

    if (total > 0) {
      pHome /= total; pDraw /= total; pAway /= total;
      pBTTS /= total; pO25 /= total;
    }

    return {
      homeWin: formatPct(pHome),
      draw: formatPct(pDraw),
      awayWin: formatPct(pAway),
      bothScore: formatPct(pBTTS),
      over25: formatPct(pO25),
      expectedGoals: (lambdaH + lambdaA).toFixed(2),
      lambdaHome: formatDec(lambdaH),
      lambdaAway: formatDec(lambdaA)
    };
  } catch (error) {
    console.error('Error en análisis rápido:', error);
    return null;
  }
}

// ----------------------
// EXPORTAR RESULTADOS
// ----------------------
function exportCurrentResults() {
  const results = {
    homeTeam: $('teamHome')?.value || '',
    awayTeam: $('teamAway')?.value || '',
    probabilities: {
      homeWin: $('pHome')?.textContent || '0%',
      draw: $('pDraw')?.textContent || '0%',
      awayWin: $('pAway')?.textContent || '0%',
      bothScore: $('pBTTS')?.textContent || '0%',
      over25Goals: $('pO25')?.textContent || '0%'
    },
    parameters: {
      homeAdvantage: $('homeAdvantageFactor')?.textContent || '0',
      strengthDiff: $('strengthFactor')?.textContent || '0',
      dixonColesRho: $('dixonColesFactor')?.textContent || '-0.13'
    },
    timestamp: new Date().toISOString()
  };
  
  console.log('Resultados exportados:', results);
  
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prediccion_${results.homeTeam}_vs_${results.awayTeam}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  return results;
}
