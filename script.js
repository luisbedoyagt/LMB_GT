// =====================
// CONFIGURACIÓN Y CONSTANTES
// =====================
const CONFIG = {
    HOME_ADVANTAGE: 1.25,
    LEAGUE_AVERAGE: 1.35,
    TAU_DIXON_COLES: 0.85,
    MAX_GOALS: 12,
    CONFIDENCE_THRESHOLDS: {
        HIGH: 0.60,
        MEDIUM: 0.50,
        LOW: 0.40
    },
    WEBAPP_URL: "https://script.google.com/macros/s/AKfycbyDj8aHyA3vLiFQZxIDNYS4b8XaDeApI8_PlZc3deFtwyj0Fj7SHgwngUVlqc8_xoBdEw/exec"
};

const LEAGUE_NAMES = {
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

// =====================
// UTILIDADES OPTIMIZADAS
// =====================
const $ = id => document.getElementById(id);
const formatPct = x => (100 * Math.max(0, Math.min(1, x || 0))).toFixed(1) + '%';
const formatDec = x => (x || 0).toFixed(2);
const safeNumber = val => Math.max(0, parseFloat(val) || 0);
const parseNumberString = val => {
    const s = String(val || '').replace(/,/g, '.');
    const n = Number(s);
    return isFinite(n) && n >= 0 ? n : 0;
};

// Cache mejorado para factorial
const factorialMemo = new Map([[0, 1], [1, 1]]);
const factorial = n => {
    if (n < 0) return 0;
    if (factorialMemo.has(n)) return factorialMemo.get(n);
    const result = n * factorial(n - 1);
    factorialMemo.set(n, result);
    return result;
};

// =====================
// MODELOS ESTADÍSTICOS
// =====================
class PoissonModel {
    static probability(lambda, k) {
        if (lambda <= 0 || k < 0) return 0;
        try {
            return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
        } catch (e) {
            console.warn(`Error en Poisson: lambda=${lambda}, k=${k}`, e);
            return 0;
        }
    }
}

class DixonColesModel {
    static adjustment(lambdaH, lambdaA, h, a, tau = CONFIG.TAU_DIXON_COLES) {
        const rho = this.calculateRho(lambdaH, lambdaA);
        
        // Ajustes específicos para resultados bajos (clave en Dixon-Coles)
        if (h <= 1 && a <= 1) {
            const adjustments = {
                '0-0': 1 - lambdaH * lambdaA * rho,
                '0-1': 1 + lambdaH * rho,
                '1-0': 1 + lambdaA * rho,
                '1-1': 1 - rho
            };
            
            const factor = adjustments[`${h}-${a}`] || 1;
            return Math.max(0, factor * 
                   PoissonModel.probability(lambdaH, h) * 
                   PoissonModel.probability(lambdaA, a));
        }
        
        return PoissonModel.probability(lambdaH, h) * 
               PoissonModel.probability(lambdaA, a);
    }

    static calculateRho(lambdaH, lambdaA) {
        // Correlación negativa típica en fútbol (goles tienden a ser mutuamente excluyentes)
        const avgLambda = (lambdaH + lambdaA) / 2;
        return -0.15 * Math.min(lambdaH, lambdaA) / Math.max(avgLambda, 1);
    }
}

// =====================
// GESTIÓN DE DATOS DE EQUIPOS
// =====================
class TeamDataManager {
    constructor() {
        this.teamsByLeague = {};
        this.calendarData = {};
    }

    normalizeTeam(raw) {
        if (!raw) return null;
        
        const team = {
            name: raw.name || '',
            pos: parseNumberString(raw.rank || 0),
            gf: parseNumberString(raw.goalsFor || 0),
            ga: parseNumberString(raw.goalsAgainst || 0),
            pj: parseNumberString(raw.gamesPlayed || 0),
            g: parseNumberString(raw.wins || 0),
            e: parseNumberString(raw.ties || 0),
            p: parseNumberString(raw.losses || 0),
            points: parseNumberString(raw.points || 0),
            gfHome: parseNumberString(raw.goalsForHome || 0),
            gfAway: parseNumberString(raw.goalsForAway || 0),
            gaHome: parseNumberString(raw.goalsAgainstHome || 0),
            gaAway: parseNumberString(raw.goalsAgainstAway || 0),
            pjHome: parseNumberString(raw.gamesPlayedHome || 0),
            pjAway: parseNumberString(raw.gamesPlayedAway || 0),
            winsHome: parseNumberString(raw.winsHome || 0),
            winsAway: parseNumberString(raw.winsAway || 0),
            logoUrl: raw.logoUrl || ''
        };

        // Validar que el equipo tenga datos mínimos
        return team.name && team.pj > 0 ? team : null;
    }

    async fetchTeams() {
        try {
            const response = await fetch(CONFIG.WEBAPP_URL);
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Datos recibidos:', data);

            // Procesar ligas
            const normalized = {};
            for (const key in data.ligas) {
                normalized[key] = (data.ligas[key] || [])
                    .map(team => this.normalizeTeam(team))
                    .filter(team => team !== null);
            }
            
            this.teamsByLeague = normalized;
            this.calendarData = {
                calendario: data.calendario || {},
                partidosFuturos: data.partidosFuturos || []
            };

            // Guardar en storage temporal (solo para la sesión)
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('teamsByLeague', JSON.stringify(normalized));
            }

            return normalized;
            
        } catch (error) {
            console.error('Error en fetchTeams:', error);
            throw new Error(`No se pudieron cargar los datos: ${error.message}`);
        }
    }

    findTeam(leagueCode, teamName) {
        if (!this.teamsByLeague[leagueCode]) return null;
        return this.teamsByLeague[leagueCode].find(t => 
            t.name.toLowerCase() === teamName.toLowerCase()
        ) || null;
    }
}

