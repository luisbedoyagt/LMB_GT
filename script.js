/* ---------------------------------------------------
   Poisson + Dixon-Coles - Script completo para copy/paste
   Reemplaza tu archivo JS con este contenido.
   --------------------------------------------------- */
'use strict';

// ----------------------
// CONFIG / CONSTANTES
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
// UTILIDADES
// ----------------------
const $ = id => document.getElementById(id);

const formatPct = x => {
  const v = isFinite(x) ? x : 0;
  const clamped = Math.max(0, Math.min(1, v));
  return (100 * clamped).toFixed(1) + '%';
};

const formatDec = x => (isFinite(x) ? x.toFixed(2) : '0.00');

const parseNumberString = val => {
  const s = String(val || '').replace(/,/g, '.').trim();
  const n = Number(s);
  return isFinite(n) && n >= 0 ? n : 0;
};

// Factorial memoizado (eficiente)
const factorialMemo = new Map([[0, 1], [1, 1]]);
function factorial(n) {
  if (n < 0) return 1;
  if (factorialMemo.has(n)) return factorialMemo.get(n);
  // calcular hacia arriba
  let last = 1;
  for (const k of factorialMemo.keys()) last = Math.max(last, k);
  for (let i = last + 1; i <= n; i++) {
    factorialMemo.set(i, factorialMemo.get(i - 1) * i);
  }
  return factorialMemo.get(n);
}

// Poisson
function poissonProb(lambda, k) {
  if (!isFinite(lambda) || lambda <= 0) return k === 0 ? Math.exp(-Math.max(lambda, 0)) : 0;
  if (k < 0) return 0;
  // evitar factorial grandes innecesarios (k limitado en loops)
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

// Dixon-Coles ajustado (devuelve probabilidad conjunta ajustada)
function dixonColesAdjusted(lambdaH, lambdaA, h, a, tau = 0.85) {
  // rho dinámico según intensidades (reduce empates cortos)
  const rho = -0.15 * Math.min(lambdaH, lambdaA) / Math.max((lambdaH + lambdaA) / 2, 1);

  // probabilidad base (independiente)
  const base = poissonProb(lambdaH, h) * poissonProb(lambdaA, a);

  // aplicar correcciones sólo para resultados bajos (0-0,0-1,1-0,1-1)
  if (h <= 1 && a <= 1) {
    const adjustments = {
      '0-0': 1 - lambdaH * lambdaA * rho,
      '0-1': 1 + lambdaH * rho,
      '1-0': 1 + lambdaA * rho,
      '1-1': 1 - rho
    };
    const key = `${h}-${a}`;
    const factor = adjustments[key] !== undefined ? adjustments[key] : 1;
    return Math.max(0, factor * base);
  }

  return base;
}

// ----------------------
// NORMALIZACIÓN / PROCESAMIENTO DE DATOS
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

  return r.name && r.pj > 0 ? r : null;
}

// ----------------------
// FETCH EQUIPOS & CALENDARIO
// ----------------------
async function fetchTeams() {
  const leagueSelect = $('leagueSelect');
  if (leagueSelect) leagueSelect.innerHTML = '<option value="">Cargando ligas...</option>';

  try {
    const res = await fetch(WEBAPP_URL);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Error HTTP ${res.status}: ${res.statusText}. ${errorText}`);
    }
    const data = await res.json();

    // Normalizar ligas
    const normalized = {};
    for (const key in data.ligas) {
      const teams = (data.ligas[key] || []).map(normalizeTeam).filter(t => t !== null);
      if (teams.length > 0) normalized[key] = teams;
    }
    teamsByLeague = normalized;

    // calendario
    calendarData = {
      calendario: data.calendario || {},
      partidosFuturos: data.partidosFuturos || []
    };

    localStorage.setItem('teamsByLeague', JSON.stringify(normalized));
    return normalized;
  } catch (err) {
    console.error('fetchTeams error:', err);
    if ($('details')) $('details').innerHTML = `<div class="error"><strong>Error:</strong> No se pudieron cargar datos. ${err.message}</div>`;
    if (leagueSelect) leagueSelect.innerHTML = '<option value="">Error al cargar ligas</option>';
    return {};
  }
}

// ----------------------
// RENDER PARTIDOS FUTUROS
// ----------------------
function renderMatches() {
  const matchesList = $('matchesList');
  const noMatches = $('noMatches');
  if (!matchesList || !calendarData.partidosFuturos) return;

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
      <div class="match-liga">${(match.liga || '').replace(/_/g, ' ')}</div>
      <div class="match-teams">${match.local} vs ${match.visitante}</div>
      <div class="match-details">
        <span>Hora: ${match.hora || '—'}</span>
        <span>Estadio: ${match.estadio || '—'}</span>
      </div>
    `;
    matchesList.appendChild(matchDiv);
  });
}

