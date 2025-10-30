# Societe.com – Web UI (Vite + React + Tailwind) + Vercel Proxy

Interface web prête à l'emploi pour interroger l'API Societe.com **sans exposer la clé**.
Le frontend parle à un **proxy** `/api/societe` (serverless Vercel) qui ajoute l'en-tête `X-API-KEY` côté serveur.

## 🚀 Déploiement rapide (Vercel)

1. **Importer le repo ZIP** dans Vercel (ou `vercel deploy` depuis ton poste).
2. Dans le projet Vercel → **Settings → Environment Variables** :  
   - `SOC_API_KEY` = *ta clé api Societe.com*
3. **Déployer**. Vercel détecte Vite et la fonction `/api/societe` automatiquement.

Optionnel : si tu veux appeler un proxy externe pendant le dev local, crée un fichier `.env` à la racine avec :
```
VITE_PROXY_BASE=https://ton-app.vercel.app/api/societe
```

## 🧩 Développement local

```bash
npm i
npm run dev
```

Par défaut, l'UI pointe sur `/api/societe` (même origine). Si tu testes sans Vercel en local,
l'endpoint n'existera pas. Deux options :
- lancer `vercel dev` (si tu utilises Vercel CLI) pour avoir aussi la fonction serverless en local,
- ou mettre `VITE_PROXY_BASE` vers un proxy déployé.

## 🔧 API Proxy

Chemin : `api/societe.js`  
Paramètres : `GET /api/societe?id={SIREN|SIRET|TVA}`

Le proxy appelle `https://api.societe.com/api/v1/entreprise/{id}` en ajoutant l'en-tête `X-API-KEY` depuis `process.env.SOC_API_KEY`.

## 🛡️ Sécurité

- **Jamais** de clé en frontend.
- CORS permissif pour faciliter l'appel depuis Make/Airtable/Softr ; tu peux restreindre si besoin.

## ✅ Utilisation

- Ouvre l'app, saisis un **SIREN (9)**, **SIRET (14)** ou **TVA FR…**.
- Clique **Rechercher**.
- Tu obtiens une synthèse + la réponse **JSON** copiable/téléchargeable.

Bon usage !