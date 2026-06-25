// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const router = express.Router();

// --- Inscription client ---
router.post('/register', (req, res) => {
  const { name, phone, email, password, plate, vehicleType } = req.body;

  if (!name || !phone || !password || !plate) {
    return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Le mot de passe doit faire au moins 6 caractères' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) {
    return res.status(409).json({ success: false, message: 'Ce numéro est déjà utilisé. Connectez-vous plutôt.' });
  }

  const existingPlate = db.prepare('SELECT id FROM vehicles WHERE plate = ?').get(plate.toUpperCase());
  if (existingPlate) {
    return res.status(409).json({ success: false, message: 'Cette plaque est déjà enregistrée.' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const insertUser = db.prepare(`
      INSERT INTO users (name, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, 'client')
    `);
    const result = insertUser.run(name, phone, email || null, hash);
    const userId = result.lastInsertRowid;

    db.prepare(`
      INSERT INTO vehicles (user_id, plate, vehicle_type)
      VALUES (?, ?, ?)
    `).run(userId, plate.toUpperCase(), vehicleType || 'car');

    req.session.userId = userId;
    req.session.role = 'client';
    req.session.name = name;

    res.json({ success: true, message: 'Compte créé avec succès', userId });
  } catch (err) {
    console.error('Erreur inscription:', err);
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la création du compte' });
  }
});

// --- Connexion client ---
router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ success: false, message: 'Téléphone et mot de passe requis' });
  }

  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND role = ?').get(phone, 'client');
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.name = user.name;

  res.json({ success: true, message: 'Connexion réussie' });
});

// --- Connexion admin ---
router.post('/admin-login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email, 'admin');
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.name = user.name;

  res.json({ success: true, message: 'Connexion admin réussie' });
});

// --- Déconnexion ---
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// --- Infos sur la session courante ---
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false });
  }
  res.json({
    success: true,
    userId: req.session.userId,
    role: req.session.role,
    name: req.session.name
  });
});

module.exports = router;
