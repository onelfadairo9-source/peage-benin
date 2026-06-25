// db/database.js
// Initialise la base SQLite et crée toutes les tables nécessaires.
// Utilise better-sqlite3 : synchrone, simple, parfait pour ce volume de trafic.

const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'peage.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client', -- 'client' ou 'admin'
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plate TEXT UNIQUE NOT NULL,
      vehicle_type TEXT NOT NULL DEFAULT 'car', -- car, truck, moto
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,       -- monthly, quarterly, annual
      label TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      price_car INTEGER NOT NULL,
      price_truck INTEGER NOT NULL,
      price_moto INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment, active, expired, cancelled
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL DEFAULT 'kkiapay', -- kkiapay
      kkiapay_transaction_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending, success, failed
      raw_response TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS passages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate TEXT NOT NULL,
      gate TEXT DEFAULT 'principal',
      allowed INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);

  // Plans par défaut (prix en FCFA)
  const countPlans = db.prepare('SELECT COUNT(*) AS c FROM plans').get().c;
  if (countPlans === 0) {
    const insertPlan = db.prepare(`
      INSERT INTO plans (code, label, duration_days, price_car, price_truck, price_moto)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertPlan.run('monthly', 'Abonnement mensuel', 30, 5000, 15000, 2000);
    insertPlan.run('quarterly', 'Abonnement trimestriel', 90, 13500, 40500, 5400);
    insertPlan.run('annual', 'Abonnement annuel', 365, 48000, 144000, 19200);
  }

  // Compte admin par défaut (à partir des variables d'environnement)
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@peage-benin.bj';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`
      INSERT INTO users (name, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, 'admin')
    `).run('Administrateur', '00000000', adminEmail, hash);
    console.log(`Compte admin créé : ${adminEmail} / mot de passe défini dans .env`);
  }
}

init();

module.exports = db;
