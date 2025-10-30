export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ error: "Missing ?id (SIREN/SIRET/TVA)" });
    }

    const token = process.env.SOC_API_KEY;
    if (!token) {
      return res.status(500).json({ error: "SOC_API_KEY missing in server" });
    }

    // ✅ CHEMIN EXACT POUR TON OFFRE
    const url = `https://api.societe.com/api/v1/entreprise/${encodeURIComponent(id)}/infoslegales`;

    const upstream = await fetch(url, {
      headers: {
        "X-Authorization": `socapi ${token}`,   // ✅ header correct pour ton offre
        "Accept": "application/json"
      }
    });

    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text }; }

    // ✅ CORS pour ton navigateur
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    return res.status(upstream.status).json(payload);

  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
}
