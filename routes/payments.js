// routes/payments.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// SDK Admin Kkiapay (vérification serveur des transactions)
const { kkiapay } = require('@kkiapay-org/nodejs-sdk');

const k = kkiapay({
  privatekey: process.env.KKIAPAY_PRIVATE_KEY,
  publickey: process.env.KKIAPAY_PUBLIC_KEY,
  secretkey: process.env.KKIAPAY_SECRET,
  sandbox: process.env.KKIAPAY_SANDBOX === 'true'
});

// Renvoie au client la clé publique + le mode sandbox, pour construire le widget
router.get('/config', (req, res) => {
  res.json({
    success: true,
    publicKey: process.env.KKIAPAY_PUBLIC_KEY,
    sandbox: process.env.KKIAPAY_SANDBOX === 'true'
  });
});

// Détails d'un paiement en attente (pour afficher le bon montant dans le widget)
router.get('/:paymentId', requireAuth, (req, res) => {
  const payment = db.prepare(`
    SELECT pay.*, s.id AS subscription_id
    FROM payments pay
    JOIN subscriptions s ON s.id = pay.subscription_id
    WHERE pay.id = ? AND pay.user_id = ?
  `).get(req.params.paymentId, req.session.userId);

  if (!payment) {
    return res.status(404).json({ success: false, message: 'Paiement introuvable' });
  }
  res.json({ success: true, payment });
});

// Étape 2 de l'intégration Kkiapay : vérification côté serveur de la transaction.
// Le widget côté client renvoie un transactionId après le paiement ; on NE FAIT JAMAIS
// confiance à ce qui vient du navigateur sans revérifier auprès de Kkiapay.
router.post('/verify', requireAuth, async (req, res) => {
  const { paymentId, transactionId } = req.body;

  if (!paymentId || !transactionId) {
    return res.status(400).json({ success: false, message: 'Paramètres manquants' });
  }

  const payment = db.prepare(`
    SELECT * FROM payments WHERE id = ? AND user_id = ?
  `).get(paymentId, req.session.userId);

  if (!payment) {
    return res.status(404).json({ success: false, message: 'Paiement introuvable' });
  }

  if (payment.status === 'success') {
    return res.json({ success: true, message: 'Paiement déjà confirmé' });
  }

  try {
    // Vérification réelle auprès des serveurs Kkiapay
    const verification = await k.verify(transactionId);

    const isSuccess = verification && verification.status === 'SUCCESS';
    const amountPaid = verification ? Number(verification.amount) : null;

    if (!isSuccess) {
      db.prepare(`
        UPDATE payments SET status = 'failed', kkiapay_transaction_id = ?,
          raw_response = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(transactionId, JSON.stringify(verification), paymentId);

      return res.status(402).json({ success: false, message: 'Paiement non confirmé par Kkiapay' });
    }

    // Sécurité : le montant payé doit correspondre au montant attendu
    if (amountPaid !== null && amountPaid !== payment.amount) {
      console.warn(`Montant incohérent pour paiement ${paymentId}: attendu ${payment.amount}, reçu ${amountPaid}`);
      db.prepare(`
        UPDATE payments SET status = 'failed', kkiapay_transaction_id = ?,
          raw_response = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(transactionId, JSON.stringify(verification), paymentId);

      return res.status(402).json({ success: false, message: 'Montant payé incohérent' });
    }

    // Tout est bon : on active le paiement et l'abonnement
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE payments SET status = 'success', kkiapay_transaction_id = ?,
          raw_response = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(transactionId, JSON.stringify(verification), paymentId);

      db.prepare(`
        UPDATE subscriptions SET status = 'active'
        WHERE id = ?
      `).run(payment.subscription_id);
    });
    tx();

    res.json({ success: true, message: 'Paiement confirmé, abonnement activé' });
  } catch (err) {
    console.error('Erreur vérification Kkiapay:', err);
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification du paiement' });
  }
});

module.exports = router;
