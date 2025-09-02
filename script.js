/**
 * @fileoverview Script para interfaz web que muestra estadísticas de fútbol y calcula probabilidades de partidos
 * usando datos de una API de Google Apps Script. Integra la API de Grok para predicciones avanzadas con IA, activada por un botón.
 */

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

// Funciones auxiliares para Poisson y Dixon-Coles (fallback si la API falla)
function poissonProbability(lambda, k) {
    if (lambda <= 0 || k < 0) return 0;
    return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(n) {
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
}

// ----------------------
// CONFIGURACIÓN DE LIGAS Y API
// ----------------------
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyhyoxXAt1eMt01tzaWG4GVJviJuMo_CK_U6loFEV84EPvdAuZEFYMw7maBfDij4P4Z/exec";
const GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_API_KEY = "xai-yfaqau6cmN5bRELdR4nAbiDbqrCChFrpM8QRDYF5EhVyMiaY8nLyBlyTM1VaSaGtu75YTkhCjWt3Gzg1";

let teamsByLeague = {};
let allData = {};

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

const leagueCodeToName = {
    "esp.1": "España_LaLiga",
    "esp.2": "España_Segunda",
    "eng.1": "Inglaterra_PremierLeague",
    "eng.2": "Inglaterra_Championship",
    "ita.1": "Italia_SerieA",
    "ger.1": "Alemania_Bundesliga",
    "fra.1": "Francia_Ligue1",
    "ned.1": "PaísesBajos_Eredivisie",
    "ned.2": "PaísesBajos_EersteDivisie",
    "por.1": "Portugal_LigaPortugal",
    "mex.1": "México_LigaMX",
    "usa.1": "EstadosUnidos_MLS",
    "bra.1": "Brasil_Brasileirao",
    "gua.1": "Guatemala_LigaNacional",
    "crc.1": "CostaRica_LigaPromerica",
    "hon.1": "Honduras_LigaNacional",
    "ksa.1": "Arabia_Saudi_ProLeague"
};

// ----------------------
// NORMALIZACIÓN DE DATOS
// ----------------------
function normalizeTeam(raw) {
    if (!raw) return null;
    const r = {};
    r.name = raw.name || '';
    if (!r.name) return null;
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
    r.tiesHome = parseNumberString(raw.tiesHome || 0);
    r.tiesAway = parseNumberString(raw.tiesAway || 0);
    r.lossesHome = parseNumberString(raw.lossesHome || 0);
    r.lossesAway = parseNumberString(raw.lossesAway || 0);
    r.logoUrl = raw.logoUrl || '';
    return r;
}

// ----------------------
// FETCH DATOS
// ----------------------
async function fetchAllData() {
    const leagueSelect = $('leagueSelect');
    if (leagueSelect) leagueSelect.innerHTML = '<option value="">Cargando datos...</option>';

    try {
        const res = await fetch(`${WEBAPP_URL}?tipo=todo&update=false`);
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Error HTTP ${res.status}: ${res.statusText}. Respuesta: ${errorText}`);
        }
        allData = await res.json();

        if (!allData.calendario || !allData.ligas) throw new Error('Estructura de datos inválida: faltan "calendario" o "ligas"');
        
        const normalized = {};
        for (const key in allData.ligas) {
            normalized[key] = (allData.ligas[key] || []).map(normalizeTeam).filter(t => t && t.name);
        }
        teamsByLeague = normalized;

        localStorage.setItem('allData', JSON.stringify(allData));
        displaySelectedLeagueEvents($('leagueSelect').value);
        return allData;
    } catch (err) {
        console.error('Error en fetchAllData:', err);
        const errorMsg = `<div class="error"><strong>Error:</strong> No se pudieron cargar los datos de la API. Verifica la conexión a la hoja de Google Sheets o el endpoint de la API. Detalle: ${err.message}</div>`;
        $('details').innerHTML = errorMsg;
        if (leagueSelect) leagueSelect.innerHTML = '<option value="">Error al cargar ligas</option>';
        return {};
    }
}

// ----------------------
// MUESTRA DE EVENTOS DE LA LIGA SELECCIONADA
// ----------------------
function displaySelectedLeagueEvents(leagueCode) {
    const selectedEventsList = $('selected-league-events');
    if (!selectedEventsList) return;

    selectedEventsList.innerHTML = '';

    if (!leagueCode || !allData.calendario) {
        selectedEventsList.innerHTML = '<div class="event-item placeholder"><span>Selecciona una liga para ver eventos próximos.</span></div>';
        return;
    }

    const ligaName = leagueCodeToName[leagueCode];
    const events = (allData.calendario[ligaName] || []).slice(0, 3);

    if (events.length === 0) {
        selectedEventsList.innerHTML = '<div class="event-item placeholder"><span>No hay eventos próximos para esta liga.</span></div>';
        return;
    }

    events.forEach(event => {
        let eventDateTime;
        try {
            const parsedDate = new Date(event.fecha);
            if (isNaN(parsedDate.getTime())) throw new Error("Fecha inválida");
            const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Guatemala' };
            const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Guatemala' };
            eventDateTime = `${parsedDate.toLocaleDateString('es-ES', dateOptions)} ${parsedDate.toLocaleTimeString('es-ES', timeOptions)} (GT)`;
        } catch (err) {
            console.warn(`Error parseando fecha para el evento: ${event.local} vs. ${event.visitante}`, err);
            eventDateTime = `${event.fecha} (Hora no disponible)`;
        }

        const div = document.createElement('div');
        div.className = 'event-item';
        div.dataset.homeTeam = event.local;
        div.dataset.awayTeam = event.visitante;
        div.innerHTML = `
            <strong>${event.local} vs. ${event.visitante}</strong>
            <span>Estadio: ${event.estadio || 'Por confirmar'}</span>
            <span>${eventDateTime}</span>
        `;
        selectedEventsList.appendChild(div);

        div.addEventListener('click', () => selectEvent(event.local, event.visitante));
    });
}

// ----------------------
// INICIALIZACIÓN
// ----------------------
async function init() {
    clearTeamData('Home');
    clearTeamData('Away');
    
    await fetchAllData();
    
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

    leagueSelect.addEventListener('change', () => {
        onLeagueChange();
        displaySelectedLeagueEvents(leagueSelect.value);
    });
    
    teamHomeSelect.addEventListener('change', () => {
        if (restrictSameTeam()) {
            fillTeamData($('teamHome').value, $('leagueSelect').value, 'Home');
        }
    });
    teamAwaySelect.addEventListener('change', () => {
        if (restrictSameTeam()) {
            fillTeamData($('teamAway').value, $('leagueSelect').value, 'Away');
        }
    });

    $('reset').addEventListener('click', clearAll);
    
    // Agregar listener para el botón de calcular con IA
    const calcButton = $('calculateAI');
    if (calcButton) {
        calcButton.addEventListener('click', calculateAll);
    } else {
        console.error('Botón calculateAI no encontrado en el DOM');
        $('details').innerHTML = '<div class="error"><strong>Error:</strong> Botón "Calcular con IA" no encontrado. Verifica el HTML.</div>';
    }
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
        $('details').innerHTML = '<div class="warning"><strong>Advertencia:</strong> No hay datos disponibles para esta liga.</div>';
        return;
    }

    const fragmentHome = document.createDocumentFragment();
    const defaultOptionHome = document.createElement('option');
    defaultOptionHome.value = '';
    defaultOptionHome.textContent = '-- Selecciona equipo --';
    fragmentHome.appendChild(defaultOptionHome);
    const fragmentAway = document.createDocumentFragment();
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
}

function selectEvent(homeTeamName, awayTeamName) {
    const teamHomeSelect = $('teamHome');
    const teamAwaySelect = $('teamAway');
    
    let foundHome = false;
    for (let i = 0; i < teamHomeSelect.options.length; i++) {
        if (teamHomeSelect.options[i].text === homeTeamName) {
            teamHomeSelect.selectedIndex = i;
            foundHome = true;
            break;
        }
    }
    
    let foundAway = false;
    for (let i = 0; i < teamAwaySelect.options.length; i++) {
        if (teamAwaySelect.options[i].text === awayTeamName) {
            teamAwaySelect.selectedIndex = i;
            foundAway = true;
            break;
        }
    }

    if (foundHome && foundAway) {
        fillTeamData(homeTeamName, $('leagueSelect').value, 'Home');
        fillTeamData(awayTeamName, $('leagueSelect').value, 'Away');
    } else {
        $('details').innerHTML = '<div class="error"><strong>Error:</strong> No se pudo encontrar uno o ambos equipos en la lista de la liga.</div>';
    }
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
        return false;
    }
    return true;
}

function clearTeamData(type) {
    const box = $(type === 'Home' ? 'formHomeBox' : 'formAwayBox');
    box.innerHTML = `
    <div class="team-details">
        <div class="stat-section">
            <span class="section-title">General</span>
            <div class="stat-metrics">
                <span>PJ: 0</span>
                <span>Puntos: 0</span>
                <span>DG: 0</span>
            </div>
        </div>
        <div class="stat-section">
            <span class="section-title">Local</span>
            <div class="stat-metrics">
                <span>PJ: 0</span>
                <span>PG: 0</span>
                <span>DG: 0</span>
            </div>
        </div>
        <div class="stat-section">
            <span class="section-title">Visitante</span>
            <div class="stat-metrics">
                <span>PJ: 0</span>
                <span>PG: 0</span>
                <span>DG: 0</span>
            </div>
        </div>
    </div>
    `;
    if (type === 'Home') {
        $('posHome').textContent = '--';
        $('gfHome').textContent = '--';
        $('gaHome').textContent = '--';
        $('winRateHome').textContent = '--';
    } else {
        $('posAway').textContent = '--';
        $('gfAway').textContent = '--';
        $('gaAway').textContent = '--';
        $('winRateAway').textContent = '--';
    }
    const cardHeader = $(type === 'Home' ? 'card-home' : 'card-away').querySelector('.card-header');
    const logoImg = cardHeader ? cardHeader.querySelector('.team-logo') : null;
    if (logoImg) logoImg.style.display = 'none';
}

function clearAll() {
    document.querySelectorAll('.stat-value').forEach(el => el.textContent = '--');
    document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
    ['pHome', 'pDraw', 'pAway', 'pBTTS', 'pO25'].forEach(id => {
        const el = $(id);
        if (el) el.textContent = '--';
    });
    $('details').innerHTML = 'Detalles del Pronóstico';
    $('suggestion').innerHTML = '<p>Esperando datos...</p>';
    clearTeamData('Home');
    clearTeamData('Away');
    displaySelectedLeagueEvents('');
}

// ----------------------
// BÚSQUEDA Y LLENADO DE EQUIPO
// ----------------------
function findTeam(leagueCode, teamName) {
    if (!teamsByLeague[leagueCode]) return null;
    return teamsByLeague[leagueCode].find(t => t.name === teamName) || null;
}

function fillTeamData(teamName, leagueCode, type) {
    const t = findTeam(leagueCode, teamName);
    if (!t) {
        console.error(`Equipo no encontrado: ${teamName} en liga ${leagueCode}`);
        $('details').innerHTML = `<div class="error"><strong>Error:</strong> Equipo ${teamName} no encontrado.</div>`;
        return;
    }

    const dg = t.gf - t.ga;
    const dgHome = t.gfHome - t.gaHome;
    const dgAway = t.gfAway - t.gaAway;

    const box = $(type === 'Home' ? 'formHomeBox' : 'formAwayBox');
    box.innerHTML = `
    <div class="team-details">
        <div class="stat-section">
            <span class="section-title">General</span>
            <div class="stat-metrics">
                <span>PJ: ${t.pj || 0}</span>
                <span>Puntos: ${t.points || 0}</span>
                <span>DG: ${dg >= 0 ? '+' + dg : dg || 0}</span>
            </div>
        </div>
        <div class="stat-section">
            <span class="section-title">Local</span>
            <div class="stat-metrics">
                <span>PJ: ${t.pjHome || 0}</span>
                <span>PG: ${t.winsHome || 0}</span>
                <span>DG: ${dgHome >= 0 ? '+' + dgHome : dgHome || 0}</span>
            </div>
        </div>
        <div class="stat-section">
            <span class="section-title">Visitante</span>
            <div class="stat-metrics">
                <span>PJ: ${t.pjAway || 0}</span>
                <span>PG: ${t.winsAway || 0}</span>
                <span>DG: ${dgAway >= 0 ? '+' + dgAway : dgAway || 0}</span>
            </div>
        </div>
    </div>
    `;

    if (type === 'Home') {
        $('posHome').textContent = t.pos || '--';
        $('gfHome').textContent = formatDec(t.gf / (t.pj || 1));
        $('gaHome').textContent = formatDec(t.ga / (t.pj || 1));
        $('winRateHome').textContent = formatPct(t.pj ? t.g / t.pj : 0);
    } else {
        $('posAway').textContent = t.pos || '--';
        $('gfAway').textContent = formatDec(t.gf / (t.pj || 1));
        $('gaAway').textContent = formatDec(t.ga / (t.pj || 1));
        $('winRateAway').textContent = formatPct(t.pj ? t.g / t.pj : 0);
    }

    const cardHeader = $(type === 'Home' ? 'card-home' : 'card-away').querySelector('.card-header');
    if (cardHeader) {
        const h3 = cardHeader.querySelector('h3');
        if (h3) {
            let logoImg = cardHeader.querySelector('.team-logo');
            if (!logoImg) {
                logoImg = document.createElement('img');
                logoImg.className = 'team-logo';
                logoImg.alt = `Logo de ${t.name}`;
                h3.insertAdjacentElement('beforebegin', logoImg);
            }
            if (t.logoUrl) {
                logoImg.src = t.logoUrl;
                logoImg.style.display = 'inline-block';
            } else {
                logoImg.style.display = 'none';
            }
        }
    }
}

// ----------------------
// CÁLCULO DE PROBABILIDADES CON GROK API
// ----------------------
async function calculateAll() {
    const teamHome = $('teamHome').value;
    const teamAway = $('teamAway').value;
    const league = $('leagueSelect').value;

    if (!teamHome || !teamAway || !league) {
        $('details').innerHTML = '<div class="warning"><strong>Advertencia:</strong> Selecciona una liga y ambos equipos.</div>';
        $('suggestion').innerHTML = '<p>Esperando datos...</p>';
        return;
    }

    const tH = findTeam(league, teamHome);
    const tA = findTeam(league, teamAway);

    if (!tH || !tA) {
        $('details').innerHTML = '<div class="error"><strong>Error:</strong> No se encontraron datos para uno o ambos equipos.</div>';
        $('suggestion').innerHTML = '<p>Esperando datos...</p>';
        return;
    }

    // Preparar prompt para Grok
    const prompt = `Calcula probabilidades de Poisson con ajuste Dixon-Coles para el partido ${teamHome} (local) vs ${teamAway} (visitante) usando estos datos:
    Datos de ${teamHome}: ${JSON.stringify(tH)}
    Datos de ${teamAway}: ${JSON.stringify(tA)}
    Promedios de la liga: gfHome: 1.29, gaHome: 0.96, gfAway: 1.00, gaAway: 1.33
    Devuelve un JSON con: { "home": prob_local, "draw": prob_empate, "away": prob_visitante, "btts": prob_ambos_anotan, "over25": prob_mas_2.5_goles }`;

    try {
        $('details').innerHTML = '<div class="loading"><strong>Cargando:</strong> Calculando con IA...</div>';
        const response = await fetch(GROK_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'grok-4-latest',
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                temperature: 0
            })
        });

        if (!response.ok) throw new Error(`Error en API de Grok: ${response.statusText} (Código: ${response.status})`);

        const data = await response.json();
        const resultText = data.choices[0].message.content;
        let probabilities;
        try {
            probabilities = JSON.parse(resultText);
        } catch (e) {
            throw new Error('Respuesta de Grok no es un JSON válido: ' + resultText);
        }

        const { home: finalHome, draw: finalDraw, away: finalAway, btts: pBTTSH, over25: pO25H } = probabilities;

        const probArray = [
            { label: 'Local', value: finalHome, id: 'pHome', type: 'Resultado' },
            { label: 'Empate', value: finalDraw, id: 'pDraw', type: 'Resultado' },
            { label: 'Visitante', value: finalAway, id: 'pAway', type: 'Resultado' },
            { label: 'Ambos Anotan', value: pBTTSH, id: 'pBTTS', type: 'Mercado' },
            { label: 'Más de 2.5 goles', value: pO25H, id: 'pO25', type: 'Mercado' }
        ];

        probArray.forEach(p => {
            const el = $(p.id);
            if (el) el.textContent = formatPct(p.value);
        });

        const recommendations = probArray.filter(p => p.value >= 0.3)
                                       .sort((a, b) => b.value - a.value)
                                       .slice(0, 3);

        $('details').innerHTML = `<p><strong>Detalles del pronóstico (con IA Grok):</strong></p>`;
        let suggestionHTML = recommendations.length > 0 ? '<ul>' : '<p>No se encontraron recomendaciones con probabilidad superior al 30%.</p>';
        recommendations.forEach((rec, index) => {
            suggestionHTML += `<li class="rec-item">
                <span class="rec-rank">${index + 1}.</span>
                <span class="rec-bet">${rec.label}</span>
                <span class="rec-prob">${formatPct(rec.value)}</span>
            </li>`;
        });
        if (recommendations.length > 0) suggestionHTML += '</ul>';
        $('suggestion').innerHTML = suggestionHTML;
    } catch (err) {
        console.error('Error en Grok API:', err);
        $('details').innerHTML = `<div class="error"><strong>Error:</strong> Fallo al consultar Grok: ${err.message}. Usando cálculo local.</div>`;
        
        // Fallback a cálculo local
        const { finalHome, finalDraw, finalAway, pBTTSH, pO25H } = dixonColesProbabilitiesLocal(tH, tA, league);
        const probArray = [
            { label: 'Local', value: finalHome, id: 'pHome', type: 'Resultado' },
            { label: 'Empate', value: finalDraw, id: 'pDraw', type: 'Resultado' },
            { label: 'Visitante', value: finalAway, id: 'pAway', type: 'Resultado' },
            { label: 'Ambos Anotan', value: pBTTSH, id: 'pBTTS', type: 'Mercado' },
            { label: 'Más de 2.5 goles', value: pO25H, id: 'pO25', type: 'Mercado' }
        ];

        probArray.forEach(p => {
            const el = $(p.id);
            if (el) el.textContent = formatPct(p.value);
        });

        const recommendations = probArray.filter(p => p.value >= 0.3)
                                       .sort((a, b) => b.value - a.value)
                                       .slice(0, 3);

        $('details').innerHTML = `<p><strong>Detalles del pronóstico (cálculo local):</strong></p>`;
        let suggestionHTML = recommendations.length > 0 ? '<ul>' : '<p>No se encontraron recomendaciones con probabilidad superior al 30%.</p>';
        recommendations.forEach((rec, index) => {
            suggestionHTML += `<li class="rec-item">
                <span class="rec-rank">${index + 1}.</span>
                <span class="rec-bet">${rec.label}</span>
                <span class="rec-prob">${formatPct(rec.value)}</span>
            </li>`;
        });
        if (recommendations.length > 0) suggestionHTML += '</ul>';
        $('suggestion').innerHTML = suggestionHTML;
    }
}

// ----------------------
// CÁLCULO LOCAL (FALLBACK)
// ----------------------
function dixonColesProbabilitiesLocal(tH, tA, league) {
    const rho = -0.11;
    const shrinkageFactor = 1.0;

    const teams = teamsByLeague[league];
    let totalGames = 0, totalGfHome = 0, totalGaHome = 0, totalGfAway = 0, totalGaAway = 0;
    teams.forEach(t => {
        totalGames += t.pj || 0;
        totalGfHome += t.gfHome || 0;
        totalGaHome += t.gaHome || 0;
        totalGfAway += t.gfAway || 0;
        totalGaAway += t.gaAway || 0;
    });

    const leagueAvgGfHome = totalGfHome / (totalGames || 1);
    const leagueAvgGaHome = totalGaHome / (totalGames || 1);
    const leagueAvgGfAway = totalGfAway / (totalGames || 1);
    const leagueAvgGaAway = totalGaAway / (totalGames || 1);

    const homeAttackRaw = (tH.gfHome || 0) / (tH.pjHome || 1);
    const homeDefenseRaw = (tH.gaHome || 0) / (tH.pjHome || 1);
    const awayAttackRaw = (tA.gfAway || 0) / (tA.pjAway || 1);
    const awayDefenseRaw = (tA.gaAway || 0) / (tA.pjAway || 1);

    const homeAttackAdj = (homeAttackRaw + (leagueAvgGfHome * shrinkageFactor)) / (1 + shrinkageFactor);
    const homeDefenseAdj = (homeDefenseRaw + (leagueAvgGaHome * shrinkageFactor)) / (1 + shrinkageFactor);
    const awayAttackAdj = (awayAttackRaw + (leagueAvgGfAway * shrinkageFactor)) / (1 + shrinkageFactor);
    const awayDefenseAdj = (awayDefenseRaw + (leagueAvgGaAway * shrinkageFactor)) / (1 + shrinkageFactor);

    const homeAttackStrength = homeAttackAdj / (leagueAvgGfHome || 1);
    const homeDefenseStrength = homeDefenseAdj / (leagueAvgGaHome || 1);
    const awayAttackStrength = awayAttackAdj / (leagueAvgGfAway || 1);
    const awayDefenseStrength = awayDefenseAdj / (leagueAvgGaAway || 1);

    const lambdaHome = homeAttackStrength * awayDefenseStrength * leagueAvgGfHome;
    const lambdaAway = awayAttackStrength * homeDefenseStrength * leagueAvgGfAway;

    const maxGoals = 6;
    let pHome = 0, pDraw = 0, pAway = 0, pBTTS = 0, pO25 = 0;

    for (let h = 0; h <= maxGoals; h++) {
        for (let a = 0; a <= maxGoals; a++) {
            let prob = poissonProbability(lambdaHome, h) * poissonProbability(lambdaAway, a);
            if (h === a) prob *= (1 + rho);

            if (h > a) pHome += prob;
            else if (h === a) pDraw += prob;
            else pAway += prob;

            if (h >= 1 && a >= 1) pBTTS += prob;
            if (h + a > 2) pO25 += prob;
        }
    }

    const total = pHome + pDraw + pAway;
    return {
        finalHome: total > 0 ? pHome / total : 0.33,
        finalDraw: total > 0 ? pDraw / total : 0.33,
        finalAway: total > 0 ? pAway / total : 0.33,
        pBTTSH: total > 0 ? pBTTS / total : 0,
        pO25H: total > 0 ? pO25 / total : 0,
        rho
    };
}

