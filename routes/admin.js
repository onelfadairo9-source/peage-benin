// routes/admin.js
const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Tableau de bord : statistiques générales
router.get('/stats', requireAdmin, (req, res) => {
  const totalUsers = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'client'`).get().c;
  const totalVehicles = db.prepare(`SELECT COUNT(*) AS c FROM vehicles`).get().c;
  const activeSubscriptions = db.prepare(`
    SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active' AND end_date > datetime('now')
  `).get().c;
  const revenueTotal = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE status = 'success'
  `).get().s;
  const revenueThisMonth = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM payments
    WHERE status = 'success' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
  `).get().s;
  const passagesToday = db.prepare(`
    SELECT COUNT(*) AS c FROM passages WHERE date(created_at) = date('now')
  `).get().c;
  const passagesDeniedToday = db.prepare(`
    SELECT COUNT(*) AS c FROM passages WHERE date(created_at) = date('now') AND allowed = 0
  `).get().c;

  res.json({
    success: true,
    stats: {
      totalUsers,
      totalVehicles,
      activeSubscriptions,
      revenueTotal,
      revenueThisMonth,
      passagesToday,
      passagesDeniedToday
    }
  });
});

// Liste de tous les clients avec leurs véhicules
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, phone, email, created_at FROM users WHERE role = 'client'
    ORDER BY created_at DESC
  `).all();

  const vehiclesStmt = db.prepare('SELECT * FROM vehicles WHERE user_id = ?');
  const usersWithVehicles = users.map(u => ({
    ...u,
    vehicles: vehiclesStmt.all(u.id)
  }));

  res.json({ success: true, users: usersWithVehicles });
});

// Liste de tous les abonnements (avec filtre optionnel par statut)
router.get('/subscriptions', requireAdmin, (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT s.*, u.name AS user_name, u.phone, p.label AS plan_label, v.plate, v.vehicle_type
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    JOIN plans p ON p.id = s.plan_id
    JOIN vehicles v ON v.id = s.vehicle_id
  `;
  const params = [];
  if (status) {
    query += ' WHERE s.status = ?';
    params.push(status);
  }
  query += ' ORDER BY s.created_at DESC';

  const subs = db.prepare(query).all(...params);
  res.json({ success: true, subscriptions: subs });
});

// Liste de tous les paiements
router.get('/payments', requireAdmin, (req, res) => {
  const payments = db.prepare(`
    SELECT pay.*, u.name AS user_name, u.phone
    FROM payments pay
    JOIN users u ON u.id = pay.user_id
    ORDER BY pay.created_at DESC
  `).all();
  res.json({ success: true, payments });
});

// Historique des passages à la barrière
router.get('/passages', requireAdmin, (req, res) => {
  const passages = db.prepare(`
    SELECT * FROM passages ORDER BY created_at DESC LIMIT 200
  `).all();
  res.json({ success: true, passages });
});

// Annuler / réactiver un abonnement manuellement
router.post('/subscriptions/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ['active', 'cancelled', 'expired', 'pending_payment'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Statut invalide' });
  }
  db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// Gestion des forfaits (modifier les prix)
router.get('/plans', requireAdmin, (req, res) => {
  const plans = db.prepare('SELECT * FROM plans').all();
  res.json({ success: true, plans });
});

router.put('/plans/:id', requireAdmin, (req, res) => {
  const { price_car, price_truck, price_moto, active } = req.body;
  db.prepare(`
    UPDATE plans SET price_car = ?, price_truck = ?, price_moto = ?, active = ?
    WHERE id = ?
  `).run(price_car, price_truck, price_moto, active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

module.exports = router;
