import React, { useMemo, useState, Suspense } from "react";

// ✅ Import lazy pour être sûr que BatchCA charge même si XLSX est lourd
const BatchCA = React.lazy(() => import("./BatchCA.jsx"));

const API = "/api/ca";

const isDigits = (s) => /^\d+$/.test(s);
const detectId = (raw) => {
  const s = (raw || "").replace(/\s|-|\u00A0/g, "").toUpperCase();
  if (!s) return { ok: false, clean: "", hint: "Entrez un identifiant" };
  if (s.startsWith("FR")) return { ok: true, clean: s };
  if (isDigits(s) && s.length === 9) return { ok: true, clean: s };
  if (isDigits(s) && s.length === 14) return { ok: true, clean: s };
  return { ok: false, clean: s, hint: "Format inconnu" };
};

export default function CAApp() {
  console.log("[CAApp] rendu");

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
      setResult(data);
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
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-xl">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 p-4 bg-white border rounded-xl text-lg font-semibold">
          {result.formatted}
        </div>
      )}

      {/* ✅ BATCH TOUJOURS, TOUJOURS, TOUJOURS AFFICHÉ */}
      <div className="mt-10 border-t pt-8">

        <h2 className="text-lg font-bold mb-3">Batch Excel – Dernier CA</h2>

        <Suspense
          fallback={
            <div className="p-3 bg-gray-100 border rounded-xl">
              Chargement du module Excel…
            </div>
          }
        >
          <BatchCA />
        </Suspense>
      </div>
    </div>
  );
}