// ----------------------
// UI Helpers
// ----------------------
function updateCalcButton() {
  const teamHome = $('teamHome')?.value;
  const teamAway = $('teamAway')?.value;
  const leagueCode = $('leagueSelect')?.value;
  const btn = $('recalc');
  if (btn) btn.disabled = !(leagueCode && teamHome && teamAway && teamHome !== teamAway);
}

function restrictSameTeam() {
  const teamHome = $('teamHome')?.value;
  const teamAway = $('teamAway')?.value;
  if (teamHome && teamAway && teamHome === teamAway) {
    if ($('details')) $('details').innerHTML = '<div class="error"><strong>Error:</strong> No puedes seleccionar el mismo equipo para local y visitante.</div>';
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
  if (!box) return;
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
    if ($('posHome')) $('posHome').value = '0';
    if ($('gfHome')) $('gfHome').value = '0';
    if ($('gaHome')) $('gaHome').value = '0';
    if ($('winRateHome')) $('winRateHome').value = '0%';
    if ($('formHomeTeam')) $('formHomeTeam').innerHTML = 'Local: —';
  } else {
    if ($('posAway')) $('posAway').value = '0';
    if ($('gfAway')) $('gfAway').value = '0';
    if ($('gaAway')) $('gaAway').value = '0';
    if ($('winRateAway')) $('winRateAway').value = '0%';
    if ($('formAwayTeam')) $('formAwayTeam').innerHTML = 'Visitante: —';
  }
}

function clearAll() {
  document.querySelectorAll('input').forEach(i => { if (i.type !== 'hidden') i.value = '0'; });
  document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
  ['pHome','pDraw','pAway','pBTTS','pO25','details','homeAdvantageFactor','strengthFactor','dixonColesFactor','suggestion'].forEach(id => {
    const el = $(id);
    if (el) el.textContent = '—';
  });
  if ($('formHomeTeam')) $('formHomeTeam').innerHTML = 'Local: —';
  if ($('formAwayTeam')) $('formAwayTeam').innerHTML = 'Visitante: —';
  clearTeamData('Home');
  clearTeamData('Away');
  updateCalcButton();
}

// ----------------------
// Búsqueda y llenado de equipo
// ----------------------
function findTeam(leagueCode, teamName) {
  if (!teamsByLeague[leagueCode]) return null;
  return teamsByLeague[leagueCode].find(t => t.name.toLowerCase().trim() === teamName.toLowerCase().trim()) || null;
}

function fillTeamData(teamName, leagueCode, type) {
  const t = findTeam(leagueCode, teamName);
  if (!t) {
    if ($('details')) $('details').innerHTML = `<div class="error"><strong>Error:</strong> Equipo ${teamName} no encontrado en la liga seleccionada.</div>`;
    return;
  }

  const lambda = type === 'Home' ? (t.pjHome ? t.gfHome / t.pjHome : t.gf / (t.pj || 1)) : (t.pjAway ? t.gfAway / t.pjAway : t.gf / (t.pj || 1));
  const gaAvg = type === 'Home' ? (t.pjHome ? t.gaHome / t.pjHome : t.ga / (t.pj || 1)) : (t.pjAway ? t.gaAway / t.pjAway : t.ga / (t.pj || 1));
  const dg = t.gf - t.ga;
  const dgHome = t.gfHome - t.gaHome;
  const dgAway = t.gfAway - t.gaAway;

  const box = $(type === 'Home' ? 'formHomeBox' : 'formAwayBox');
  if (box) {
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
  }

  if (type === 'Home') {
    if ($('posHome')) $('posHome').value = t.pos || 0;
    if ($('gfHome')) $('gfHome').value = formatDec(lambda);
    if ($('gaHome')) $('gaHome').value = formatDec(gaAvg);
    if ($('winRateHome')) $('winRateHome').value = formatPct(t.pjHome ? t.winsHome / t.pjHome : 0);
    if ($('formHomeTeam')) $('formHomeTeam').innerHTML = t.logoUrl
      ? `<img src="${t.logoUrl}" alt="${t.name} logo" class="team-logo"> Local: ${t.name}`
      : `Local: ${t.name}`;
  } else {
    if ($('posAway')) $('posAway').value = t.pos || 0;
    if ($('gfAway')) $('gfAway').value = formatDec(lambda);
    if ($('gaAway')) $('gaAway').value = formatDec(gaAvg);
    if ($('winRateAway')) $('winRateAway').value = formatPct(t.pjAway ? t.winsAway / t.pjAway : 0);
    if ($('formAwayTeam')) $('formAwayTeam').innerHTML = t.logoUrl
      ? `<img src="${t.logoUrl}" alt="${t.name} logo" class="team-logo"> Visitante: ${t.name}`
      : `Visitante: ${t.name}`;
  }
}

