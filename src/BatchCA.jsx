import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const API_BASE = "/api/ca";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onlyDigits = (s = "") => (s || "").toString().replace(/\D+/g, "");

// ──────────────────────────────────────────────────────────────
// Helpers pour parser le fallback "CA (2024) = 1562 K€"
function parseFormattedCA(s = "") {
  const m = /CA\s*\((\d{4})\)\s*=\s*([\d\s]+)\s*K€/i.exec(s);
  if (!m) return null;
  const year = m[1];
  const caK = Math.round(Number(m[2].replace(/\s+/g, "")));
  return { year, caK };
}

// Récupère {year, caK} quelle que soit la forme renvoyée par l'API
async function fetchCAForId(id) {
  const url = `${API_BASE}?id=${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  const payload = await resp.json();
  if (!resp.ok) throw new Error(payload?.error || `HTTP ${resp.status}`);

  const d = payload?.data || payload;

  // 1) Nouveau format direct
  if (d?.year && (d?.caK || d?.cak)) {
    const year = String(d.year);
    const caK = Math.round(Number(d.caK ?? d.cak));
    return { year, caK };
  }

  // 2) Format "dernierca/dernierbildate" (euros -> K€)
  if (d?.dernierca && d?.dernierbildate) {
    const year = String(d.dernierbildate);
    const caK = Math.round(Number(d.dernierca) / 1000);
    return { year, caK };
  }

  // 3) Format "bilans" (euros -> K€)
  if (Array.isArray(d?.bilans) && d.bilans.length) {
    const b = d.bilans[0];
    const year = String(b?.anneebilan || "");
    const caK = Math.round(Number(b?.rescatotal || 0) / 1000);
    if (year && !Number.isNaN(caK)) return { year, caK };
  }

  // 4) Fallback sur "formatted": "CA (2024) = 1562 K€"
  if (typeof d?.formatted === "string") {
    const parsed = parseFormattedCA(d.formatted);
    if (parsed) return parsed;
  }

  throw new Error("CA introuvable");
}

// Limiteur de concurrence simple
async function mapWithConcurrency(items, worker, { concurrency = 5, delayMs = 0 } = {}) {
  const results = new Array(items.length);
  let i = 0;
  async function runner() {
    while (i < items.length) {
      const cur = i++;
      try {
        results[cur] = await worker(items[cur], cur);
      } catch (e) {
        results[cur] = { error: e?.message || String(e) };
      }
      if (delayMs) await sleep(delayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

export default function BatchCA() {
  const [file, setFile] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [colName, setColName] = useState("");
  const [rows, setRows] = useState([]);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState("");

  const onFile = async (e) => {
    setFile(null); setRows([]); setColName(""); setSheetName(""); setLog("");
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const first = wb.SheetNames[0];
      const ws = wb.Sheets[first];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const columns = Object.keys(json[0] || {});
      const guess =
        columns.find((c) => /(^|\s)siren(\s|$)/i.test(c)) ||
        columns.find((c) => /siren/i.test(c)) ||
        columns[0] || "SIREN";
      setFile(f);
      setSheetName(first);
      setRows(json);
      setColName(guess);
      setLog(`Feuille "${first}" chargée (${json.length} lignes). Colonne SIREN détectée : "${guess}".`);
    } catch (e2) {
      setLog(`Erreur de lecture : ${e2?.message || e2}`);
    }
  };

  const canRun = useMemo(() => !!rows.length && !!colName && !working, [rows, colName, working]);

  const run = async () => {
    if (!canRun) return;
    setWorking(true);
    setProgress({ done: 0, total: rows.length });
    setLog("Traitement en cours…");

    const out = rows.map((r) => ({ ...r }));
    const sirens = out.map((r) => onlyDigits(r[colName]).slice(-9));

    const results = await mapWithConcurrency(
      sirens,
      async (siren, idx) => {
        if (!siren || siren.length !== 9) {
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return { error: "SIREN invalide" };
        }
        try {
          const { year, caK } = await fetchCAForId(siren);
          return { year, caK };
        } finally {
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      },
      { concurrency: 5, delayMs: 150 } // limite les appels pour éviter 429
    );

    // Injection des résultats
    results.forEach((r, i) => {
      if (r?.error) {
        out[i]["Année CA"] = "";
        out[i]["Dernier CA (K€)"] = r.error;
      } else {
        out[i]["Année CA"] = r.year;
        out[i]["Dernier CA (K€)"] = r.caK;
      }
    });

    // Export Excel
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(out);
      XLSX.utils.book_append_sheet(wb, ws, sheetName || "Résultats");
      const base = (file?.name || "siren").replace(/\.(xlsx|xls|csv)$/i, "");
      XLSX.writeFile(wb, `${base}_avec_CA.xlsx`);
      setLog("Fichier exporté ✅");
    } catch (e3) {
      setLog(`Erreur export : ${e3?.message || e3}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Batch Excel – Dernier CA</h2>

      <div className="flex items-center gap-3">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="block text-sm" />
        {rows.length > 0 && (
          <div className="text-xs text-gray-600">
            {rows.length} lignes chargées · Colonne SIREN : <b>{colName}</b>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          disabled={!canRun}
          onClick={run}
          className={`rounded-xl px-4 py-2 text-white ${canRun ? "bg-black hover:opacity-90" : "bg-gray-300"}`}
        >
          Lancer le remplissage
        </button>
        {working && <div className="text-sm text-gray-600">{progress.done}/{progress.total}…</div>}
      </div>

      {log && <div className="text-sm text-gray-700">{log}</div>}

      <p className="text-xs text-gray-500">
        La colonne SIREN doit contenir 9 chiffres. Parallélisme limité (5) + petite pause pour éviter le 429.
      </p>
    </div>
  );
}
