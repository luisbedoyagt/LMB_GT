:root{
  --gap:12px; --radius:10px; --bg:#0f1220; --card:#191c2f; --muted:rgba(230,233,245,.75);
  --accent: #4f46e5; --accent-2: #6ee7a1; --accent-3: #f59e0b;
  --select-bg: rgba(35, 40, 65, 0.7); /* Nuevo color de fondo para selects */
  --select-border: rgba(74, 85, 104, 0.8); /* Borde para selects */
}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:#e6e9f5}
.container{max-width:1100px;margin:20px auto;padding:16px;display:grid;grid-template-columns:1fr;gap:var(--gap)}
.header{text-align:center;padding:8px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.card{background:var(--card);border:1px solid #2a2e4a;padding:12px;border-radius:var(--radius);box-shadow:0 8px 30px rgba(0,0,0,.28)}
label{font-size:13px;opacity:.95}
input,select{width:100%;padding:8px;border-radius:8px;border:1px solid #2a2e4a;background:transparent;color:inherit}
/* Estilos mejorados para los selects */
select {
  background-color: var(--select-bg);
  border: 1px solid var(--select-border);
  color: #e6e9f5;
  padding: 10px 12px;
  font-size: 14px;
  transition: all 0.2s ease;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23e6e9f5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
}

select:hover {
  border-color: rgba(124, 58, 237, 0.6);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

select:focus {
  outline: none;
  border-color: rgba(124, 58, 237, 0.8);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2);
}

select option {
  background-color: #1a2035;
  color: #e6e9f5;
  padding: 10px;
}

/* Estilo para el placeholder en selects */
select:invalid {
  color: rgba(230, 233, 245, 0.6);
}

.row{display:flex;gap:10px}
.row > *{flex:1}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.tile{text-align:center;padding:10px;border-radius:8px;background:#0f1220;border:1px solid #2a2e4a}
.small{font-size:12px;color:var(--muted)}
.btn {padding:8px 12px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--accent),#6366f1);color:#fff;font-weight:700;cursor:pointer;transition:all .14s ease}
.btn:hover{transform:translateY(-2px)}
.btn-secondary {background:linear-gradient(135deg,var(--accent-3),#f59e0b);}
.sep{height:1px;background:#2a2e4a;margin:10px 0}
.recs{display:grid;gap:8px}
.table-like{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.stat-card{background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03);padding:10px;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:6px}
.stat-title{font-size:12px;color:var(--muted);font-weight:600}
.stat-values{font-size:15px;font-weight:700}
.suggest{margin-top:12px;padding:10px;border-radius:10px;background:linear-gradient(90deg,#062b14, rgba(110,231,161,0.06));border-left:4px solid var(--accent-2);font-weight:700}
.abbrev{font-size:12px;color:var(--muted);margin-top:8px}
.correction-factors {display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;}
.correction-factor {background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; text-align: center;}
.correction-factor .label {font-size: 12px; color: var(--muted);}
.correction-factor .value {font-size: 14px; font-weight: bold;}
@media(max-width:880px){.grid{grid-template-columns:1fr}.table-like{grid-template-columns:1fr}.correction-factors {grid-template-columns: 1fr;}}