// ----------------------
// CÁLCULO PRINCIPAL (Poisson + Dixon-Coles integrado)
// ----------------------
function calculateAll() {
  const teamHome = $('teamHome')?.value;
  const teamAway = $('teamAway')?.value;
  const league = $('leagueSelect')?.value;
  if (!teamHome || !teamAway || !league) {
    if ($('details')) $('details').innerHTML = '<div class="error"><strong>Error:</strong> Selecciona una liga y ambos equipos.</div>';
    return;
  }

  const tH = findTeam(league, teamHome);
  const tA = findTeam(league, teamAway);
  if (!tH || !tA) {
    if ($('details')) $('details').innerHTML = '<div class="error"><strong>Error:</strong> Equipos no encontrados.</div>';
    return;
  }

  // Advertencia por pocas jornadas
  let warning = '';
  if (tH.pj < 5 || tA.pj < 5) {
    warning = '<div class="warning"><strong>Advertencia:</strong> Al menos un equipo tiene menos de 5 partidos jugados. Predicciones menos precisas.</div>';
  }

  try {
    // Promedio liga (home/away)
    const teams = teamsByLeague[league] || [];
    let totalHomeGames = 0, totalGfHome = 0, totalGaHome = 0;
    teams.forEach(t => {
      const homeGames = t.pjHome || Math.ceil((t.pj || 0) / 2);
      totalHomeGames += homeGames;
      totalGfHome += t.gfHome || Math.ceil((t.gf || 0) / 2);
      totalGaHome += t.gaHome || Math.ceil((t.ga || 0) / 2);
    });
    const avgGh = totalHomeGames > 0 ? totalGfHome / totalHomeGames : 1.2;
    const avgGa = totalHomeGames > 0 ? totalGaHome / totalHomeGames : 1.0;

    // Factores de ataque/defensa relativos (normalizados por promedio de liga)
    const homeAdvantage = 1.25; // factor fijo (puedes afinar)
    const attackH = (tH.pjHome || tH.pj) > 0 ? (tH.gfHome || tH.gf) / (tH.pjHome || tH.pj) / avgGh : 1;
    const defenseA = (tA.pjAway || tA.pj) > 0 ? (tA.gaAway || tA.ga) / (tA.pjAway || tA.pj) / avgGh : 1;
    const attackA = (tA.pjAway || tA.pj) > 0 ? (tA.gfAway || tA.gf) / (tA.pjAway || tA.pj) / avgGa : 1;
    const defenseH = (tH.pjHome || tH.pj) > 0 ? (tH.gaHome || tH.ga) / (tH.pjHome || tH.pj) / avgGa : 1;

    // Forma (win rate) - pequeño ajuste
    const homeForm = tH.pjHome > 0 ? Math.min(1.5, Math.max(0.7, tH.winsHome / tH.pjHome + 0.5)) : 1.0;
    const awayForm = tA.pjAway > 0 ? Math.min(1.5, Math.max(0.7, tA.winsAway / tA.pjAway + 0.5)) : 1.0;

    // Lambdas finales (ajustadas y acotadas)
    const lambdaH = Math.max(0.1, Math.min(6.0, attackH * defenseA * avgGh * homeAdvantage * homeForm));
    const lambdaA = Math.max(0.1, Math.min(6.0, attackA * defenseH * avgGa * awayForm));

    // Método Poisson puro
    let pHomeP = 0, pDrawP = 0, pAwayP = 0, pBTTSP = 0, pO25P = 0;
    // Método Dixon-Coles (ajustado)
    let pHomeDC = 0, pDrawDC = 0, pAwayDC = 0, pBTTSDC = 0, pO25DC = 0, totalDC = 0;

    const maxGoals = 12; // suficiente para cubrir probabilidad práctica

    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        // Poisson simple
        const baseProb = poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
        // Sumar a Poisson puro
        if (h > a) pHomeP += baseProb;
        else if (h === a) pDrawP += baseProb;
        else pAwayP += baseProb;
        if (h >= 1 && a >= 1) pBTTSP += baseProb;
        if (h + a > 2) pO25P += baseProb;

        // Dixon-Coles ajustado (devuelve prob conjunta ajustada)
        const adjProb = dixonColesAdjusted(lambdaH, lambdaA, h, a, 0.85);
        if (h > a) pHomeDC += adjProb;
        else if (h === a) pDrawDC += adjProb;
        else pAwayDC += adjProb;
        if (h >= 1 && a >= 1) pBTTSDC += adjProb;
        if (h + a > 2) pO25DC += adjProb;

        totalDC += adjProb;
      }
    }

    // Normalizar Dixon-Coles (para que total DC sume 1 en la muestra)
    if (totalDC > 0) {
      pHomeDC /= totalDC;
      pDrawDC /= totalDC;
      pAwayDC /= totalDC;
      pBTTSDC /= totalDC;
      pO25DC /= totalDC;
    }

    // Normalizar Poisson puro (en caso se desee)
    const totalP = pHomeP + pDrawP + pAwayP;
    if (totalP > 0) {
      pHomeP /= totalP;
      pDrawP /= totalP;
      pAwayP /= totalP;
      // BTTS y O25 ya son proporciones de la distribución total (no hace falta dividir por totalP si baseProb no truncada)
      // pero por consistencia los dejamos como están
    }

    // Combinar métodos: más peso a Dixon-Coles
    const dcWeight = 0.7;
    const poissonWeight = 1 - dcWeight;

    const avgHome = pHomeP * poissonWeight + pHomeDC * dcWeight;
    const avgDraw = pDrawP * poissonWeight + pDrawDC * dcWeight;
    const avgAway = pAwayP * poissonWeight + pAwayDC * dcWeight;
    const avgBTTS = (pBTTSP * poissonWeight + pBTTSDC * dcWeight) || 0;
    const avgO25 = (pO25P * poissonWeight + pO25DC * dcWeight) || 0;

    // Normalizar 1X2 final
    const totalAvg = avgHome + avgDraw + avgAway;
    const finalHome = totalAvg > 0 ? avgHome / totalAvg : 1/3;
    const finalDraw = totalAvg > 0 ? avgDraw / totalAvg : 1/3;
    const finalAway = totalAvg > 0 ? avgAway / totalAvg : 1/3;

    // Mostrar probabilidades en UI
    if ($('pHome')) $('pHome').textContent = formatPct(finalHome);
    if ($('pDraw')) $('pDraw').textContent = formatPct(finalDraw);
    if ($('pAway')) $('pAway').textContent = formatPct(finalAway);
    if ($('pBTTS')) $('pBTTS').textContent = formatPct(avgBTTS);
    if ($('pO25')) $('pO25').textContent = formatPct(avgO25);

    // Factores y sugerencias
    if ($('homeAdvantageFactor')) $('homeAdvantageFactor').textContent = formatDec(homeAdvantage);
    const ppgH = tH.points / (tH.pj || 1);
    const ppgA = tA.points / (tA.pj || 1);
    if ($('strengthFactor')) $('strengthFactor').textContent = formatDec(ppgH - ppgA);
    if ($('dixonColesFactor')) $('dixonColesFactor').textContent = String(0.85);

    const outcomes = [
      { name: `${teamHome} gana`, prob: finalHome },
      { name: 'Empate', prob: finalDraw },
      { name: `${teamAway} gana`, prob: finalAway }
    ];
    const maxOutcome = outcomes.reduce((max, curr) => curr.prob > max.prob ? curr : max, outcomes[0]);

    let suggestionText = `<span class="star">★</span><span class="main-bet">Apuesta principal: <strong>${maxOutcome.name} (${formatPct(maxOutcome.prob)})</strong></span>`;

    // Mercados especiales
    const markets = [];
    if (avgBTTS > 0.58) markets.push(`Ambos anotan (${formatPct(avgBTTS)}) - RECOMENDADO`);
    else if (avgBTTS < 0.42) markets.push(`No ambos anotan (${formatPct(1 - avgBTTS)}) - RECOMENDADO`);
    else markets.push(`Ambos anotan equilibrado (${formatPct(avgBTTS)})`);

    if (avgO25 > 0.58) markets.push(`+2.5 goles (${formatPct(avgO25)}) - RECOMENDADO`);
    else if (avgO25 < 0.42) markets.push(`-2.5 goles (${formatPct(1 - avgO25)}) - RECOMENDADO`);
    else markets.push(`+2.5 goles equilibrado (${formatPct(avgO25)})`);

    suggestionText += `<ul class="other-bets">${markets.map(b => `<li>${b}</li>`).join('')}</ul>`;

    // Confianza
    const confidence = maxOutcome.prob;
    if (confidence < 0.38) suggestionText += `<div class="warning">Partido muy equilibrado - considera evitar apuesta directa.</div>`;
    else if (confidence > 0.65) suggestionText += `<div class="success">Alta confianza en el resultado principal.</div>`;

    // Info adicional
    const expectedGoals = (lambdaH + lambdaA).toFixed(2);
    const goalsInfo = expectedGoals > 3.2 ? 'Partido ofensivo esperado'
                    : expectedGoals < 2.2 ? 'Partido defensivo esperado'
                    : 'Partido equilibrado en goles';

    if ($('details')) $('details').innerHTML = `${warning}Goles esperados: ${expectedGoals} (${goalsInfo}). Basado en Dixon-Coles con correlación ajustada y factor de forma.`;
    if ($('suggestion')) $('suggestion').innerHTML = suggestionText;

    // breve animación si existe elemento
    const suggestionEl = $('suggestion');
    if (suggestionEl) {
      suggestionEl.classList.add('pulse');
      setTimeout(() => suggestionEl.classList.remove('pulse'), 1000);
    }

  } catch (error) {
    console.error('Error en cálculo:', error);
    if ($('details')) $('details').innerHTML = `<div class="error"><strong>Error:</strong> ${error.message}</div>`;
  }
}

