export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing ?id= (SIREN/SIRET/TVA)" });
  }

  const API_KEY = process.env.SOC_API_KEY;
  const BASE = "https://api.societe.com/api/v1";

  const headers = { "x-api-key": API_KEY };

  async function call(path) {
    const r = await fetch(`${BASE}${path}`, { headers });
    return r.json();
  }

  try {
    // 1️⃣ ESSAI : BILANS
    const bilans = await call(`/entreprise/${id}/bilans`);

    if (bilans?.bilans?.length > 0) {
      const dernier = bilans.bilans[0]; // le plus récent
      if (dernier?.ca) {
        return res.status(200).json({
          siren: id,
          ca: dernier.ca,
          annee: dernier.annee,
        });
      }
    }

    // 2️⃣ ESSAI : PROFIL FINANCIER (informations-financieres)
    const fi = await call(`/entreprise/${id}/informations-financieres`);

    if (fi?.informations_financieres?.chiffre_affaires) {
      const ca = fi.informations_financieres.chiffre_affaires;
      const annee = fi.informations_financieres.annee;

      return res.status(200).json({
        siren: id,
        ca,
        annee,
      });
    }

    // 3️⃣ Aucun CA trouvé
    return res.status(404).json({
      error: "CA non trouvé dans les bilans/profil financier",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