// =====================
// CALCULADORA PRINCIPAL MEJORADA
// =====================
class MatchCalculator {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.results = {};
    }

    validateInputs() {
        const getValue = id => $(id)?.value?.trim() || '';
        
        const data = {
            homeTeam: getValue('homeTeam'),
            awayTeam: getValue('awayTeam'),
            homeAttack: safeNumber(getValue('homeAttack')),
            homeDefense: safeNumber(getValue('homeDefense')),
            awayAttack: safeNumber(getValue('awayAttack')),
            awayDefense: safeNumber(getValue('awayDefense')),
            homeWinRate: safeNumber(getValue('homeWinRate')),
            awayWinRate: safeNumber(getValue('awayWinRate'))
        };

        // Validaciones
        if (!data.homeTeam || !data.awayTeam) {
            throw new Error('Debes ingresar los nombres de ambos equipos');
        }
        
        if (data.homeTeam.toLowerCase() === data.awayTeam.toLowerCase()) {
            throw new Error('Los equipos no pueden ser iguales');
        }

        if (data.homeAttack <= 0 || data.awayAttack <= 0) {
            throw new Error('Los goles a favor deben ser mayores a 0');
        }

        return data;
    }

    calculateLambdas(data) {
        // Método mejorado considerando calidad defensiva del oponente
        const homeOffensiveStrength = data.homeAttack / CONFIG.LEAGUE_AVERAGE;
        const awayDefensiveWeakness = Math.max(data.awayDefense, 0.1) / CONFIG.LEAGUE_AVERAGE;
        
        const awayOffensiveStrength = data.awayAttack / CONFIG.LEAGUE_AVERAGE;
        const homeDefensiveWeakness = Math.max(data.homeDefense, 0.1) / CONFIG.LEAGUE_AVERAGE;

        // Factores de ajuste adicionales
        const homeFormFactor = Math.min(2.0, Math.max(0.5, data.homeWinRate / 50)); // Normalizar win rate
        const awayFormFactor = Math.min(2.0, Math.max(0.5, data.awayWinRate / 50));

        const lambdaHome = homeOffensiveStrength * 
                          awayDefensiveWeakness * 
                          CONFIG.HOME_ADVANTAGE * 
                          CONFIG.LEAGUE_AVERAGE *
                          homeFormFactor;
        
        const lambdaAway = awayOffensiveStrength * 
                          homeDefensiveWeakness * 
                          CONFIG.LEAGUE_AVERAGE *
                          awayFormFactor;

        return { 
            home: Math.max(0.1, Math.min(6.0, lambdaHome)), // Límites realistas
            away: Math.max(0.1, Math.min(6.0, lambdaAway))
        };
    }

    calculateProbabilities(lambdas) {
        const probs = {
            homeWin: 0, draw: 0, awayWin: 0,
            btts: 0, over25: 0, under25: 0,
            over15: 0, over35: 0,
            totalProb: 0
        };

        // Usar Dixon-Coles para mayor precisión
        for (let h = 0; h <= CONFIG.MAX_GOALS; h++) {
            for (let a = 0; a <= CONFIG.MAX_GOALS; a++) {
                const prob = DixonColesModel.adjustment(lambdas.home, lambdas.away, h, a);
                
                // Resultados principales
                if (h > a) probs.homeWin += prob;
                else if (h === a) probs.draw += prob;
                else probs.awayWin += prob;

                // Mercados de goles
                if (h >= 1 && a >= 1) probs.btts += prob;
                
                const totalGoals = h + a;
                if (totalGoals > 2.5) probs.over25 += prob;
                if (totalGoals < 2.5) probs.under25 += prob;
                if (totalGoals > 1.5) probs.over15 += prob;
                if (totalGoals > 3.5) probs.over35 += prob;
                
                probs.totalProb += prob;
            }
        }

        // Normalizar probabilidades
        if (probs.totalProb > 0) {
            Object.keys(probs).forEach(key => {
                if (key !== 'totalProb') {
                    probs[key] = probs[key] / probs.totalProb;
                }
            });
        }

        return probs;
    }

    calculateMostLikelyScores(lambdas, topN = 5) {
        const scores = [];
        
        for (let h = 0; h <= 5; h++) {
            for (let a = 0; a <= 5; a++) {
                const prob = DixonColesModel.adjustment(lambdas.home, lambdas.away, h, a);
                scores.push({ home: h, away: a, probability: prob });
            }
        }

        return scores
            .sort((a, b) => b.probability - a.probability)
            .slice(0, topN);
    }

    generateRecommendations(data, probs, lambdas) {
        const bets = [
            { 
                name: `${data.homeTeam} gana`, 
                prob: probs.homeWin, 
                type: 'result',
                description: 'Victoria del equipo local'
            },
            { 
                name: 'Empate', 
                prob: probs.draw, 
                type: 'result',
                description: 'Resultado de empate'
            },
            { 
                name: `${data.awayTeam} gana`, 
                prob: probs.awayWin, 
                type: 'result',
                description: 'Victoria del equipo visitante'
            },
            { 
                name: 'Ambos anotan', 
                prob: probs.btts, 
                type: 'goals',
                description: 'Ambos equipos marcan al menos 1 gol'
            },
            { 
                name: 'Más de 2.5 goles', 
                prob: probs.over25, 
                type: 'goals',
                description: 'Total de goles mayor a 2.5'
            },
            { 
                name: 'Más de 1.5 goles', 
                prob: probs.over15, 
                type: 'goals',
                description: 'Total de goles mayor a 1.5'
            },
            { 
                name: 'Más de 3.5 goles', 
                prob: probs.over35, 
                type: 'goals',
                description: 'Total de goles mayor a 3.5'
            }
        ];

        const getConfidence = prob => {
            if (prob >= CONFIG.CONFIDENCE_THRESHOLDS.HIGH) return { level: 'high', text: 'Alta' };
            if (prob >= CONFIG.CONFIDENCE_THRESHOLDS.MEDIUM) return { level: 'medium', text: 'Media' };
            return { level: 'low', text: 'Baja' };
        };

        // Agregar análisis de valor
        const addValueAnalysis = bet => {
            const confidence = getConfidence(bet.prob);
            const impliedOdds = 1 / bet.prob;
            
            return {
                ...bet,
                confidence: confidence.level,
                confidenceText: confidence.text,
                impliedOdds: impliedOdds.toFixed(2),
                value: bet.prob >= 0.35 ? 'good' : 'poor'
            };
        };

        return bets
            .map(addValueAnalysis)
            .filter(bet => bet.prob >= 0.25) // Filtro más permisivo
            .sort((a, b) => b.prob - a.prob);
    }

    calculateAdvancedMetrics(data, lambdas, probs) {
        const expectedGoals = lambdas.home + lambdas.away;
        const homeAdvantageEffect = (probs.homeWin - probs.awayWin) * 100;
        const attackVsDefense = {
            home: data.homeAttack / Math.max(data.homeDefense, 0.1),
            away: data.awayAttack / Math.max(data.awayDefense, 0.1)
        };

        return {
            expectedGoals: expectedGoals.toFixed(2),
            homeAdvantageEffect: homeAdvantageEffect.toFixed(1),
            balanceHome: attackVsDefense.home.toFixed(2),
            balanceAway: attackVsDefense.away.toFixed(2),
            gameStyle: expectedGoals > 3.0 ? 'Ofensivo' : expectedGoals < 2.0 ? 'Defensivo' : 'Equilibrado'
        };
    }

    calculate(inputData = null) {
        try {
            const data = inputData || this.validateInputs();
            const lambdas = this.calculateLambdas(data);
            const probs = this.calculateProbabilities(lambdas);
            const recommendations = this.generateRecommendations(data, probs, lambdas);
            const mostLikelyScores = this.calculateMostLikelyScores(lambdas);
            const advancedMetrics = this.calculateAdvancedMetrics(data, lambdas, probs);

            this.results = { 
                data, 
                lambdas, 
                probs, 
                recommendations, 
                mostLikelyScores,
                advancedMetrics
            };

            return this.results;
            
        } catch (error) {
            console.error('Error en cálculo:', error);
            throw error;
        }
    }

    // Método para análisis rápido (sin DOM)
    quickAnalysis(homeTeam, homeAttack, homeDefense, homeWinRate, awayTeam, awayAttack, awayDefense, awayWinRate) {
        const data = {
            homeTeam,
            awayTeam,
            homeAttack: safeNumber(homeAttack),
            homeDefense: safeNumber(homeDefense),
            awayAttack: safeNumber(awayAttack),
            awayDefense: safeNumber(awayDefense),
            homeWinRate: safeNumber(homeWinRate),
            awayWinRate: safeNumber(awayWinRate)
        };

        return this.calculate(data);
    }
}

