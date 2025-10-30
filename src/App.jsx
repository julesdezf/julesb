import React, { useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env?.VITE_PROXY_BASE || "/api/societe";

const classNames = (...arr) => arr.filter(Boolean).join(" ");

const Badge = ({ children, tone = "neutral" }) => {
  const tones = {
    neutral: "bg-gray-100 text-gray-700 border border-gray-200",
    success: "bg-green-100 text-green-700 border border-green-200",
    warn: "bg-amber-100 text-amber-700 border border-amber-200",
    danger: "bg-red-100 text-red-700 border border-red-200",
  };
  return (
    <span className={classNames("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
};

const Card = ({ title, children, footer, className }) => (
  <div className={classNames("rounded-2xl shadow-sm border border-gray-200 bg-white", className)}>
    {title && <div className="px-5 pt-4 pb-2 text-sm font-semibold text-gray-700">{title}</div>}
    <div className="px-5 pb-4">{children}</div>
    {footer && <div className="px-5 pt-2 pb-4 border-t border-gray-100">{footer}</div>}
  </div>
);

const Field = ({ label, value }) => (
  <div className="grid grid-cols-3 gap-2 py-1 text-sm">
    <div className="text-gray-500">{label}</div>
    <div className="col-span-2 font-medium text-gray-800 break-words">{value ?? <span className="text-gray-400">—</span>}</div>
  </div>
);

const isDigits = (s) => /^\d+$/.test(s);
const detectIdType = (raw) => {
  const s = raw.replace(/\s|\u00A0|-/g, "").toUpperCase();
  if (!s) return { type: "", clean: s, ok: false, hint: "Entrez un identifiant." };
  if (s.startsWith("FR") && s.length >= 4) return { type: "TVA", clean: s, ok: true };
  if (isDigits(s) && s.length === 9) return { type: "SIREN", clean: s, ok: true };
  if (isDigits(s) && s.length === 14) return { type: "SIRET", clean: s, ok: true };
  return { type: "UNKNOWN", clean: s, ok: false, hint: "Utilisez SIREN (9), SIRET (14) ou TVA FR…"};
};

export default function SocieteApp() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  
  // ✅ AJOUT POUR LE CA
  const [caLatest, setCaLatest] = useState("—");

  const inputRef = useRef(null);
  const id = useMemo(() => detectIdType(query), [query]);

  const fetchCA = async (idStr) => {
    try {
      const resp = await fetch(`/api/bilans?id=${encodeURIComponent(idStr)}`);
      const json = await resp.json();
      if (resp.ok) {
        setCaLatest(json.formatted); // ✅ CA (ANNEE) = XXX K€
      } else {
        setCaLatest("—");
      }
    } catch {
      setCaLatest("—");
    }
  };

  const fetchData = async (idStr) => {
    setLoading(true);
    setError(null);
    setData(null);
    setCaLatest("—"); // reset CA
    
    try {
      const url = `${API_BASE}?id=${encodeURIComponent(idStr)}`;
      const resp = await fetch(url);
      const payload = await resp.json();
      
      if (!resp.ok) throw new Error(payload?.error || `Erreur API (${resp.status})`);

      setData(payload);
      fetchCA(idStr); // ✅ AJOUT : récupère le CA
      
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
    fetchData(id.clean);
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); alert("Copié dans le presse-papiers"); } catch {}
  };

  const downloadJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const e = data?.entreprise || data?.company || data || {};
    a.href = url; 
    a.download = `societe_${(e?.siren || id.clean || "result")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const e = data?.entreprise || data?.company || data || {};
  const denomination = e.denomination || e.raison_sociale || e.nom_entreprise || e.name;
  const siren = e.siren || e.SIREN || e.id || null;
  const siret = e.siret || e.SIRET || null;
  const tva = e.tva || e.vat || e.numero_tva || null;
  const naf = e.naf || e.code_naf || e.ape || null;
  const legalForm = e.forme_juridique || e.legal_form || null;
  const address = e.adresse || e?.siege?.adresse || e.address ||
    [e.numero_voie, e.type_voie, e.nom_voie, e.code_postal, e.ville].filter(Boolean).join(" ") || null;
  const effectif = e.effectif || e.headcount || e.tranche_effectif || null;
  const maj = e.date_maj || e.updated_at || e.derniere_mise_a_jour || null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-black text-white grid place-items-center font-bold">S</div>
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Societe.com – Console Frontend</h1>
            <p className="text-xs text-gray-500">Recherche par SIREN, SIRET ou TVA · via proxy sécurisé</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">

        <Card>
          <form onSubmit={onSubmit} className="flex flex-col md:flex-row items-stretch gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-600">Identifiant</label>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: 428723266"
                className={classNames(
                  "mt-1 w-full rounded-xl border px-4 py-2.5",
                  id.ok ? "border-gray-300" : "border-red-300"
                )}
              />
              <div className="mt-1 h-5 text-xs text-gray-500">
                {id.ok ? <span>Type détecté : <strong>{id.type}</strong></span>
                : <span className="text-red-600">{id.hint}</span>}
              </div>
            </div>

            <button type="submit" disabled={!id.ok || loading}
              className={classNames("rounded-xl px-5 py-2.5",
              (!id.ok || loading) ? "bg-gray-200" : "bg-black text-white")}>
              {loading ? "Recherche…" : "Rechercher"}
            </button>

            <button type="button" onClick={() => { setQuery(""); setData(null); setError(null); }}
              className="rounded-xl px-4 py-2.5 border border-gray-300">
              Effacer
            </button>
          </form>
        </Card>

        {data && (
          <div className="mt-6">

            <Card title="Synthèse">
              <div className="grid md:grid-cols-2 gap-3">

                <Field label="Dénomination" value={denomination} />
                <Field label="Forme juridique" value={legalForm} />

                <Field label="SIREN" value={siren} />
                <Field label="SIRET" value={siret} />

                <Field label="TVA" value={tva} />
                <Field label="Code NAF/APE" value={naf} />

                <Field label="Adresse" value={address} />
                <Field label="Effectif" value={effectif} />

                {/* ✅ ✅ ✅ AFFICHAGE DU CA FORMATÉ */}
                <Field label="Chiffre d'affaires" value={caLatest} />

                <Field label="Dernière mise à jour" value={maj} />
              </div>
            </Card>

            <Card title="Réponse brute (JSON)">
              <pre className="text-xs bg-gray-50 border p-3">
                {JSON.stringify(data, null, 2)}
              </pre>
            </Card>

          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-10 text-xs text-gray-500">
        UI prête à déployer · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
