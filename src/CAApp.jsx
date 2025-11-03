import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx"; // on l'importe ici directement pour éviter toute surprise

/******************************
 *  Helpers communs
 ******************************/
const API = "/api/ca";

const isDigits = (s) => /^\d+$/.test(s);
const detectId = (raw = "") => {
  const s = raw.replace(/\s|-|\u00A0/g, "").toUpperCase();
  if (!s) return { ok: false, clean: "", hint: "Entrez un identifiant" };
  if (s.startsWith("FR")) return { ok: true, clean: s };
  if (isDigits(s) && s.length === 9) return { ok: true, clean: s };
  if (isDigits(s) && s.length === 14) return { ok: true, clean: s };
  return { ok: false, clean: s, hint: "Format inconnu" };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onlyDigits = (s = "") => (s || "").toString().replace(/\D+/g, "");

/******************************
 *  Appels API pour Batch
 ******************************/
async function fetchCAForId(id) {
  const url = `${API}?id=${encodeURIComponent(id)}`;
  const resp = await fetch(url);
  const json = await resp.json();

  if (!resp.ok) throw new Error(json?.error || `HTTP ${resp.status}`);

  // On accepte plusieurs structures de réponse (bilans / dernierca)
  const d = json?.data || json;
  let year = null;
  let caK = null;

  if (d?.dernierca && d?.dernierbildate) {
    year = String(d.dernierbildate);
    caK = Math.round(Number(d.dernierca) / 1000);
  } else if (Array.isArray(d?.bilans) && d.bilans.length) {
    const b = d.bilans[0];
    year = String(b?.anneebilan || "");
    caK = Math.round(Number(b?.rescatotal || 0) / 1000);
  }

  if (!year || Number.isNaN(caK)) {
    throw new Error("CA introuvable");
  }
  return { year, caK };
}

async function mapWithConcurrency(
  items,
  worker,
  { concurrency = 5, delayMs = 150 } = {}
) {
  const results = new Array(items.length);
  let idx = 0;
  async function runner() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { error: e?.message || String(e) };
      }
      if (delayMs) await sleep(delayMs);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runner)
  );
  return results;
}

<div className="mt-8 p-3 rounded-xl bg-amber-50 border text-amber-800">
  Bloc batch ci-dessous — si vous ne voyez pas ceci, le déploiement n'est pas à jour.
</div>


/******************************
 *  Batch intégré dans ce fichier
 ******************************/
function BatchCAInline() {
  const [file, setFile] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [colName, setColName] = useState("");
  const [rows, setRows] = useState([]);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
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
        cols.find((c) => /(^|\s)siren(\s|$)/i.test(c)) ||
        cols.find((c) => /siren/i.test(c)) ||
        cols[0] ||
        "SIREN";
      setFile(f);
      setSheetName(sh);
      setRows(json);
      setColName(guess);
      setLog(`✅ ${json.length} lignes détectées · Colonne SIREN : "${guess}"`);
    } catch (e2) {
      setLog("Erreur de lecture : " + (e2?.message || e2));
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
      { concurrency: 5, delayMs: 150 }
    );

    results.forEach((res, i) => {
      if (res?.error) {
        out[i]["Année CA"] = "";
        out[i]["Dernier CA (K€)"] = res.error;
      } else {
        out[i]["Année CA"] = res.year;
        out[i]["Dernier CA (K€)"] = res.caK;
      }
    });

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(out);
      XLSX.utils.book_append_sheet(wb, ws, sheetName || "Résultats");
      const base = (file?.name || "siren").replace(/\.(xlsx|xls|csv)$/i, "");
      XLSX.writeFile(wb, `${base}_avec_CA.xlsx`);
      setLog("✅ Fichier exporté avec succès");
    } catch (e2) {
      setLog("Erreur export : " + (e2?.message || e2));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Traitement Excel – Dernier CA</h2>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFile}
          className="block text-sm"
        />
        {!!rows.length && (
          <div className="text-xs text-gray-600">
            {rows.length} lignes chargées · Colonne SIREN : <b>{colName}</b>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
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
      </div>

      {log && <div className="text-sm">{log}</div>}

      <p className="text-xs text-gray-500">
        La colonne SIREN doit contenir 9 chiffres (espaces/points/texte nettoyés).
        Concurrence limitée (5) + petite pause pour éviter les 429.
      </p>
    </div>
  );
}

/******************************
 *  Recherche unitaire + Batch inline
 ******************************/
export default function CAApp() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const id = useMemo(() => detectId(query), [query]);

  const fetchCA = async () => {
    if (!id.ok) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${API}?id=${encodeURIComponent(id.clean)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      setResult(data); // { formatted: "CA (ANNEE) = XX K€", ... }
    } catch (e) {
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Dernier chiffre d’affaires</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="SIREN / SIRET / TVA"
        className="w-full border p-3 rounded-xl"
      />

      <button
        disabled={!id.ok || loading}
        onClick={fetchCA}
        className="mt-4 w-full bg-black text-white p-3 rounded-xl"
      >
        {loading ? "Recherche…" : "Rechercher"}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-xl">{error}</div>
      )}

      {result && (
        <div className="mt-6 p-4 bg-white border rounded-xl text-lg font-semibold">
          {result.formatted}
        </div>
      )}

      {/* 🔥 Batch TOUJOURS visible, sans import externe */}
      <div className="mt-10 border-t pt-8">
        <BatchCAInline />
      </div>
    </div>
  );
}