// =====================
// GESTIÓN DE UI MEJORADA
// =====================
class UIManager {
    constructor(calculator, dataManager) {
        this.calculator = calculator;
        this.dataManager = dataManager;
        this.isCalculating = false;
    }

    async init() {
        try {
            await this.dataManager.fetchTeams();
            this.setupEventListeners();
            this.populateLeagueSelect();
            this.clearAll();
        } catch (error) {
            this.showError(`Error de inicialización: ${error.message}`);
        }
    }

    setupEventListeners() {
        const elements = {
            leagueSelect: $('leagueSelect'),
            teamHome: $('teamHome'),
            teamAway: $('teamAway'),
            recalcBtn: $('recalc'),
            resetBtn: $('reset')
        };

        // Verificar que los elementos existan
        Object.entries(elements).forEach(([key, el]) => {
            if (!el) console.warn(`Elemento ${key} no encontrado`);
        });

        if (elements.leagueSelect) {
            elements.leagueSelect.addEventListener('change', () => this.onLeagueChange());
        }

        if (elements.teamHome) {
            elements.teamHome.addEventListener('change', () => {
                this.fillTeamData(elements.teamHome.value, elements.leagueSelect.value, 'Home');
                this.updateCalculateButton();
            });
        }

        if (elements.teamAway) {
            elements.teamAway.addEventListener('change', () => {
                this.fillTeamData(elements.teamAway.value, elements.leagueSelect.value, 'Away');
                this.updateCalculateButton();
            });
        }

        if (elements.recalcBtn) {
            elements.recalcBtn.addEventListener('click', () => this.calculateMatch());
        }

        if (elements.resetBtn) {
            elements.resetBtn.addEventListener('click', () => this.clearAll());
        }
    }

