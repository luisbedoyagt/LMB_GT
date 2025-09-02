// Variables globales y mapeo de ligas
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyhyoxXAt1eMt01tzaWG4GVJviJuMo_CK_U6loFEV84EPvdAuZEFYMw7maBfDij4P4Z/exec"; // Reemplaza con tu URL
let allData = {
    ligas: {},
    calendario: {}
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
// DOM HELPERS
// ----------------------
function $(id) {
    return document.getElementById(id);
}

// ----------------------
// DATA FETCHING
// ----------------------
async function fetchAllData() {
    try {
        const response = await fetch(`${WEBAPP_URL}?tipo=todo`);
        if (!response.ok) throw new Error("Error fetching data");
        allData = await response.json();
        populateLeagueSelect();
        console.log("Datos cargados correctamente:", allData);
    } catch (e) {
        console.error("No se pudieron cargar los datos:", e);
        const main = $('main-container');
        if (main) {
            main.innerHTML = '<div class="error"><strong>Error:</strong> No se pudo conectar con el servidor para obtener los datos. Por favor, inténtalo de nuevo más tarde.</div>';
        }
    }
}

// ----------------------
// UI POPULATION
// ----------------------
function populateLeagueSelect() {
    const leagueSelect = $('leagueSelect');
    if (!leagueSelect) return;
    for (const code in leagueCodeToName) {
        if (allData.ligas[code]) {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = leagueCodeToName[code].replace(/_/g, ' ');
            leagueSelect.appendChild(option);
        }
    }
    leagueSelect.addEventListener('change', (e) => {
        const leagueCode = e.target.value;
        populateTeamSelects(leagueCode);
        displaySelectedLeagueEvents(leagueCode);
        clearResults();
    });
}

function populateTeamSelects(leagueCode) {
    const teamHome = $('teamHome');
    const teamAway = $('teamAway');
    teamHome.innerHTML = '<option value="">Selecciona equipo local</option>';
    teamAway.innerHTML = '<option value="">Selecciona equipo visitante</option>';

    if (!leagueCode || !allData.ligas[leagueCode]) return;

    allData.ligas[leagueCode].forEach(team => {
        const option1 = document.createElement('option');
        option1.value = team.name;
        option1.textContent = team.name;
        teamHome.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = team.name;
        option2.textContent = team.name;
        teamAway.appendChild(option2);
    });

    teamHome.addEventListener('change', () => fillTeamData(teamHome.value, leagueCode, 'Home'));
    teamAway.addEventListener('change', () => fillTeamData(teamAway.value, leagueCode, 'Away'));
}

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
            const formattedDate = parsedDate.toLocaleDateString('es-ES', dateOptions);
            const formattedTime = parsedDate.toLocaleTimeString('es-ES', timeOptions);
            eventDateTime = `${formattedDate} ${formattedTime} (GT)`;
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
        
        div.addEventListener('click', () => {
            selectEvent(event.local, event.visitante);
        });
    });
}

function selectEvent(homeTeamName, awayTeamName) {
    const leagueCode = $('leagueSelect').value;
    const teamHomeSelect = $('teamHome');
    const teamAwaySelect = $('teamAway');
    
    let foundHome = false;
    for(let i = 0; i < teamHomeSelect.options.length; i++) {
        if(teamHomeSelect.options[i].text === homeTeamName) {
            teamHomeSelect.selectedIndex = i;
            foundHome = true;
            break;
        }
    }
    
    let foundAway = false;
    for(let i = 0; i < teamAwaySelect.options.length; i++) {
        if(teamAwaySelect.options[i].text === awayTeamName) {
            teamAwaySelect.selectedIndex = i;
            foundAway = true;
            break;
        }
    }
    
    if(foundHome && foundAway) {
        fillTeamData(homeTeamName, leagueCode, 'Home');
        fillTeamData(awayTeamName, leagueCode, 'Away');
        
        const ligaName = leagueCodeToName[leagueCode];
        const selectedEvent = (allData.calendario[ligaName] || []).find(e => e.local === homeTeamName && e.visitante === awayTeamName);
        const iaPrediction = selectedEvent?.pronostico || 'Pronóstico de la IA no disponible.';
        
        calculateAll(iaPrediction);
    } else {
        $('details').innerHTML = '<div class="error"><strong>Error:</strong> No se pudo encontrar uno o ambos equipos en la lista de la liga.</div>';
    }
}

