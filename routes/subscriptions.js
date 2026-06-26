// routes/subscriptions.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function priceFor(plan, vehicleType) {
  if (vehicleType === 'truck') return plan.price_truck;
  return plan.price_car;
}

// Liste des forfaits disponibles (public, utile pour afficher les prix avant connexion)
router.get('/plans', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1').all();
  res.json({ success: true, plans });
});

// Véhicules du client connecté
router.get('/my-vehicles', requireAuth, (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles WHERE user_id = ?').all(req.session.userId);
  res.json({ success: true, vehicles });
});

// Ajouter un véhicule supplémentaire
router.post('/vehicles', requireAuth, (req, res) => {
  const { plate, vehicleType } = req.body;
  if (!plate) {
    return res.status(400).json({ success: false, message: 'Plaque requise' });
  }
  const existing = db.prepare('SELECT id FROM vehicles WHERE plate = ?').get(plate.toUpperCase());
  if (existing) {
    return res.status(409).json({ success: false, message: 'Cette plaque est déjà enregistrée' });
  }
  const result = db.prepare(`
    INSERT INTO vehicles (user_id, plate, vehicle_type) VALUES (?, ?, ?)
  `).run(req.session.userId, plate.toUpperCase(), vehicleType || 'car');

  res.json({ success: true, vehicleId: result.lastInsertRowid });
});

// Abonnements du client connecté (avec infos plan + véhicule)
router.get('/my-subscriptions', requireAuth, (req, res) => {
  const subs = db.prepare(`
    SELECT s.*, p.label AS plan_label, p.code AS plan_code, v.plate, v.vehicle_type
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    JOIN vehicles v ON v.id = s.vehicle_id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `).all(req.session.userId);

  res.json({ success: true, subscriptions: subs });
});

// Créer un abonnement (statut pending_payment, en attente du paiement Kkiapay)
router.post('/create', requireAuth, (req, res) => {
  const { vehicleId, planCode } = req.body;

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?')
    .get(vehicleId, req.session.userId);
  if (!vehicle) {
    return res.status(404).json({ success: false, message: 'Véhicule introuvable' });
  }

  const plan = db.prepare('SELECT * FROM plans WHERE code = ? AND active = 1').get(planCode);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'Forfait introuvable' });
  }

  // Si un abonnement actif existe déjà pour ce véhicule, on prolonge à partir de sa date de fin
  const activeSub = db.prepare(`
    SELECT * FROM subscriptions
    WHERE vehicle_id = ? AND status = 'active' AND end_date > datetime('now')
    ORDER BY end_date DESC LIMIT 1
  `).get(vehicle.id);

  const startDate = activeSub ? new Date(activeSub.end_date) : new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + plan.duration_days);

  const amount = priceFor(plan, vehicle.vehicle_type);

  const result = db.prepare(`
    INSERT INTO subscriptions (user_id, vehicle_id, plan_id, start_date, end_date, status)
    VALUES (?, ?, ?, ?, ?, 'pending_payment')
  `).run(req.session.userId, vehicle.id, plan.id, startDate.toISOString(), endDate.toISOString());

  const subscriptionId = result.lastInsertRowid;

  const paymentResult = db.prepare(`
    INSERT INTO payments (subscription_id, user_id, amount, method, status)
    VALUES (?, ?, ?, 'kkiapay', 'pending')
  `).run(subscriptionId, req.session.userId, amount);

  res.json({
    success: true,
    subscriptionId,
    paymentId: paymentResult.lastInsertRowid,
    amount
  });
});

module.exports = router;
