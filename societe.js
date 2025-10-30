export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing ?id= (SIREN/SIRET/TVA)" });

    const token = process.env.SOC_API_KEY;
    if (!token) return res.status(500).json({ error: "Server misconfigured: SOC_API_KEY missing" });

    const upstream = `https://api.societe.com/api/v1/entreprise/${encodeURIComponent(id)}`;
    const resp = await fetch(upstream, {
      headers: { "X-API-KEY": token, "Accept": "application/json" }
    });

    const text = await resp.text();
    let payload;
    try { payload = JSON.parse(text); } catch {
      payload = { raw: text };
    }

    // Pass-through status from upstream when not ok
    if (!resp.ok) {
      return res.status(resp.status).json(payload);
    }

    // Add CORS for local dev / cross-origin use if needed
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Unknown server error" });
  }
}