    populateLeagueSelect() {
        const select = $('leagueSelect');
        if (!select) return;

        select.innerHTML = '<option value="">-- Selecciona liga --</option>';
        
        Object.keys(this.dataManager.teamsByLeague)
            .sort()
            .forEach(code => {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = LEAGUE_NAMES[code] || code;
                select.appendChild(option);
            });
    }

    onLeagueChange() {
        const leagueCode = $('leagueSelect')?.value;
        const teamHomeSelect = $('teamHome');
        const teamAwaySelect = $('teamAway');

        if (!teamHomeSelect || !teamAwaySelect) return;

        if (!leagueCode || !this.dataManager.teamsByLeague[leagueCode]) {
            this.clearTeamSelects();
            return;
        }

        const teams = this.dataManager.teamsByLeague[leagueCode];
        const createOption = (text, value = text) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            return option;
        };

        // Poblar selects de equipos
        [teamHomeSelect, teamAwaySelect].forEach(select => {
            select.innerHTML = '';
            select.appendChild(createOption('-- Selecciona equipo --', ''));
            teams.forEach(team => {
                select.appendChild(createOption(team.name));
            });
        });

        this.clearTeamData();
        this.updateCalculateButton();
    }

    fillTeamData(teamName, leagueCode, type) {
        if (!teamName || !leagueCode) return;

        const team = this.dataManager.findTeam(leagueCode, teamName);
        if (!team) {
            this.showError(`Equipo ${teamName} no encontrado en la liga seleccionada`);
            return;
        }

        const isHome = type === 'Home';
        const gfAvg = isHome ? 
            (team.pjHome > 0 ? team.gfHome / team.pjHome : team.gf / Math.max(team.pj, 1)) :
            (team.pjAway > 0 ? team.gfAway / team.pjAway : team.gf / Math.max(team.pj, 1));
        
        const gaAvg = isHome ?
            (team.pjHome > 0 ? team.gaHome / team.pjHome : team.ga / Math.max(team.pj, 1)) :
            (team.pjAway > 0 ? team.gaAway / team.pjAway : team.ga / Math.max(team.pj, 1));

        const winRate = isHome ?
            (team.pjHome > 0 ? (team.winsHome / team.pjHome) * 100 : 0) :
            (team.pjAway > 0 ? (team.winsAway / team.pjAway) * 100 : 0);

        // Llenar campos automáticamente
        const prefix = isHome ? 'home' : 'away';
        const elements = {
            [`${prefix}Attack`]: gfAvg,
            [`${prefix}Defense`]: gaAvg,
            [`${prefix}WinRate`]: winRate
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = $(id);
            if (element) element.value = formatDec(value);
        });

        this.updateTeamDisplay(team, type);
    }

    updateTeamDisplay(team, type) {
        const isHome = type === 'Home';
        const boxId = isHome ? 'formHomeBox' : 'formAwayBox';
        const teamLabelId = isHome ? 'formHomeTeam' : 'formAwayTeam';
        
        const box = $(boxId);
        const teamLabel = $(teamLabelId);

        if (box) {
            const dg = team.gf - team.ga;
            const dgHome = team.gfHome - team.gaHome;
            const dgAway = team.gfAway - team.gaAway;

            box.innerHTML = `
                <div class="stat-section">
                    <span class="section-title">Rendimiento General</span>
                    <div class="stat-metrics">
                        <span>PJ: ${team.pj}</span>
                        <span>Puntos: ${team.points}</span>
                        <span>DG: ${dg >= 0 ? '+' : ''}${dg}</span>
                    </div>
                </div>
                <div class="stat-section">
                    <span class="section-title">Rendimiento Local</span>
                    <div class="stat-metrics">
                        <span>PJ: ${team.pjHome}</span>
                        <span>PG: ${team.winsHome}</span>
                        <span>DG: ${dgHome >= 0 ? '+' : ''}${dgHome}</span>
                    </div>
                </div>
                <div class="stat-section">
                    <span class="section-title">Rendimiento Visitante</span>
                    <div class="stat-metrics">
                        <span>PJ: ${team.pjAway}</span>
                        <span>PG: ${team.winsAway}</span>
                        <span>DG: ${dgAway >= 0 ? '+' : ''}${dgAway}</span>
                    </div>
                </div>
            `;
        }

        if (teamLabel) {
            const logoHtml = team.logoUrl ? 
                `<img src="${team.logoUrl}" alt="${team.name} logo" class="team-logo">` : '';
            teamLabel.innerHTML = `${logoHtml}${isHome ? 'Local' : 'Visitante'}: ${team.name}`;
        }
    }

    async calculateMatch() {
        if (this.isCalculating) return;
        
        this.isCalculating = true;
        const calcBtn = $('recalc');
        if (calcBtn) {
            calcBtn.textContent = 'Calculando...';
            calcBtn.disabled = true;
        }

        try {
            const results = this.calculator.calculate();
            this.renderResults(results);
            this.showSuccess('Cálculo completado exitosamente');
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.isCalculating = false;
            if (calcBtn) {
                calcBtn.textContent = '🧮 Calcular Probabilidades';
                calcBtn.disabled = false;
            }
        }
    }

    renderResults(results) {
        const { data, lambdas, probs, recommendations, mostLikelyScores, advancedMetrics } = results;

        // Actualizar elementos principales
        const updates = {
            'pHome': formatPct(probs.homeWin),
            'pDraw': formatPct(probs.draw), 
            'pAway': formatPct(probs.awayWin),
            'pBTTS': formatPct(probs.btts),
            'pO25': formatPct(probs.over25),
            'lambdaHome': formatDec(lambdas.home),
            'lambdaAway': formatDec(lambdas.away),
            'homeAdvantage': formatDec(CONFIG.HOME_ADVANTAGE),
            'expectedGoals': advancedMetrics.expectedGoals
        };

        Object.entries(updates).forEach(([id, value]) => {
            const element = $(id);
            if (element) element.textContent = value;
        });

        this.renderRecommendations(recommendations);
        this.renderMostLikelyScores(mostLikelyScores, data);
    }

    renderRecommendations(recommendations) {
        const container = $('suggestion');
        if (!container) return;

        if (recommendations.length === 0) {
            container.innerHTML = '<p>No hay recomendaciones claras para este partido.</p>';
            return;
        }

        const bestBet = recommendations[0];
        let html = `
            <div class="main-recommendation">
                <span class="star">★</span>
                <span class="main-bet">
                    🏆 <strong>${bestBet.name}</strong> (${formatPct(bestBet.prob)})
                    <span class="confidence ${bestBet.confidence}">${bestBet.confidenceText}</span>
                </span>
            </div>
        `;

        if (recommendations.length > 1) {
            html += '<div class="other-bets"><h5>Otras oportunidades:</h5><ul>';
            recommendations.slice(1).forEach(rec => {
                html += `
                    <li>
                        ${rec.name}: ${formatPct(rec.prob)} 
                        <span class="confidence ${rec.confidence}">${rec.confidenceText}</span>
                    </li>
                `;
            });
            html += '</ul></div>';
        }

        container.innerHTML = html;
    }

    renderMostLikelyScores(scores, data) {
        const container = $('mostLikelyScores');
        if (!container) return;

        let html = '<h5>Resultados más probables:</h5><ol>';
        scores.forEach((score, index) => {
            const percentage = formatPct(score.probability);
            html += `<li>${data.homeTeam} ${score.home} - ${score.away} ${data.awayTeam} (${percentage})</li>`;
        });
        html += '</ol>';

        container.innerHTML = html;
    }

    clearTeamSelects() {
        ['teamHome', 'teamAway'].forEach(id => {
            const select = $(id);
            if (select) {
                select.innerHTML = '<option value="">-- Selecciona equipo --</option>';
            }
        });
    }

    clearTeamData() {
        ['Home', 'Away'].forEach(type => {
            const boxId = type === 'Home' ? 'formHomeBox' : 'formAwayBox';
            const teamId = type === 'Home' ? 'formHomeTeam' : 'formAwayTeam';
            
            const box = $(boxId);
            const teamLabel = $(teamId);
            
            if (box) {
                box.innerHTML = `
                    <div class="stat-section">
                        <span class="section-title">Rendimiento General</span>
                        <div class="stat-metrics">
                            <span>PJ: 0</span>
                            <span>Puntos: 0</span>
                            <span>DG: 0</span>
                        </div>
                    </div>
                    <div class="stat-section">
                        <span class="section-title">Rendimiento de Local</span>
                        <div class="stat-metrics">
                            <span>PJ: 0</span>
                            <span>PG: 0</span>
                            <span>DG: 0</span>
                        </div>
                    </div>
                    <div class="stat-section">
                        <span class="section-title">Rendimiento de Visitante</span>
                        <div class="stat-metrics">
                            <span>PJ: 0</span>
                            <span>PG: 0</span>
                            <span>DG: 0</span>
                        </div>
                    </div>
                `;
            }
            
            if (teamLabel) {
                teamLabel.innerHTML = type === 'Home' ? 'Local: —' : 'Visitante: —';
            }
        });

        // Limpiar campos de entrada
        ['homeAttack', 'homeDefense', 'homeWinRate', 'awayAttack', 'awayDefense', 'awayWinRate'].forEach(id => {
            const element = $(id);
            if (element) element.value = '';
        });
    }

    clearAll() {
        // Limpiar selects
        const leagueSelect = $('leagueSelect');
        if (leagueSelect) leagueSelect.selectedIndex = 0;
        
        this.clearTeamSelects();
        this.clearTeamData();

        // Limpiar resultados
        ['pHome', 'pDraw', 'pAway', 'pBTTS', 'pO25', 'lambdaHome', 'lambdaAway', 'homeAdvantage', 'expectedGoals'].forEach(id => {
            const element = $(id);
            if (element) element.textContent = '—';
        });

        const containers = ['details', 'suggestion', 'mostLikelyScores'];
        containers.forEach(id => {
            const element = $(id);
            if (element) element.innerHTML = '';
        });

        this.updateCalculateButton();
    }

    updateCalculateButton() {
        const button = $('recalc');
        if (!button) return;

        const hasRequiredData = ['homeTeam', 'awayTeam', 'homeAttack', 'awayAttack'].every(id => {
            const el = $(id);
            return el && el.value.trim();
        });

        button.disabled = !hasRequiredData || this.isCalculating;
    }

    showError(message) {
        this.clearMessages();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'warning';
        errorDiv.innerHTML = `<strong>⚠️ Error:</strong> ${message}`;
        
        const container = $('details') || document.querySelector('.main-content');
        if (container) {
            container.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 5000);
        }
    }

    showSuccess(message) {
        this.clearMessages();
        const successDiv = document.createElement('div');
        successDiv.className = 'success';
        successDiv.style.cssText = 'background: #dcfce7; color: #166534; padding: 15px; border-radius: 8px; margin: 10px 0;';
        successDiv.innerHTML = `<strong>✅ Éxito:</strong> ${message}`;
        
        const container = $('details') || document.querySelector('.main-content');
        if (container) {
            container.appendChild(successDiv);
            setTimeout(() => successDiv.remove(), 3000);
        }
    }

    clearMessages() {
        document.querySelectorAll('.warning, .success').forEach(el => el.remove());
    }

    renderMatches() {
        const matchesList = $('matchesList');
        const noMatches = $('noMatches');
        
        if (!matchesList || !this.dataManager.calendarData.partidosFuturos) return;

        const matches = this.dataManager.calendarData.partidosFuturos;
        matchesList.innerHTML = '';

        if (matches.length === 0) {
            if (noMatches) noMatches.style.display = 'block';
            return;
        }

        if (noMatches) noMatches.style.display = 'none';

        matches.forEach(match => {
            const matchDiv = document.createElement('div');
            matchDiv.className = 'match-item';
            matchDiv.innerHTML = `
                <div class="match-liga">${(match.liga || '').replace(/_/g, ' ')}</div>
                <div class="match-teams">${match.local} vs ${match.visitante}</div>
                <div class="match-details">
                    <span>⏰ ${match.hora}</span>
                    <span>🏟️ ${match.estadio}</span>
                </div>
            `;
            matchesList.appendChild(matchDiv);
        });
    }
}

