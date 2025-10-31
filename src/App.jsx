// src/App.jsx
import React, { useMemo, useRef, useState } from "react";

// On ne parle qu'à l'endpoint financier
const CA_ENDPOINT = "/api/ca";

const isDigits = (s) => /^\d+$/.test(s);
const detectIdType = (raw) => {
  const s = raw.replace(/\s|\u00A0|-/g, "").toUpperCase();
  if (!s) return { type: "", clean: s, ok: false, hint: "Entrez un identifiant." };
  if (s.startsWith("FR") && s.length >= 4) return { type: "TVA", clean: s, ok: true };
  if (isDigits(s) && s.length === 9) return { type: "SIREN", clean: s, ok: true };
  if (isDigits(s) && s.length === 14) return { type: "SIRET", clean: s, ok: true };
  return { type: "UNKNOWN", clean: s, ok: false, hint: "Utilisez SIREN (9), SIRET (14) ou TVA FR…" };
};

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);    // { formatted, year, k, value }
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  const id = useMemo(() => detectIdType(query), [query]);

  const fetchCA = async (idStr) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `${CA_ENDPOINT}?id=${encodeURIComponent(idStr)}`;
      const resp = await fetch(url);
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload?.error || `Erreur API (${resp.status})`);
      setResult(payload); // on attend { formatted: "CA (ANNEE) = 123 K€", ... }
      setHistory((h) => [idStr, ...h.filter((x) => x !== idStr)].slice(0, 8));
    } catch (e) {
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!id.ok) return;
    fetchCA(id.clean);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-800">CA Societe.com – Extraction directe</h1>
          <p className="text-xs text-gray-500">Saisis un SIREN / SIRET / TVA FR… → on renvoie uniquement le dernier chiffre d’affaires publié.</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-600">Identifiant (SIREN 9 · SIRET 14 · TVA FR…)</label>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex : 428723266 ou 42872326600048 ou FR56428723266"
              className={`mt-1 w-full rounded-xl border px-4 py-2.5 focus:outline-none focus:ring-4 transition ${
                id.ok ? "border-gray-300 focus:ring-gray-200" : "border-red-300 focus:ring-red-100"
              }`}
            />
            <div className="mt-1 h-5 text-xs text-gray-500">
              {id.ok ? (
                <span>Type détecté : <strong>{id.type}</strong></span>
              ) : (
                <span className="text-red-600">{id.hint || "Identifiant invalide"}</span>
              )}
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={!id.ok || loading}
              className={`rounded-xl px-5 py-2.5 font-medium shadow-sm border transition ${
                (!id.ok || loading) ? "bg-gray-200 text-gray-500 border-gray-200" : "bg-black text-white border-black hover:opacity-90"
              }`}
            >
              {loading ? "Recherche…" : "Rechercher"}
            </button>
          </div>
        </form>

        {history.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-500 mr-1">Historique :</span>
            {history.map((h) => (
              <button key={h} onClick={() => setQuery(h)} className="text-xs rounded-full px-3 py-1 border border-gray-200 hover:bg-gray-50">
                {h}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-sm text-gray-500 mb-1">Dernier chiffre d’affaires publié</div>
            <div className="text-xl font-semibold text-gray-900">
              {result.formatted || "—"}
            </div>
            {result.note && (
              <div className="mt-2 text-xs text-gray-500">{result.note}</div>
            )}
          </div>
        )}

        {!result && !error && !loading && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-600">
            Tape un identifiant et clique sur <strong>Rechercher</strong>.  
            On affichera uniquement la ligne : <em>CA (ANNEE) = XXX K€</em>.
          </div>
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-8 text-xs text-gray-500">
        Aucune donnée “infos légales” lue côté UI · Uniquement l’endpoint financier via <code>/api/ca</code>.
      </footer>
    </div>
  );
}
