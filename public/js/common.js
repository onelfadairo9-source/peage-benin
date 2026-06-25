// public/js/common.js
// Quelques aides partagées par les différentes pages.

function showAlert(el, message, type = 'error') {
  el.textContent = message;
  el.className = `alert show alert-${type}`;
}

function hideAlert(el) {
  el.className = 'alert';
}

function fmtFCFA(n) {
  return Number(n).toLocaleString('fr-FR') + ' FCFA';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABELS = {
  active: 'Actif',
  pending_payment: 'En attente de paiement',
  expired: 'Expiré',
  cancelled: 'Annulé',
  success: 'Réussi',
  pending: 'En attente',
  failed: 'Échoué'
};

function statusBadge(status) {
  const cls = {
    active: 'badge-active',
    success: 'badge-active',
    pending_payment: 'badge-pending',
    pending: 'badge-pending',
    expired: 'badge-expired',
    cancelled: 'badge-cancelled',
    failed: 'badge-failed'
  }[status] || 'badge-pending';
  return `<span class="badge ${cls}">${STATUS_LABELS[status] || status}</span>`;
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}
