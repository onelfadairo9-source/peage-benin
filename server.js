// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const subscriptionRoutes = require('./routes/subscriptions');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions persistées dans SQLite (survivent à un redémarrage du serveur)
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'db') }),
  secret: process.env.SESSION_SECRET || 'changez_ce_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Limite de débit générale pour éviter les abus (la route API barrière a sa propre limite, plus permissive)
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/auth', generalLimiter);

// Limite de débit dédiée à la connexion (anti brute-force)
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/admin-login', loginLimiter);

// Limite plus large pour la route consultée par les barrières automatiques
const barrierLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use('/api/check-subscription', barrierLimiter);

// --- Routes API ---
app.use('/api/auth', authRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes); // expose /api/check-subscription/:plate

// --- Fichiers statiques (HTML, CSS, JS) ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// 404 simple pour les routes API inconnues
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Route API introuvable' });
});

app.listen(PORT, () => {
  console.log(`\nPlateforme Péage Bénin démarrée sur http://localhost:${PORT}`);
  console.log(`Mode Kkiapay : ${process.env.KKIAPAY_SANDBOX === 'true' ? 'SANDBOX (test)' : 'PRODUCTION'}\n`);
});
