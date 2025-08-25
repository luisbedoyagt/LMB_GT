import React, { useEffect, useMemo, useState } from "react";

/**
 * Prototipo: Calculadora Poisson + Kelly con datos en línea (Football-Data.org)
 *
 * - Lista partidos para una competencia y fecha
 * - Obtiene standings para GF/GC por equipo
 * - Estima λA/λB con un modelo sencillo
 * - Calcula p(BTTS), p(Over 2.5), EV y stake Kelly fraccionado
 * - Si no hay API key o la llamada falla, usa datos de ejemplo
 *
 * INSTRUCCIONES RÁPIDAS
 * 1) Consigue un token gratis en https://www.football-data.org/
 * 2) Ponlo en localStorage: localStorage.setItem('FD_TOKEN', 'TU_TOKEN');
 *    o escribe el token en el input de la UI y presiona “Guardar token”.
 * 3) Elige competencia, fecha y banca. Ajusta fracción de Kelly.
 */

const COMPETITIONS = [
  { id: "2021", name: "Premier League" },
  { id: "2014", name: "La Liga" },
  { id: "2019", name: "Serie A" },
  { id: "2002", name: "Bundesliga" },
  { id: "2015", name: "Ligue 1" },
];

// Datos de ejemplo por si no hay API:
const MOCK = {
  date: new Date().toISOString().slice(0, 10),
  competitionId: "2021",
  leagueAvg: 1.45,
  matches: [
    {
      id: 1,
      utcDate: new Date().toISOString(),
      homeTeam: { id: 57, name: "Arsenal" },
      awayTeam: { id: 65, name: "Manchester City" },
      odds: { bttsYes: 1.9, over25: 2.0 },
    },
    {
      id: 2,
      utcDate: new Date().toISOString(),
      homeTeam: { id: 66, name: "Manchester United" },
      awayTeam: { id: 64, name: "Liverpool" },
      odds: { bttsYes: 1.8, over25: 1.95 },
    },
  ],
  standings: {
    // minidic: teamId -> { gf, ga, played }
    57: { gf: 68, ga: 29, played: 38 },
    65: { gf: 94, ga: 33, played: 38 },
    66: { gf: 58, ga: 43, played: 38 },
    64: { gf: 75, ga: 34, played: 38 },
  },
};

