// ----------------------
// UTILIDADES MEJORADAS (solo optimizaciones)
// ----------------------
const $ = id => document.getElementById(id);
const formatPct = x => (100 * (isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)).toFixed(1) + '%';
const formatDec = x => (isFinite(x) ? x.toFixed(2) : '0.00');
const parseNumberString = val => {
  const s = String(val || '').replace(/,/g, '.');
  const n = Number(s);
  return isFinite(n) && n >= 0 ? n : 0;
};

// Cache mejorado para factorial usando Map (más eficiente)
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

// Dixon-Coles mejorado con correlación rho real
function dixonColesAdjustment(lambdaH, lambdaA, h, a, tau = 0.9) {
  const rho = -0.15 * Math.min(lambdaH, lambdaA) / Math.max((lambdaH + lambdaA) / 2, 1);
  
  // Ajustes específicos Dixon-Coles para resultados bajos
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
// CONFIGURACIÓN (mantiene WEBAPP_URL original)
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
// NORMALIZACIÓN MEJORADA
// ----------------------
function normalizeTeam(raw) {
  if (!raw || !raw.name) return null;
  const r = {};
  r.name = raw.name;
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
  
  // Solo retornar equipos con datos válidos
  return r.name && r.pj > 0 ? r : null;
}

// ----------------------
// FETCH EQUIPOS Y CALENDARIO (conserva estructura original)
// ----------------------
async function fetchTeams() {
  const leagueSelect = $('leagueSelect');
  if (leagueSelect) leagueSelect.innerHTML = '<option value="">Cargando ligas...</option>';

  try {
    const res = await fetch(WEBAPP_URL);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Error HTTP ${res.status}: ${res.statusText}. Respuesta: ${errorText}`);
    }
    const data = await res.json();
    console.log('Datos recibidos:', data);
    console.log('Partidos futuros:', data.partidosFuturos);

    // Procesar ligas con mejor validación
    const normalized = {};
    for (const key in data.ligas) {
      const teams = (data.ligas[key] || []).map(normalizeTeam).filter(t => t !== null);
      if (teams.length > 0) {
        normalized[key] = teams;
      }
    }
    teamsByLeague = normalized;

    // Procesar calendario y partidos futuros
    calendarData = {
      calendario: data.calendario || {},
      partidosFuturos: data.partidosFuturos || []
    };

    localStorage.setItem('teamsByLeague', JSON.stringify(normalized));
    return normalized;
  } catch (err) {
    console.error('Error en fetchTeams:', err);
    const errorMsg = `<div class="error"><strong>Error:</strong> No se pudieron cargar los datos de la API. Verifica la conexión a la hoja de Google Sheets o el endpoint de la API. Detalle: ${err.message}</div>`;
    $('details').innerHTML = errorMsg;
    if (leagueSelect) leagueSelect.innerHTML = '<option value="">Error al cargar ligas</option>';
    return {};
  }
}

// ----------------------
// RENDERIZAR PARTIDOS (mantiene lógica original)
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

  if (calendarData.partidosFuturos.length === 0) {
    if (noMatches) noMatches.style.display = 'block';
    return;
  }

  if (noMatches) noMatches.style.display = 'none';

  calendarData.partidosFuturos.forEach(match => {
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
// INICIALIZACIÓN (conserva estructura original)
// ----------------------
async function init() {
  clearTeamData('Home');
  clearTeamData('Away');
  updateCalcButton();

  teamsByLeague = await fetchTeams();
  renderMatches();

  const leagueSelect = $('leagueSelect');
  const teamHomeSelect = $('teamHome');
  const teamAwaySelect = $('teamAway');

  if (!leagueSelect || !teamHomeSelect || !teamAwaySelect) {
    $('details').innerHTML = '<div class="error"><strong>Error:</strong> Problema con la interfaz HTML.</div>';
    return;
  }

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
// FUNCIONES AUXILIARES (sin cambios)
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
    $('details').innerHTML = '<div class="warning"><strong>Advertencia:</strong> No hay datos disponibles para esta liga.</div>';
    return;
  }

  const fragmentHome = document.createDocumentFragment();
  const fragmentAway = document.createDocumentFragment();
  const defaultOptionHome = document.createElement('option');
  defaultOptionHome.value = '';
  defaultOptionHome.textContent = '-- Selecciona equipo --';
  fragmentHome.appendChild(defaultOptionHome);
  const defaultOptionAway = document.createElement('option');
  defaultOptionAway.value = '';
  defaultOptionAway.textContent = '-- Selecciona equipo --';
  fragmentAway.appendChild(defaultOptionAway);

  teamsByLeague[code].forEach(t => {
    const opt1 = document.createElement('option');
    opt1.value = t.name;
    opt1.textContent = t.name;
    fragmentHome.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = t.name;
    opt2.textContent = t.name;
    fragmentAway.appendChild(opt2);
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
// BÚSQUEDA Y LLENADO DE EQUIPO (mejorado findTeam)
// ----------------------
function findTeam(leagueCode, teamName) {
  if (!teamsByLeague[leagueCode]) return null;
  // Búsqueda case-insensitive mejorada
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

  const lambda = type === 'Home' ? (t.pjHome ? t.gfHome / t.pjHome : t.gf / (t.pj || 1)) : (t.pjAway ? t.gfAway / t.pjAway : t.gf / (t.pj || 1));
  const gaAvg = type === 'Home' ? (t.pjHome ? t.gaHome / t.pjHome : t.ga / (t.pj || 1)) : (t.pjAway ? t.gaAway / t.pjAway : t.ga / (t.pj || 1));
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
    $('winRateHome').value = formatPct(t.pjHome ? t.winsHome / t.pjHome : 0);
    $('formHomeTeam').innerHTML = t.logoUrl
      ? `<img src="${t.logoUrl}" alt="${t.name} logo" class="team-logo"> Local: ${t.name}`
      : `Local: ${t.name}`;
  } else {
    $('posAway').value = t.pos || 0;
    $('gfAway').value = formatDec(lambda);
    $('gaAway').value = formatDec(gaAvg);
    $('winRateAway').value = formatPct(t.pjAway ? t.winsAway / t.pjAway : 0);
    $('formAwayTeam').innerHTML = t.logoUrl
      ? `<img src="${t.logoUrl}" alt="${t.name} logo" class="team-logo"> Visitante: ${t.name}`
      : `Visitante: ${t.name}`;
  }
}

// ----------------------
// CÁLCULO PRINCIPAL MEJORADO
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

  // Check de jornadas mínimas
  let warning = '';
  if (tH.pj < 5 || tA.pj < 5) {
    warning = '<div class="warning"><strong>Advertencia:</strong> Al menos un equipo tiene menos de 5 partidos jugados. Las predicciones pueden ser menos precisas en etapas tempranas de la liga (ideal: 10+ jornadas).</div>';
  }

  try {
    // Calcular promedios de la liga (mejorado con validación)
    const teams = teamsByLeague[league];
    let totalGames = 0;
    let totalGfHome = 0;
    let totalGaHome = 0;
    teams.forEach(t => {
      const homeGames = t.pjHome || Math.ceil((t.pj || 0) / 2);
      totalGames += homeGames;
      totalGfHome += t.gfHome || Math.ceil((t.gf || 0) / 2);
      totalGaHome += t.gaHome || Math.ceil((t.ga || 0) / 2);
    });
    const avgGh = totalGames > 0 ? totalGfHome / totalGames : 1.2;
    const avgGa = totalGames > 0 ? totalGaHome / totalGames : 1.0;

    // Lambdas mejoradas - considera fuerza del oponente
    const homeAdvantage = 1.25; // Factor más realista
    
    const attackH = (tH.pjHome || tH.pj) > 0 ? (tH.gfHome || tH.gf) / (tH.pjHome || tH.pj) / avgGh : 1;
    const defenseA = (tA.pjAway || tA.pj) > 0 ? (tA.gaAway || tA.ga) / (tA.pjAway || tA.pj) / avgGh : 1;
    
    const attackA = (tA.pjAway || tA.pj) > 0 ? (tA.gfAway || tA.gf) / (tA.pjAway || tA.pj) / avgGa : 1;
    const defenseH = (tH.pjHome || tH.pj) > 0 ? (tH.gaHome || tH.ga) / (tH.pjHome || tH.pj) / avgGa : 1;

    // Factor de forma basado en win rate
    const homeForm = tH.pjHome > 0 ? Math.min(1.5, Math.max(0.7, tH.winsHome / tH.pjHome + 0.5)) : 1.0;
    const awayForm = tA.pjAway > 0 ? Math.min(1.5, Math.max(0.7, tA.winsAway / tA.pjAway + 0.5)) : 1.0;

    const lambdaH = Math.max(0.1, Math.min(5.0, attackH * defenseA * avgGh * homeAdvantage * homeForm));
    const lambdaA = Math.max(0.1, Math.min(5.0, attackA * defenseH * avgGa * awayForm));

    // Método 1: Poisson estándar
    let pHomeP = 0, pDrawP = 0, pAwayP = 0, pBTTSP = 0, pO25P = 0;
    const maxGoals = 12; // Reducido para eficiencia

    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const prob = poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
        if (h > a) pHomeP += prob;
        else if (h === a) pDrawP += prob;
        else pAwayP += prob;

        if (h >= 1 && a >= 1) pBTTSP += prob;
        if (h + a > 2) pO25P += prob;
      }
    }

    // Método 2: Dixon-Coles mejorado
    let pHomeDC = 0, pDrawDC = 0, pAwayDC = 0, pBTTSDC = 0, pO25DC = 0, totalDC = 0;
    
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const prob = dixonColesAdjustment(lambdaH, lambdaA, h, a, 0.85);
        
        if (h > a) pHomeDC += prob;
        else if (h === a) pDrawDC += prob;
        else pAwayDC += prob;

        if (h >= 1 && a >= 1) pBTTSDC += prob;
        if (h + a > 2) pO25DC += prob;
        
        totalDC += prob;
      }
    }

    // Normalizar Dixon-Coles
    if (totalDC > 0) {
      pHomeDC /= totalDC;
      pDrawDC /= totalDC;
      pAwayDC /= totalDC;
      pBTTSDC /= totalDC;
      pO25DC /= totalDC;
    }

    // Combinar métodos con peso hacia Dixon-Coles (más preciso)
    const dcWeight = 0.7; // 70% Dixon-Coles, 30% Poisson
    const poissonWeight = 0.3;
    
    const avgHome = (tH.pj && tA.pj) ? (pHomeP * poissonWeight + pHomeDC * dcWeight) : 0.33;
    const avgDraw = (tH.pj && tA.pj) ? (pDrawP * poissonWeight + pDrawDC * dcWeight) : 0.33;
    const avgAway = (tH.pj && tA.pj) ? (pAwayP * poissonWeight + pAwayDC * dcWeight) : 0.33;
    const avgBTTS = (tH.pj && tA.pj) ? (pBTTSP * poissonWeight + pBTTSDC * dcWeight) : 0.5;
    const avgO25 = (tH.pj && tA.pj) ? (pO25P * poissonWeight + pO25DC * dcWeight) : 0.5;

    // Normalizar resultados principales
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

    // Factores de corrección mejorados
    $('homeAdvantageFactor').textContent = formatDec(homeAdvantage);
    const ppgH = tH.points / (tH.pj || 1);
    const ppgA = tA.points / (tA.pj || 1);
    const strengthDiff = formatDec(ppgH - ppgA);
    $('strengthFactor').textContent = strengthDiff;
    $('dixonColesFactor').textContent = '0.85';

    // Recomendación mejorada con análisis de confianza
    const outcomes = [
      { name: `${teamHome} gana`, prob: finalHome },
      { name: 'Empate', prob: finalDraw },
      { name: `${teamAway} gana`, prob: finalAway }
    ];
    const maxOutcome = outcomes.reduce((max, curr) => curr.prob > max.prob ? curr : max);

    let suggestionText = `<span class="star">★</span><span class="main-bet">Apuesta principal: <strong>${maxOutcome.name} (${formatPct(maxOutcome.prob)})</strong></span>`;

    // Análisis mejorado de mercados especiales con umbrales más precisos
    const markets = [];
    if (avgBTTS > 0.58) {
      markets.push(`Ambos anotan (${formatPct(avgBTTS)}) - RECOMENDADO`);
    } else if (avgBTTS < 0.42) {
      markets.push(`No ambos anotan (${formatPct(1 - avgBTTS)}) - RECOMENDADO`);
    } else {
      markets.push(`Ambos anotan equilibrado (${formatPct(avgBTTS)})`);
    }

    if (avgO25 > 0.58) {
      markets.push(`+2.5 goles (${formatPct(avgO25)}) - RECOMENDADO`);
    } else if (avgO25 < 0.42) {
      markets.push(`-2.5 goles (${formatPct(1 - avgO25)}) - RECOMENDADO`);
    } else {
      markets.push(`+2.5 goles equilibrado (${formatPct(avgO25)})`);
    }

    suggestionText += `<ul class="other-bets">${markets.map(bet => `<li>${bet}</li>`).join('')}</ul>`;

    // Análisis de confianza mejorado
    const confidence = maxOutcome.prob;
    if (confidence < 0.38) {
      suggestionText += `<div class="warning">Partido muy equilibrado - considera mercados alternativos o evita apostar.</div>`;
    } else if (confidence > 0.65) {
      suggestionText += `<div class="success">Alta confianza en el resultado principal.</div>`;
    }

    // Información adicional útil
    const expectedGoals = (lambdaH + lambdaA).toFixed(2);
    const goalsInfo = expectedGoals > 3.2 ? 'Partido ofensivo esperado' : 
                     expectedGoals < 2.2 ? 'Partido defensivo esperado' : 
                     'Partido equilibrado en goles';

    $('details').innerHTML = `${warning}Goles esperados: ${expectedGoals} (${goalsInfo}). Basado en Dixon-Coles con correlación ajustada y factor de forma.`;
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
// FUNCIONES ADICIONALES ÚTILES
// ----------------------

// Análisis rápido sin interfaz (para uso programático)
function quickAnalysis(homeAttack, homeDefense, homeWinRate, awayAttack, awayDefense, awayWinRate) {
  try {
    // Simular datos básicos para cálculo
    const avgGh = 1.2, avgGa = 1.0, homeAdvantage = 1.25;
    
    const attackH = homeAttack / avgGh;
    const defenseA = awayDefense / avgGh;
    const attackA = awayAttack / avgGa;
    const defenseH = homeDefense / avgGa;
    
    const homeForm = Math.min(1.5, Math.max(0.7, homeWinRate / 100 + 0.5));
    const awayForm = Math.min(1.5, Math.max(0.7, awayWinRate / 100 + 0.5));
    
    const lambdaH = Math.max(0.1, Math.min(5.0, attackH * defenseA * avgGh * homeAdvantage * homeForm));
    const lambdaA = Math.max(0.1, Math.min(5.0, attackA * defenseH * avgGa * awayForm));

    // Calcular solo Dixon-Coles para rapidez
    let pHome = 0, pDraw = 0, pAway = 0, pBTTS = 0, pO25 = 0, total = 0;
    
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const prob = dixonColesAdjustment(lambdaH, lambdaA, h, a, 0.85);
        
        if (h > a) pHome += prob;
        else if (h === a) pDraw += prob;
        else pAway += prob;

        if (h >= 1 && a >= 1) pBTTS += prob;
        if (h + a > 2) pO25 += prob;
        total += prob;
      }
    }

    // Normalizar
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

// Función para exportar resultados actuales
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
      dixonColesTau: $('dixonColesFactor')?.textContent || '0.85'
    },
    timestamp: new Date().toISOString()
  };
  
  console.log('Resultados exportados:', results);
  return results;
}
