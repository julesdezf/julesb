// src/CAApp.jsx
import React, { useMemo, useState, Suspense } from "react";

// Lazy load BatchCA pour éviter un crash silencieux au rendu
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

// Petite ErrorBoundary pour afficher l'erreur si BatchCA plante
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("BatchCA crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-xl">
          Erreur dans le module Excel : {String(this.state.error?.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

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
      setResult(data); // { formatted: "CA (ANNEE) = XX K€" }
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

      {/* BATCH TOUJOURS VISIBLE, avec fallback + garde-fou */}
      <div className="mt-10 border-t pt-8">
        <Suspense fallback={<div className="text-sm text-gray-600">Chargement du module Excel…</div>}>
          <ErrorBoundary>
            <BatchCA />
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  );
}
