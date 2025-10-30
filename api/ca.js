// /api/ca.js
export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const token = process.env.SOC_API_KEY;
    if (!token) return res.status(500).json({ error: "SOC_API_KEY missing" });

    // Endpoints possibles selon l’offre
    const candidates = [
      `https://api.societe.com/api/v1/entreprise/${id}/bilans`,
      `https://api.societe.com/api/v1/entreprise/${id}/finances`,
      `https://api.societe.com/api/v1/entreprise/${id}/profilfinancier`,
      `https://api.societe.com/api/v1/entreprise/${id}/profil-financier`,
    ];

    let data = null, status = 404;

    for (const url of candidates) {
      const r = await fetch(url, {
        headers: { "X-Authorization": `socapi ${token}`, "Accept": "application/json" },
      });
      status = r.status;
      const txt = await r.text();
      let json = null; try { json = JSON.parse(txt); } catch {}
      if (r.ok && json) { data = json; break; }
      // si 404, on tente le suivant; si 401/403 => stop
      if ([401,403].includes(r.status)) {
        return res.status(r.status).json({ error: "Unauthorized for this endpoint" });
      }
    }

    if (!data) return res.status(status).json({ error: "Aucune donnée finances/bilans trouvée" });

    // --- Extraction robuste d'un tableau de lignes avec annee + ca ---
    const guessTables = [];
    const pushIfArray = (arr) => { if (Array.isArray(arr)) guessTables.push(arr); };

    pushIfArray(data?.bilans);
    pushIfArray(data?.finances);
    pushIfArray(data?.financials);
    pushIfArray(data?.profil);
    pushIfArray(data?.donnees);
    // scan superficiel de valeurs imbriquées
    Object.values(data).forEach(v => { if (Array.isArray(v)) guessTables.push(v); });

    let best = null;
    for (const table of guessTables) {
      for (const row of table) {
        const year = row?.annee ?? row?.exercice ?? row?.year ?? null;
        const ca   = row?.ca ?? row?.chiffreaffaires ?? row?.chiffre_affaires ?? row?.turnover ?? null;
        if (year && ca) {
          if (!best || Number(year) > best.year) best = { year: Number(year), ca: Number(ca) };
        }
      }
    }

    if (!best) return res.status(404).json({ error: "CA non trouvé dans les bilans/profil financier" });

    const caK = Math.round(best.ca / 1000);
    return res.json({
      formatted: `CA (${best.year}) = ${caK} K€`,
      year: best.year,
      ca_k: caK
    });

  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