// =====================
// FUNCIONES GLOBALES DE COMPATIBILIDAD
// =====================
let teamDataManager, matchCalculator, uiManager;

// Función global para mantener compatibilidad
function calculateAll() {
    if (uiManager) {
        uiManager.calculateMatch();
    } else {
        console.error('UI Manager no inicializado');
    }
}

// Función de cálculo rápido (para uso programático)
function quickCalculate(homeTeam, homeAttack, homeDefense, homeWinRate, awayTeam, awayAttack, awayDefense, awayWinRate) {
    if (!matchCalculator) {
        console.error('Calculator no inicializado');
        return null;
    }
    
    try {
        return matchCalculator.quickAnalysis(
            homeTeam, homeAttack, homeDefense, homeWinRate,
            awayTeam, awayAttack, awayDefense, awayWinRate
        );
    } catch (error) {
        console.error('Error en cálculo rápido:', error);
        return null;
    }
}

// Función para exportar resultados
function exportResults() {
    if (!matchCalculator.results || !matchCalculator.results.data) {
        console.warn('No hay resultados para exportar');
        return null;
    }

    const { data, probs, lambdas, advancedMetrics } = matchCalculator.results;
    
    return {
        partido: `${data.homeTeam} vs ${data.awayTeam}`,
        fecha: new Date().toISOString().split('T')[0],
        probabilidades: {
            victoria_local: formatPct(probs.homeWin),
            empate: formatPct(probs.draw),
            victoria_visitante: formatPct(probs.awayWin),
            ambos_anotan: formatPct(probs.btts),
            mas_25_goles: formatPct(probs.over25)
        },
        parametros_modelo: {
            lambda_local: formatDec(lambdas.home),
            lambda_visitante: formatDec(lambdas.away),
            goles_esperados: advancedMetrics.expectedGoals,
            ventaja_local: formatDec(CONFIG.HOME_ADVANTAGE)
        },
        metricas_avanzadas: advancedMetrics
    };
}