// ----------------------
// QUICK ANALYSIS (API-like)
// ----------------------
function quickAnalysis(homeAttack, homeDefense, homeWinRate, awayAttack, awayDefense, awayWinRate) {
  try {
    const avgGh = 1.2, avgGa = 1.0, homeAdvantage = 1.25;

    const attackH = homeAttack / avgGh;
    const defenseA = awayDefense / avgGh;
    const attackA = awayAttack / avgGa;
    const defenseH = homeDefense / avgGa;

    const homeForm = Math.min(1.5, Math.max(0.7, homeWinRate / 100 + 0.5));
    const awayForm = Math.min(1.5, Math.max(0.7, awayWinRate / 100 + 0.5));

    const lambdaH = Math.max(0.1, Math.min(6.0, attackH * defenseA * avgGh * homeAdvantage * homeForm));
    const lambdaA = Math.max(0.1, Math.min(6.0, attackA * defenseH * avgGa * awayForm));

    let pHome = 0, pDraw = 0, pAway = 0, pBTTS = 0, pO25 = 0, total = 0;

    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const prob = dixonColesAdjusted(lambdaH, lambdaA, h, a, 0.85);
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
    console.error('Error quickAnalysis:', error);
    return null;
  }
}

// ----------------------
// EXPORT & UTIL PARA UX
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
      dixonColesTau: $('dixonColesFactor')?.textContent || '0.85'
    },
    timestamp: new Date().toISOString()
  };
  console.log('Resultados exportados:', results);
  return results;
}

