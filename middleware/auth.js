// middleware/auth.js
// Petits gardiens de route : vérifient la session avant de laisser passer.

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Non authentifié' });
  }
  return res.redirect('/login.html');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ success: false, message: 'Accès réservé aux administrateurs' });
  }
  return res.redirect('/admin-login.html');
}

module.exports = { requireAuth, requireAdmin };
