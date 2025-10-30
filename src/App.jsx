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
  const [caLatest, setCaLatest] = useState("—");  // ✅ AJOUT ICI
  const inputRef = useRef(null);

  const id = useMemo(() => detectIdType(query), [query]);

  const fetchData = async (idStr) => {
    setLoading(true);
    setError(null);
    setData(null);
    setCaLatest("—");

    try {
      // ✅ 1) INFOS LÉGALES
      const url = `${API_BASE}?id=${encodeURIComponent(idStr)}`;
      const resp = await fetch(url);
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload?.error || `Erreur API (${resp.status})`);

      setData(payload);
      setHistory((h) => [idStr, ...h.filter((x) => x !== idStr)].slice(0, 8));

      // ✅ 2) CHIFFRE D’AFFAIRES
      try {
        const r = await fetch(`/api/ca?id=${encodeURIComponent(idStr)}`);
        const j = await r.json();
        if (r.ok && j?.formatted) {
          setCaLatest(j.formatted); // ✅ CA (ANNEE) = XXX K€
        }
      } catch {
        setCaLatest("—");
      }

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

  const e = data?.entreprise || data?.company || data || {};
  const denomination = e.denomination || e.raison_sociale || e.nom_entreprise || e.name;
  const siren = e.siren || e.SIREN || e.id || null;
  const siret = e.siret || e.SIRET || null;
  const tva = e.tva || e.vat || e.numero_tva || null;
  const naf = e.naf || e.code_naf || e.ape || null;
  const legalForm = e.forme_juridique || e.legal_form || null;
  const address = e.adresse || e?.siege?.adresse || e.address || null;
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
          <div className="ml-auto hidden sm:block">
            <Badge>API Base: {API_BASE}</Badge>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Card>
          <form onSubmit={onSubmit} className="flex flex-col md:flex-row items-stretch gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-600">Identifiant (SIREN 9 · SIRET 14 · TVA FR…)</label>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: 428723266 ou FR56428723266"
                className={classNames(
                  "mt-1 w-full rounded-xl border px-4 py-2.5 focus:outline-none focus:ring-4 transition",
                  id.ok ? "border-gray-300 focus:ring-gray-200" : "border-red-300 focus:ring-red-100"
                )}
              />
              <div className="mt-1 h-5 text-xs text-gray-500">
                {id.ok ? <span>Type détecté : <strong>{id.type}</strong></span> : (
                  <span className="text-red-600">{id.hint || "Identifiant invalide"}</span>
                )}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={!id.ok || loading}
                className={classNames(
                  "rounded-xl px-5 py-2.5 font-medium shadow-sm border transition",
                  (!id.ok || loading) ? "bg-gray-200 text-gray-500 border-gray-200" : "bg-black text-white border-black hover:opacity-90"
                )}
              >
                {loading ? "Recherche…" : "Rechercher"}
              </button>

              <button
                type="button"
                onClick={() => { setQuery(""); setData(null); setError(null); setCaLatest("—"); inputRef.current?.focus(); }}
                className="rounded-xl px-4 py-2.5 font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Effacer
              </button>
            </div>
          </form>
        </Card>

        {error && (
          <div className="mt-4">
            <Card className="border-red-200">
              <div className="text-sm text-red-700">{error}</div>
            </Card>
          </div>
        )}

        {data && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
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
                  <Field label="Chiffre d'affaires" value={caLatest} />  {/* ✅ CA ICI */}
                  <Field label="Dernière mise à jour" value={maj} />
                </div>
              </Card>

              <Card
                title={
                  <div className="flex items-center justify-between">
                    <span>Réponse brute (JSON)</span>
                  </div>
                }
              >
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-auto max-h-[480px] whitespace-pre-wrap break-words">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