function pct(x: number) {
  return (100 * x).toFixed(1) + "%";
}
function money(q: number) {
  return "Q " + (q || 0).toFixed(2);
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

// Poisson helpers
function logFactorial(n: number): number {
  if (n < 2) return 0;
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
function poissonPMF(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  const logP = -lambda + k * Math.log(lambda) - logFactorial(k);
  return Math.exp(logP);
}

function kellyFraction(p: number, oddsDecimal: number): number {
  const b = oddsDecimal - 1;
  const q = 1 - p;
  const f = (b * p - q) / b;
  return clamp(f, 0, 1);
}

function decimalFromAny(odds: string | number) {
  if (typeof odds === "number") return odds;
  const s = String(odds || "").trim();
  if (!s) return 1.0;
  if (/^[+-]/.test(s)) {
    const a = parseFloat(s);
    if (isNaN(a)) return 1.0;
    return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
  }
  const d = parseFloat(s);
  return isNaN(d) ? 1.0 : Math.max(d, 1.000001);
}

function estimateLambdas({
  gfApm,
  gaApm,
  gfBpm,
  gaBpm,
  leagueAvg,
  homeAdv,
}: {
  gfApm: number;
  gaApm: number;
  gfBpm: number;
  gaBpm: number;
  leagueAvg: number;
  homeAdv: number;
}) {
  const lA = Math.max(0, (gfApm * gaBpm) / Math.max(0.01, leagueAvg) * homeAdv);
  const lB = Math.max(0, (gfBpm * gaApm) / Math.max(0.01, leagueAvg));
  return { lA, lB };
}

function computeMarket({ lA, lB, oddsBTTS, oddsO25, bankroll, kellyFrac }: {
  lA: number;
  lB: number;
  oddsBTTS: number;
  oddsO25: number;
  bankroll: number;
  kellyFrac: number;
}) {
  // BTTS
  const pNoA = Math.exp(-lA);
  const pNoB = Math.exp(-lB);
  const pNoBoth = Math.exp(-(lA + lB));
  const pBTTS = 1 - pNoA - pNoB + pNoBoth;

  // Over 2.5 con lambda total
  const lT = lA + lB;
  const p0 = poissonPMF(0, lT);
  const p1 = poissonPMF(1, lT);
  const p2 = poissonPMF(2, lT);
  const pO25 = 1 - (p0 + p1 + p2);

  const evBTTS = pBTTS * (oddsBTTS - 1) - (1 - pBTTS);
  const evO25 = pO25 * (oddsO25 - 1) - (1 - pO25);
  const kBTTS = kellyFraction(pBTTS, oddsBTTS) * kellyFrac;
  const kO25 = kellyFraction(pO25, oddsO25) * kellyFrac;
  const stakeBTTS = bankroll * kBTTS;
  const stakeO25 = bankroll * kO25;

  return { pBTTS, pO25, evBTTS, evO25, kBTTS, kO25, stakeBTTS, stakeO25 };
}

export default function BettingPrototype() {
  const [token, setToken] = useState<string>(
    () => localStorage.getItem("FD_TOKEN") || ""
  );
  const [competitionId, setCompetitionId] = useState<string>(COMPETITIONS[0].id);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [homeAdv, setHomeAdv] = useState<number>(1.05);
  const [leagueAvg, setLeagueAvg] = useState<number>(1.45);
  const [bankroll, setBankroll] = useState<number>(1000);
  const [kellyFrac, setKellyFrac] = useState<number>(0.5);
  const [formatAmerican, setFormatAmerican] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [matches, setMatches] = useState<any[]>([]);
  const [standings, setStandings] = useState<Record<string, { gf: number; ga: number; played: number }>>({});

  // Odds por partido (editable en UI)
  const [oddsMap, setOddsMap] = useState<Record<string, { bttsYes: string; over25: string }>>({});

  function saveToken() {
    localStorage.setItem("FD_TOKEN", token);
  }

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      if (!token) throw new Error("Sin token. Usando datos de ejemplo.");

      const headers = { "X-Auth-Token": token } as any;
      const dateFrom = date;
      const dateTo = date;

      // Partidos
      const matchesRes = await fetch(
        `https://api.football-data.org/v4/competitions/${competitionId}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        { headers }
      );

      if (!matchesRes.ok) throw new Error(`HTTP ${matchesRes.status}`);
      const matchesJson = await matchesRes.json();
      const apiMatches = (matchesJson.matches || []).map((m: any) => ({
        id: m.id,
        utcDate: m.utcDate,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
      }));

      // Standings
      const standingsRes = await fetch(
        `https://api.football-data.org/v4/competitions/${competitionId}/standings`,
        { headers }
      );
      if (!standingsRes.ok) throw new Error(`HTTP ${standingsRes.status}`);
      const standingsJson = await standingsRes.json();
      const table = standingsJson.standings?.[0]?.table || [];
      const map: Record<string, { gf: number; ga: number; played: number }> = {};
      for (const row of table) {
        map[String(row.team.id)] = {
          gf: row.goalsFor,
          ga: row.goalsAgainst,
          played: row.playedGames,
        };
      }

      setMatches(apiMatches);
      setStandings(map);

      // Inicializa odds editables
      const initOdds: Record<string, { bttsYes: string; over25: string }> = {};
      for (const m of apiMatches) {
        initOdds[String(m.id)] = { bttsYes: "1.90", over25: "2.00" };
      }
      setOddsMap(initOdds);
    } catch (e: any) {
      // Fallback a datos de ejemplo
      setError(e?.message || "Error desconocido. Usando mock.");
      setMatches(MOCK.matches);
      setStandings(MOCK.standings as any);
      setLeagueAvg(MOCK.leagueAvg);
      const initOdds: Record<string, { bttsYes: string; over25: string }> = {};
      for (const m of MOCK.matches) initOdds[String(m.id)] = { bttsYes: String(m.odds.bttsYes), over25: String(m.odds.over25) };
      setOddsMap(initOdds);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, date]);

  function teamPerMatch(teamId: string) {
    const s = standings[teamId];
    if (!s || !s.played) return { gfpm: leagueAvg, gapm: leagueAvg };
    return { gfpm: s.gf / s.played, gapm: s.ga / s.played };
  }

  function americanOrDecimalInput(value: string) {
    const d = decimalFromAny(value);
    if (formatAmerican) {
      // convertir decimal a americano para mostrar, pero mantenemos el string original del usuario
      const a = d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
      return String(a);
    }
    return String(d);
  }

  function computeForMatch(m: any) {
    const home = teamPerMatch(String(m.homeTeam.id));
    const away = teamPerMatch(String(m.awayTeam.id));
    const { lA, lB } = estimateLambdas({
      gfApm: home.gfpm,
      gaApm: home.gapm,
      gfBpm: away.gfpm,
      gaBpm: away.gapm,
      leagueAvg,
      homeAdv,
    });

    const odds = oddsMap[String(m.id)] || { bttsYes: "1.90", over25: "2.00" };
    const oBTTS = decimalFromAny(odds.bttsYes);
    const oO25 = decimalFromAny(odds.over25);

    const res = computeMarket({ lA, lB, oddsBTTS: oBTTS, oddsO25: oO25, bankroll, kellyFrac });
    return { lA, lB, oBTTS, oO25, ...res };
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="px-4 py-5 border-b border-slate-800 sticky top-0 bg-slate-950/80 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-3 items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-semibold">Calculadora apuestas · Poisson + Kelly (con API)</h1>
          <div className="flex gap-2 items-center">
            <input
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 w-56"
              placeholder="Football-Data API token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button onClick={saveToken} className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800">Guardar token</button>
          </div>
        </div>
        {error && (
          <div className="max-w-6xl mx-auto mt-3 text-sm text-amber-300">
            {error} · Mostrando datos de ejemplo.
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <section className="lg:col-span-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
          <h2 className="text-lg font-semibold mb-3">Parámetros</h2>
          <div className="space-y-3">
            <label className="block text-sm">Competencia
              <select className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800" value={competitionId} onChange={(e)=>setCompetitionId(e.target.value)}>
                {COMPETITIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>

            <label className="block text-sm">Fecha
              <input type="date" className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800" value={date} onChange={(e)=>setDate(e.target.value)} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Banca
                <input type="number" min={0} step={1} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800" value={bankroll} onChange={(e)=>setBankroll(parseFloat(e.target.value)||0)} />
              </label>
              <label className="block text-sm">Kelly fracc.
                <select className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800" value={kellyFrac} onChange={(e)=>setKellyFrac(parseFloat(e.target.value))}>
                  <option value={1}>1.0× (agresivo)</option>
                  <option value={0.5}>0.5×</option>
                  <option value={0.33}>0.33×</option>
                  <option value={0.25}>0.25×</option>
                  <option value={0.1}>0.10× (conservador)</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">Media liga (goles/equipo)
                <input type="number" step={0.01} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800" value={leagueAvg} onChange={(e)=>setLeagueAvg(parseFloat(e.target.value)||0)} />
              </label>
              <label className="block text-sm">Ventaja casa
                <input type="number" step={0.01} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800" value={homeAdv} onChange={(e)=>setHomeAdv(parseFloat(e.target.value)||1)} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formatAmerican} onChange={(e)=>setFormatAmerican(e.target.checked)} /> Cuotas en formato americano
            </label>

            <button onClick={fetchData} className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800">Refrescar datos</button>
          </div>
        </section>

        <section className="lg:col-span-3 space-y-4">
          {loading && <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">Cargando…</div>}

          {matches.length === 0 && !loading && (
            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">No hay partidos para la fecha seleccionada.</div>
          )}

          {matches.map((m) => {
            const r = computeForMatch(m);
            const dt = new Date(m.utcDate);
            const odds = oddsMap[String(m.id)] || { bttsYes: "1.90", over25: "2.00" };

            const bttsDisplay = formatAmerican ? americanOrDecimalInput(odds.bttsYes) : String(decimalFromAny(odds.bttsYes));
            const o25Display = formatAmerican ? americanOrDecimalInput(odds.over25) : String(decimalFromAny(odds.over25));

            return (
              <div key={m.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm opacity-70">{dt.toLocaleString()}</div>
                    <div className="text-lg font-semibold">{m.homeTeam.name} vs {m.awayTeam.name}</div>
                  </div>
                  <div className="text-sm grid grid-cols-2 gap-3">
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2 text-center">
                      <div className="opacity-70">λA</div>
                      <div className="text-xl font-semibold">{r.lA.toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2 text-center">
                      <div className="opacity-70">λB</div>
                      <div className="text-xl font-semibold">{r.lB.toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm opacity-80">Cuotas (edita a las reales de tu casa)</div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm">BTTS Sí
                        <input
                          className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                          value={odds.bttsYes}
                          onChange={(e)=> setOddsMap((prev)=>({ ...prev, [String(m.id)]: { ...prev[String(m.id)], bttsYes: e.target.value } }))}
                        />
                        <div className="text-xs opacity-70">{formatAmerican ? "Americana" : "Decimal"}: {bttsDisplay}</div>
                      </label>
                      <label className="text-sm">Over 2.5
                        <input
                          className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800"
                          value={odds.over25}
                          onChange={(e)=> setOddsMap((prev)=>({ ...prev, [String(m.id)]: { ...prev[String(m.id)], over25: e.target.value } }))}
                        />
                        <div className="text-xs opacity-70">{formatAmerican ? "Americana" : "Decimal"}: {o25Display}</div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                      <div className="opacity-70 text-sm">Prob. BTTS</div>
                      <div className="text-2xl font-semibold">{pct(r.pBTTS)}</div>
                      <div className={`text-sm mt-1 ${r.evBTTS>0?"text-emerald-400":"text-rose-400"}`}>EV {r.evBTTS>0?"+":""}{r.evBTTS.toFixed(3)}</div>
                      <div className="text-xs opacity-70">Kelly {pct(r.kBTTS)} · Sugerido {money(r.stakeBTTS)}</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                      <div className="opacity-70 text-sm">Prob. Over 2.5</div>
                      <div className="text-2xl font-semibold">{pct(r.pO25)}</div>
                      <div className={`text-sm mt-1 ${r.evO25>0?"text-emerald-400":"text-rose-400"}`}>EV {r.evO25>0?"+":""}{r.evO25.toFixed(3)}</div>
                      <div className="text-xs opacity-70">Kelly {pct(r.kO25)} · Sugerido {money(r.stakeO25)}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs opacity-70">
                  Nota: modelo didáctico. Ajusta leagueAvg y homeAdv si la liga es más/menos goleadora.
                </div>
              </div>
            );
          })}
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 pb-8 text-xs opacity-70">
        Fuente de datos: Football-Data.org (gratuita, limitada). Este prototipo no es consejo financiero.
      </footer>
    </div>
  );
}
