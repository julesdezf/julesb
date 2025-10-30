export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing ?id" });

    const token = process.env.SOC_API_KEY;
    if (!token) return res.status(500).json({ error: "SOC_API_KEY missing" });

    // Appel direct vers l'endpoint "infos légales / bilans"
    const url = `https://api.societe.com/api/v1/entreprise/${encodeURIComponent(id)}/bilans`;

    const r = await fetch(url, {
      headers: {
        "X-Authorization": `socapi ${token}`,
        "Accept": "application/json"
      }
    });

    const text = await r.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = null; }

    if (!r.ok) return res.status(r.status).json({ error: payload || text });

    // --- Extraction simple du dernier chiffre d'affaires ---
    const bilans = payload?.bilans || payload?.data || payload?.liste || [];
    let latestCA = null;

    for (const b of bilans) {
      const year =
        b?.annee ??
        b?.exercice ??
        (b?.datecloture ? String(b.datecloture).slice(0, 4) : null);
      const ca =
        b?.ca ??
        b?.chiffreaffaires ??
        b?.chiffre_affaires ??
        b?.chiffredaffaires ??
        b?.caht ??
        null;

      if (year && ca) {
        if (!latestCA || Number(year) > latestCA.year)
          latestCA = { year: Number(year), ca: Number(ca) };
      }
    }

    if (!latestCA)
      return res.status(404).json({ error: "Aucun chiffre d'affaires trouvé" });

    // Conversion en K€
    const caK = Math.round(latestCA.ca / 1000);

    // --- Réponse ultra simple ---
    return res.status(200).json({
      formatted: `CA (${latestCA.year}) = ${caK} K€`,
      year: latestCA.year,
      ca: caK
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Unknown server error" });
  }
}
