// routes/api.js
// Routes publiques consommées par le boîtier Arduino/ESP8266 de chaque barrière.
// Volontairement minimalistes et rapides : le microcontrôleur n'a pas de session.

const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Vérifie si une plaque est actuellement couverte par un abonnement actif.
// Utilisé par l'ESP8266 : GET /api/check-subscription/AB-123-CD
router.get('/check-subscription/:plate', (req, res) => {
  const plate = req.params.plate.toUpperCase();

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE plate = ?').get(plate);

  let allowed = false;
  let validUntil = null;
  let vehicleType = null;

  if (vehicle) {
    const sub = db.prepare(`
      SELECT * FROM subscriptions
      WHERE vehicle_id = ? AND status = 'active' AND end_date > datetime('now')
      ORDER BY end_date DESC LIMIT 1
    `).get(vehicle.id);

    if (sub) {
      allowed = true;
      validUntil = sub.end_date;
      vehicleType = vehicle.vehicle_type;
    }
  }

  // On journalise chaque passage pour historique / audit de la barrière
  db.prepare(`
    INSERT INTO passages (plate, gate, allowed) VALUES (?, ?, ?)
  `).run(plate, req.query.gate || 'principal', allowed ? 1 : 0);

  res.json({
    subscribed: allowed,
    validUntil,
    vehicleType
  });
});

module.exports = router;