// ----------------------
// EVENT HANDLERS / INIT
// ----------------------
function onLeagueChange() {
  const code = $('leagueSelect')?.value;
  const teamHomeSelect = $('teamHome');
  const teamAwaySelect = $('teamAway');
  if (!teamHomeSelect || !teamAwaySelect) return;

  teamHomeSelect.innerHTML = '<option value="">Cargando equipos...</option>';
  teamAwaySelect.innerHTML = '<option value="">Cargando equipos...</option>';

  if (!code || !teamsByLeague[code] || teamsByLeague[code].length === 0) {
    clearTeamData('Home');
    clearTeamData('Away');
    updateCalcButton();
    if ($('details')) $('details').innerHTML = '<div class="warning"><strong>Advertencia:</strong> No hay datos disponibles para esta liga.</div>';
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
    if ($('details')) $('details').innerHTML = '<div class="error"><strong>Error:</strong> Problema con la interfaz HTML.</div>';
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

  const recalcBtn = $('recalc');
  if (recalcBtn) recalcBtn.addEventListener('click', calculateAll);
  const resetBtn = $('reset');
  if (resetBtn) resetBtn.addEventListener('click', clearAll);
}

document.addEventListener('DOMContentLoaded', init);

// ----------------------
// FIN DEL ARCHIVO
// ----------------------