// =====================
// INICIALIZACIÓN MEJORADA
// =====================
async function init() {
    try {
        // Inicializar componentes
        teamDataManager = new TeamDataManager();
        matchCalculator = new MatchCalculator(teamDataManager);
        uiManager = new UIManager(matchCalculator, teamDataManager);
        
        // Inicializar UI
        await uiManager.init();
        
        console.log('✅ Sistema inicializado correctamente');
        
    } catch (error) {
        console.error('❌ Error en inicialización:', error);
        const container = document.querySelector('.main-content') || document.body;
        container.innerHTML = `
            <div style="background: #fee2e2; color: #991b1b; padding: 20px; border-radius: 8px; margin: 20px;">
                <h3>Error de Inicialización</h3>
                <p>No se pudo inicializar la aplicación: ${error.message}</p>
                <button onclick="location.reload()">🔄 Reintentar</button>
            </div>
        `;
    }
}

// =====================
// FUNCIONES DE UTILIDAD ADICIONALES
// =====================

// Función para validar datos de entrada
function validateMatchData(data) {
    const validations = [
        { field: 'homeAttack', min: 0, max: 10, message: 'Goles a favor debe estar entre 0 y 10' },
        { field: 'homeDefense', min: 0, max: 10, message: 'Goles en contra debe estar entre 0 y 10' },
        { field: 'awayAttack', min: 0, max: 10, message: 'Goles a favor debe estar entre 0 y 10' },
        { field: 'awayDefense', min: 0, max: 10, message: 'Goles en contra debe estar entre 0 y 10' },
        { field: 'homeWinRate', min: 0, max: 100, message: 'Win rate debe estar entre 0% y 100%' },
        { field: 'awayWinRate', min: 0, max: 100, message: 'Win rate debe estar entre 0% y 100%' }
    ];

    for (const validation of validations) {
        const value = data[validation.field];
        if (value < validation.min || value > validation.max) {
            throw new Error(`${validation.message} (valor: ${value})`);
        }
    }

    return true;
}

