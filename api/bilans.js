export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const token = process.env.SOC_API_KEY;
    if (!token) return res.status(500).json({ error: "SOC_API_KEY missing" });

    const url = `https://api.societe.com/api/v1/entreprise/${id}/bilans`;

    const r = await fetch(url, {
      headers: {
        "X-Authorization": `socapi ${token}`,
        "Accept": "application/json"
      }
    });

    const text = await r.text();
    let data; try { data = JSON.parse(text) } catch { data = null }

    if (!r.ok) return res.status(r.status).json({ error: data || text });

    const bilans = data?.bilans || data?.data || [];

    let last = null;

    for (const b of bilans) {
      const year = b?.annee || b?.exercice || null;
      const ca = b?.ca || b?.chiffreaffaires || null;

      if (year && ca) {
        if (!last || Number(year) > last.year) {
          last = { year: Number(year), ca: Number(ca) };
        }
      }
    }

    if (!last)
      return res.status(404).json({ error: "CA non trouvé" });

    const caK = Math.round(last.ca / 1000);

    res.json({
      formatted: `CA (${last.year}) = ${caK} K€`,
      year: last.year,
      ca: caK
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
