import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

// même base que ta page : ton proxy / API
const API_BASE = "/api/ca"; // <-- adapte si besoin (actuellement ton endpoint qui renvoie le dernier CA)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const onlyDigits = (s="") => (s || "").toString().replace(/\D+/g, "");

// Récupère {year, caK} à partir de la réponse API existante
async function fetchCAForId(id) {
  const url = `${API_BASE}?id=${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  const payload = await resp.json();
  if (!resp.ok) throw new Error(payload?.error || `HTTP ${resp.status}`);

  // on accepte différents formats (bilans / dernierca)
  // payload.data.dernierca (en euros)
  // ou payload.data.bilans[0].rescatotal (en euros) + anneebilan
  const d = payload?.data || payload;
  let year = null;
  let caK = null;

  if (d?.dernierca && d?.dernierbildate) {
    year = String(d.dernierbildate);
    caK = Math.round(Number(d.dernierca) / 1000);
  } else if (Array.isArray(d?.bilans) && d.bilans.length) {
    // on prend le premier bilan (le plus récent normalement renvoyé par l’API)
    const b = d.bilans[0];
    year = String(b?.anneebilan || "");
    caK = Math.round(Number(b?.rescatotal || 0) / 1000);
  }

  if (!year || caK === null || Number.isNaN(caK)) {
    throw new Error("CA introuvable");
  }
  return { year, caK };
}

// Limiteur de concurrence simple
async function mapWithConcurrency(items, worker, { concurrency = 5, delayMs = 0 } = {}) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const cur = idx++;
      try {
        results[cur] = await worker(items[cur], cur);
      } catch (e) {
        results[cur] = { error: e?.message || String(e) };
      }
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export default function BatchCA() {
  const [file, setFile] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [colName, setColName] = useState(""); // colonne SIREN détectée
  const [rows, setRows] = useState([]);       // données du sheet
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [log, setLog] = useState("");

  // lecture fichier
  const onFile = async (e) => {
    setFile(null); setRows([]); setColName(""); setSheetName(""); setLog("");
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheet];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }); // array d'objets
      // tentative auto pour la colonne SIREN
      const columns = Object.keys(json[0] || {});
      const guess = columns.find(c => /(^|\s)siren(\s|$)/i.test(c)) || columns.find(c => /siren/i.test(c)) || columns[0] || "SIREN";
      setFile(f);
      setSheetName(firstSheet);
      setRows(json);
      setColName(guess);
      setLog(`Feuille "${firstSheet}" chargée (${json.length} lignes). Colonne SIREN détectée: "${guess}".`);
    } catch (e) {
      setLog(`Erreur de lecture : ${e?.message || e}`);
    }
  };

  const canRun = useMemo(() => !!rows.length && !!colName && !working, [rows, colName, working]);

  const run = async () => {
    if (!canRun) return;
    setWorking(true);
    setProgress({ done: 0, total: rows.length });
    setLog("Traitement en cours…");

    // copie locale
    const out = rows.map(r => ({ ...r }));
    const sirens = out.map(r => onlyDigits(r[colName]).slice(-9)); // nettoie et force 9 chiffres si possible

    const results = await mapWithConcurrency(
      sirens,
      async (siren, idx) => {
        if (!siren || siren.length !== 9) {
          setProgress(p => ({ ...p, done: p.done + 1 }));
          return { error: "SIREN invalide" };
        }
        try {
          const { year, caK } = await fetchCAForId(siren);
          return { year, caK };
        } finally {
          setProgress(p => ({ ...p, done: p.done + 1 }));
        }
      },
      { concurrency: 5, delayMs: 150 } // <== limite les appels pour éviter le 429
    );

    // injecte résultats
    results.forEach((res, i) => {
      if (res?.error) {
        out[i]["Année CA"] = "";
        out[i]["Dernier CA (K€)"] = res.error;
      } else {
        out[i]["Année CA"] = res.year;
        out[i]["Dernier CA (K€)"] = res.caK;
      }
    });

    // export XLSX
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(out);
      XLSX.utils.book_append_sheet(wb, ws, sheetName || "Résultats");
      const base = (file?.name || "siren").replace(/\.(xlsx|xls|csv)$/i, "");
      XLSX.writeFile(wb, `${base}_avec_CA.xlsx`);
      setLog("Fichier exporté avec succès ✅");
    } catch (e) {
      setLog(`Erreur export : ${e?.message || e}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold">Traitement Excel – Dernier CA</h2>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFile}
          className="block text-sm"
        />
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
        {working && (
          <div className="text-sm text-gray-600">
            {progress.done}/{progress.total}…
          </div>
        )}
      </div>

      {log && <div className="text-sm text-gray-700">{log}</div>}

      <p className="text-xs text-gray-500">
        Astuce : la colonne SIREN doit contenir 9 chiffres (on nettoie espaces/points/texte).
        Taux de parallélisme limité (5) + petite pause entre requêtes pour éviter le rate-limit (429).
      </p>
    </div>
  );
}