// Función para análisis comparativo
function compareTeams(data) {
    const homeStrength = (data.homeAttack / Math.max(data.homeDefense, 0.1)) * (data.homeWinRate / 100);
    const awayStrength = (data.awayAttack / Math.max(data.awayDefense, 0.1)) * (data.awayWinRate / 100);
    
    return {
        stronger: homeStrength > awayStrength ? data.homeTeam : data.awayTeam,
        difference: Math.abs(homeStrength - awayStrength).toFixed(2),
        homeStrength: homeStrength.toFixed(2),
        awayStrength: awayStrength.toFixed(2)
    };
}

// Función para calcular odds implícitas
function calculateImpliedOdds(probability) {
    return probability > 0 ? (1 / probability).toFixed(2) : '∞';
}

// =====================
// EVENT LISTENERS GLOBALES
// =====================
document.addEventListener('DOMContentLoaded', init);

// Manejo de errores globales
window.addEventListener('error', (event) => {
    console.error('Error global:', event.error);
});

// =====================
// COMPATIBILIDAD CON VERSIÓN ANTERIOR
// =====================

// Mantener funciones originales para compatibilidad
function fillTeamData(teamName, leagueCode, type) {
    if (uiManager) {
        uiManager.fillTeamData(teamName, leagueCode, type);
    }
}

function clearAll() {
    if (uiManager) {
        uiManager.clearAll();
    }
}

function updateCalcButton() {
    if (uiManager) {
        uiManager.updateCalculateButton();
    }
}

// Función legacy de cálculo de probabilidades (simplificada)
function poissonProb(lambda, k) {
    return PoissonModel.probability(lambda, k);
}

function dixonColesAdjustment(lambdaH, lambdaA, h, a, tau = CONFIG.TAU_DIXON_COLES) {
    return DixonColesModel.adjustment(lambdaH, lambdaA, h, a, tau);
}

// =====================
// API PÚBLICA PARA INTEGRACIÓN
// =====================
window.DixonColesCalculator = {
    // Instancias principales
    get calculator() { return matchCalculator; },
    get dataManager() { return teamDataManager; },
    get uiManager() { return uiManager; },
    
    // Funciones de utilidad
    quickCalculate,
    exportResults,
    calculateImpliedOdds,
    compareTeams,
    validateMatchData,
    
    // Configuración
    config: CONFIG,
    
    // Funciones de compatibilidad
    calculateAll,
    clearAll,
    fillTeamData,
    
    // Modelos estadísticos
    PoissonModel,
    DixonColesModel
};

