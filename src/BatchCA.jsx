import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

console.log("[BatchCA] module chargé ✅");

const API_BASE = "/api/ca";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onlyDigits = (s = "") => (s || "").toString().replace(/\D+/g, "");

async function fetchCAForId(id) {
  const url = `${API_BASE}?id=${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  const json = await resp.json();

  if (!resp.ok) throw new Error(json.error || "Erreur API");

  const d = json?.data || json;

  let year = null;
  let caK = null;

  if (d?.dernierca && d?.dernierbildate) {
    year = String(d.dernierbildate);
    caK = Math.round(Number(d.dernierca) / 1000);
  } else if (Array.isArray(d?.bilans) && d.bilans.length) {
    const b = d.bilans[0];
    year = String(b?.anneebilan);
    caK = Math.round(Number(b?.rescatotal) / 1000);
  }

  if (!year || Number.isNaN(caK)) throw new Error("CA introuvable");

  return { year, caK };
}

async function mapWithConcurrency(items, worker, { concurrency = 5, delayMs = 150 }) {
  const results = new Array(items.length);
  let idx = 0;

  async function runner() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await worker(items[i]);
      } catch (e) {
        results[i] = { error: e.message };
      }
      await sleep(delayMs);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runner)
  );

  return results;
}

export default function BatchCA() {
  const [file, setFile] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [colName, setColName] = useState("");
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [working, setWorking] = useState(false);
  const [log, setLog] = useState("");

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sh = wb.SheetNames[0];
      const ws = wb.Sheets[sh];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const cols = Object.keys(json[0] || {});
      const guess =
        cols.find((c) => /siren/i.test(c)) ||
        cols[0] ||
        "SIREN";

      setFile(f);
      setSheetName(sh);
      setRows(json);
      setColName(guess);
      setLog(`✅ ${json.length} lignes détectées · Colonne SIREN: "${guess}"`);
    } catch (e) {
      setLog("Erreur: " + e.message);
    }
  };

  const canRun = useMemo(
    () => rows.length > 0 && colName && !working,
    [rows, colName, working]
  );

  const run = async () => {
    if (!canRun) return;
    setWorking(true);
    setProgress({ done: 0, total: rows.length });
    setLog("Traitement en cours…");

    const out = rows.map((r) => ({ ...r }));
    const sirens = out.map((r) => onlyDigits(r[colName]).slice(-9));

    const results = await mapWithConcurrency(
      sirens,
      async (siren) => {
        if (siren.length !== 9) return { error: "SIREN invalide" };
        return fetchCAForId(siren);
      },
      { concurrency: 5, delayMs: 150 }
    );

    results.forEach((r, i) => {
      out[i]["Année CA"] = r.year || "";
      out[i]["Dernier CA (K€)"] = r.caK ?? r.error;
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(out);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${file.name.replace(/\..+$/, "")}_avec_CA.xlsx`);

    setWorking(false);
    setLog("✅ Export terminé !");
  };

  return (
    <div className="space-y-4">

      <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />

      {rows.length > 0 && (
        <div className="text-sm text-gray-600">
          {rows.length} lignes chargées · Colonne SIREN : <b>{colName}</b>
        </div>
      )}

      <button
        disabled={!canRun}
        onClick={run}
        className={`rounded-xl px-4 py-2 text-white ${
          canRun ? "bg-black hover:opacity-90" : "bg-gray-300"
        }`}
      >
        Lancer le remplissage
      </button>

      {working && (
        <div className="text-sm text-gray-600">
          {progress.done}/{progress.total}…
        </div>
      )}

      {log && <div className="text-sm">{log}</div>}
    </div>
  );
}