function fillTeamData(teamName, leagueCode, type) {
    const teamData = findTeam(leagueCode, teamName);
    if (!teamData) {
        console.error(`Datos no encontrados para el equipo: ${teamName}`);
        return;
    }

    const card = $(`card-${type.toLowerCase()}`);
    if (card) {
        card.querySelector('.team-logo').src = teamData.logoUrl || 'https://via.placeholder.com/60?text=Logo';
        card.querySelector('.team-name').textContent = teamData.name;
        card.querySelector('#' + type.toLowerCase() + 'Rank').textContent = teamData.rank || 'N/A';
        card.querySelector('#' + type.toLowerCase() + 'Points').textContent = teamData.points || 'N/A';

        const stats = card.querySelectorAll('.stat-section');
        stats[0].querySelector('.stat-metrics span:nth-child(1)').textContent = teamData.wins || '0';
        stats[0].querySelector('.stat-metrics span:nth-child(2)').textContent = teamData.ties || '0';
        stats[0].querySelector('.stat-metrics span:nth-child(3)').textContent = teamData.losses || '0';
        
        stats[1].querySelector('.stat-metrics span:nth-child(1)').textContent = teamData.goalsFor || '0';
        stats[1].querySelector('.stat-metrics span:nth-child(2)').textContent = teamData.goalsAgainst || '0';
        stats[1].querySelector('.stat-metrics span:nth-child(3)').textContent = teamData.goalsDiff || '0';
        
        stats[2].querySelector('.stat-metrics span:nth-child(1)').textContent = teamData.gamesPlayedHome || '0';
        stats[2].querySelector('.stat-metrics span:nth-child(2)').textContent = teamData.winsHome || '0';
        stats[2].querySelector('.stat-metrics span:nth-child(3)').textContent = teamData.lossesHome || '0';
        
        stats[3].querySelector('.stat-metrics span:nth-child(1)').textContent = teamData.gamesPlayedAway || '0';
        stats[3].querySelector('.stat-metrics span:nth-child(2)').textContent = teamData.winsAway || '0';
        stats[3].querySelector('.stat-metrics span:nth-child(3)').textContent = teamData.lossesAway || '0';
    }
}

// ----------------------
// PREDICTION LOGIC
// ----------------------
function findTeam(leagueCode, teamName) {
    return allData.ligas[leagueCode]?.find(t => t.name === teamName);
}

// Factorial para el cálculo de Poisson
function factorial(n) {
    if (n < 0) return -1;
    if (n === 0) return 1;
    let result = 1;
    for (let i = 1; i <= n; i++) {
        result *= i;
    }
    return result;
}

