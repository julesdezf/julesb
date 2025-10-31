// /api/ca.js — retourne "CA (ANNEE) = xxx K€" à partir de /entreprise/{id}/bilans
// Requiert la variable d'env SOC_API_TOKEN (ton token nu, sans "socapi " devant)

export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing ?id=" });

    const token = process.env.SOC_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "SOC_API_TOKEN missing in environment" });
    }

    // Appel bilans (financier)
    const url = `https://api.societe.com/api/v1/entreprise/${encodeURIComponent(id)}/bilans`;
    const upstream = await fetch(url, {
      headers: {
        // ⚠️ format exact demandé par l'API :
        "X-Authorization": `socapi ${token}`,
        "Accept": "application/json",
      },
    });

    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "Invalid JSON from upstream", raw: text });
    }

    if (!upstream.ok) {
      // on remonte l’erreur utile
      return res.status(upstream.status).json(json || { error: "Upstream error" });
    }

    // La doc indique que la réponse est structurée ainsi :
    // { "data": { "dernierca": "...", "dernierbildate": "YYYY", "bilans": [...] } }
    const data = json?.data || json;

    // 1) Chemin le plus simple : dernierca + dernierbildate
    const dernierca = data?.dernierca ? Number(data.dernierca) : null;
    const yearLast = data?.dernierbildate ? String(data.dernierbildate) : null;

    if (dernierca && yearLast) {
      return res.status(200).json({
        formatted: `CA (${yearLast}) = ${Math.round(dernierca / 1000)} K€`,
        year: yearLast,
        ca: dernierca,
        source: "data.dernierca",
      });
    }

    // 2) Sinon, on retombe sur le dernier élément de 'bilans' avec rescatotal (CA)
    const bilans = Array.isArray(data?.bilans) ? data.bilans : [];
    if (bilans.length) {
      // tri décroissant par année si nécessaire
      bilans.sort((a, b) => Number(b?.anneebilan || 0) - Number(a?.anneebilan || 0));
      const b0 = bilans.find(b => b?.rescatotal);
      if (b0?.rescatotal && b0?.anneebilan) {
        const caNum = Number(b0.rescatotal);
        const year = String(b0.anneebilan);
        return res.status(200).json({
          formatted: `CA (${year}) = ${Math.round(caNum / 1000)} K€`,
          year,
          ca: caNum,
          source: "bilans[0].rescatotal",
        });
      }
    }

    return res.status(404).json({ error: "CA non trouvé dans les bilans/profil financier" });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Unknown server error" });
  }
}
