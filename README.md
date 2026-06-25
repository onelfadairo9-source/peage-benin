# Péage Bénin — Plateforme d'abonnement au télépéage

Plateforme complète : inscription/connexion clients, gestion de véhicules,
souscription d'abonnements, paiement réel via **Kkiapay** (Mobile Money MTN/Moov +
carte bancaire), espace administrateur, et une API consultée par les barrières
automatiques (Arduino/ESP8266) pour vérifier si une plaque est abonnée.

## Stack technique

- **Backend** : Node.js + Express
- **Base de données** : SQLite (via `better-sqlite3`), fichier local `db/peage.db`
- **Sessions** : stockées dans SQLite (`connect-sqlite3`), survivent à un redémarrage
- **Authentification** : mots de passe hashés avec `bcryptjs`
- **Paiement** : Kkiapay (widget JS côté client + SDK Admin Node.js pour la vérification serveur)
- **Frontend** : HTML/CSS/JS vanilla, pas de framework — facile à modifier

## Installation

```bash
npm install
cp .env.example .env
```

Puis ouvrez `.env` et renseignez :

1. `SESSION_SECRET` — une longue chaîne aléatoire (ex: générée avec `openssl rand -hex 32`)
2. Vos clés **Kkiapay**, récupérables sur https://app.kkiapay.me/dashboard :
   - `KKIAPAY_PUBLIC_KEY`
   - `KKIAPAY_PRIVATE_KEY`
   - `KKIAPAY_SECRET`
   - `KKIAPAY_SANDBOX=true` pendant les tests, `false` en production
3. `ADMIN_EMAIL` / `ADMIN_PASSWORD` — identifiants du premier compte admin,
   créé automatiquement au premier démarrage.

## Démarrage

```bash
npm start
```

La plateforme est accessible sur `http://localhost:3000`.

- Page d'accueil : `/`
- Inscription client : `/register.html`
- Connexion client : `/login.html`
- Espace client : `/dashboard.html`
- Connexion admin : `/admin-login.html`
- Espace admin : `/admin-dashboard.html`

## Paiement Kkiapay — comment ça marche

L'intégration suit le flux officiel en deux étapes :

1. **Côté client** (`dashboard.html`) : le widget `openKkiapayWidget()` s'ouvre avec
   le montant exact calculé par le serveur (jamais par le navigateur, pour éviter
   qu'un client modifie le prix). Le client paie en Mobile Money ou carte.
2. **Côté serveur** (`routes/payments.js`) : dès que le widget confirme le succès,
   le frontend envoie l'identifiant de transaction au serveur, qui **revérifie la
   transaction auprès des serveurs Kkiapay** (`k.verify(transactionId)`) avant
   d'activer l'abonnement. On ne fait jamais confiance à ce qui vient du navigateur
   seul — c'est la règle d'or anti-fraude de toute intégration de paiement.

En mode sandbox (`KKIAPAY_SANDBOX=true`), utilisez les numéros de test fournis par
Kkiapay dans leur documentation pour simuler des paiements sans vrai argent.

## API pour les barrières automatiques (Arduino / ESP8266)

Chaque barrière interroge en HTTP :

```
GET /api/check-subscription/AB-1234-CD
```

Réponse :
```json
{ "subscribed": true, "validUntil": "2026-07-25T10:00:00.000Z", "vehicleType": "car" }
```

Chaque interrogation est aussi journalisée dans la table `passages`, visible dans
l'onglet **Passages barrière** de l'espace admin (utile pour détecter les tentatives
de fraude ou les pannes de capteur).

Exemple de code Arduino/ESP8266 (pseudo-code) :

```cpp
String plate = "AB-1234-CD";
String url = "http://votre-serveur:3000/api/check-subscription/" + plate;

HTTPClient http;
http.begin(url);
int httpCode = http.GET();

if (httpCode == 200) {
  String payload = http.getString();
  // Décoder le JSON, si subscribed == true -> ouvrir la barrière
}
http.end();
```

## Structure du projet

```
peage-benin/
├── server.js                 # Point d'entrée, montage des routes et middlewares
├── db/
│   └── database.js           # Schéma SQLite + données initiales (plans, admin)
├── middleware/
│   └── auth.js                # Garde-fous de session (client / admin)
├── routes/
│   ├── auth.js                 # Inscription, connexion client/admin
│   ├── subscriptions.js         # Véhicules, forfaits, création d'abonnement
│   ├── payments.js               # Intégration Kkiapay (config + vérification)
│   ├── admin.js                    # Statistiques, gestion globale
│   └── api.js                       # Route publique pour les barrières
├── views/                     # Pages HTML
└── public/
    ├── css/style.css           # Charte graphique (bleu nuit / jaune signalétique)
    └── js/common.js             # Helpers JS partagés
```

## Sécurité — points importants avant la mise en production

- Changez `SESSION_SECRET` et le mot de passe admin par défaut.
- Mettez `NODE_ENV=production` et servez le site en HTTPS (cookies marqués `secure`).
- Passez `KKIAPAY_SANDBOX=false` et utilisez vos clés de production Kkiapay.
- Le fichier `.env` ne doit jamais être commité (`.gitignore` le couvre déjà).
- Sauvegardez régulièrement `db/peage.db` (contient clients, abonnements, paiements).

## Limites connues / pistes d'amélioration

- Pas encore de réinitialisation de mot de passe par SMS/email.
- Pas de webhook Kkiapay pour les paiements asynchrones (la vérification se fait
  uniquement au retour du widget) — utile à ajouter si vous activez des paiements
  différés.
- Le calcul du prix dépend du type de véhicule déclaré par le client à l'inscription ;
  un contrôle physique aux postes ou une vérification via la carte grise peut être
  ajouté si nécessaire pour éviter les fausses déclarations.