// Distribución de Poisson
function poisson(lambda, k) {
    if (lambda < 0 || k < 0) return 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Función que implementa una versión simplificada del modelo Dixon-Coles.
 * Utiliza los datos de ataque/defensa de las tablas para un cálculo más preciso.
 * @param {object} teamHome - Datos del equipo local.
 * @param {object} teamAway - Datos del equipo visitante.
 * @param {string} league - Código de la liga.
 * @returns {object} Probabilidades de local, empate, visitante, BTTS y más de 2.5 goles.
 */
function dixonColesProbabilities(teamHome, teamAway, league) {
    const leagueData = allData.ligas[league];
    if (!leagueData || leagueData.length === 0) {
        return { finalHome: 0, finalDraw: 0, finalAway: 0, pBTTSH: 0, pO25H: 0 };
    }

    // Calcula el promedio de goles de la liga
    const totalGoalsFor = leagueData.reduce((sum, team) => sum + (team.goalsFor || 0), 0);
    const totalGamesPlayed = leagueData.reduce((sum, team) => sum + (team.gamesPlayed || 0), 0);
    const lambdaLeague = totalGamesPlayed > 0 ? totalGoalsFor / totalGamesPlayed : 0.9;
    
    // Calcula los factores de ataque y defensa (ajustados a la liga)
    const attackHome = (teamHome.goalsFor || 0) / (teamHome.gamesPlayed || 1) / lambdaLeague;
    const defenseHome = (teamHome.goalsAgainst || 0) / (teamHome.gamesPlayed || 1) / lambdaLeague;
    const attackAway = (teamAway.goalsFor || 0) / (teamAway.gamesPlayed || 1) / lambdaLeague;
    const defenseAway = (teamAway.goalsAgainst || 0) / (teamAway.gamesPlayed || 1) / lambdaLeague;

    // Ajuste por la ventaja de local
    const lambdaHome = attackHome * defenseAway * 1.3; // Factor de local
    const lambdaAway = attackAway * defenseHome * 0.9;  // Factor de visitante
    
    // Matriz de probabilidades de goles
    let probMatrix = Array(5).fill(null).map(() => Array(5).fill(0));
    let finalHome = 0;
    let finalDraw = 0;
    let finalAway = 0;
    let pBTTS = 0;
    let pO25 = 0;

    for (let i = 0; i < 5; i++) { // Goles Local
        for (let j = 0; j < 5; j++) { // Goles Visitante
            const p = poisson(lambdaHome, i) * poisson(lambdaAway, j);
            probMatrix[i][j] = p;

            if (i > j) finalHome += p;
            else if (i < j) finalAway += p;
            else finalDraw += p;
            
            if (i > 0 && j > 0) pBTTS += p;
            if (i + j > 2.5) pO25 += p;
        }
    }
    
    return {
        finalHome,
        finalDraw,
        finalAway,
        pBTTSH: pBTTS,
        pO25H: pO25
    };
}

// CÁLCULO PRINCIPAL
function calculateAll(iaPrediction = null) {
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

    const { finalHome, finalDraw, finalAway, pBTTSH, pO25H } = dixonColesProbabilities(tH, tA, league);

    const probabilities = [
        { label: 'Victoria Local', value: finalHome, id: 'pHome', type: 'Resultado' },
        { label: 'Empate', value: finalDraw, id: 'pDraw', type: 'Resultado' },
        { label: 'Victoria Visitante', value: finalAway, id: 'pAway', type: 'Resultado' },
        { label: 'Ambos Anotan', value: pBTTSH, id: 'pBTTS', type: 'Mercado' },
        { label: 'Más de 2.5 goles', value: pO25H, id: 'pO25', type: 'Mercado' }
    ];

    probabilities.forEach(p => {
        const el = $(p.id);
        if (el) el.textContent = formatPct(p.value);
    });

    const recommendations = probabilities.filter(p => p.value >= 0.3)
                                          .sort((a, b) => b.value - a.value)
                                          .slice(0, 3);
    
    $('details').innerHTML = `<p><strong>Detalles del pronóstico:</strong></p>`;

    if (iaPrediction) {
        const iaSection = document.createElement('div');
        iaSection.className = 'ia-prediction-section';
        iaSection.innerHTML = `<h4 class="rec-title">Pronóstico de la IA</h4><p id="iaPredictionText">${iaPrediction}</p>`;
        $('details').appendChild(iaSection);
    }
    
    let suggestionHTML = '<h4 class="rec-title">Nuestras Recomendaciones (Modelo)</h4><ul>';
    if (recommendations.length > 0) {
        recommendations.forEach((rec, index) => {
            const rank = index + 1;
            suggestionHTML += `<li class="rec-item">
                                    <span class="rec-rank">${rank}.</span>
                                    <span class="rec-bet">${rec.label}</span>
                                    <span class="rec-prob">${formatPct(rec.value)}</span>
                                  </li>`;
        });
        suggestionHTML += '</ul>';
        $('suggestion').innerHTML = suggestionHTML;
    } else {
        $('suggestion').innerHTML = '<p>No se encontraron recomendaciones con una probabilidad superior al 30%. Analiza otros mercados.</p>';
    }
}

// ----------------------
// UTILS
// ----------------------
function formatPct(value) {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return (value * 100).toFixed(1) + '%';
}

function clearResults() {
    $('iaPredictionText').textContent = 'Esperando pronóstico...';
    $('pHome').textContent = 'N/A';
    $('pDraw').textContent = 'N/A';
    $('pAway').textContent = 'N/A';
    $('pBTTS').textContent = 'N/A';
    $('pO25').textContent = 'N/A';
    $('suggestion').innerHTML = '<p>Esperando datos...</p>';
}

// ----------------------
// INITIALIZATION
// ----------------------
document.addEventListener('DOMContentLoaded', () => {
    fetchAllData();
});


