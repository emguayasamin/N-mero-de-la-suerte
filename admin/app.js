const cfg = window.SUPABASE_CONFIG;
const { createClient } = window.supabase;
const db = createClient(cfg.url, cfg.publishableKey);

const loginCard = document.getElementById('loginCard');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMsg');
const dashMsg = document.getElementById('dashMsg');
const tbody = document.getElementById('tbody');
const search = document.getElementById('search');
const filter = document.getElementById('filter');

let rows = [];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function showMessage(el, text, error = false) {
  el.textContent = text || '';
  el.className = error ? 'msg error' : 'msg';
}

async function ensureAdmin() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return false;

  const { data, error } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

async function loadDashboard() {
  showMessage(dashMsg, 'Cargando datos...');

  const { data, error } = await db
    .from('raffle_numbers')
    .select('id,number,status,reserved_at,paid_at,participant_id,participants(name,phone)')
    .order('number', { ascending: true });

  if (error) throw error;
  rows = data || [];
  renderStats();
  renderTable();
  showMessage(dashMsg, `Última actualización: ${new Date().toLocaleString('es-EC')}`);
}

function renderStats() {
  const available = rows.filter(r => r.status === 'available').length;
  const reserved = rows.filter(r => r.status === 'reserved').length;
  const paid = rows.filter(r => r.status === 'paid').length;

  document.getElementById('available').textContent = available;
  document.getElementById('reserved').textContent = reserved;
  document.getElementById('paid').textContent = paid;
  document.getElementById('money').textContent = money(paid);
}

function renderTable() {
  const q = search.value.trim().toLowerCase();
  const selectedFilter = filter.value;

  const list = rows.filter(r => {
    if (selectedFilter !== 'all' && r.status !== selectedFilter) return false;
    if (!q) return true;
    const number = String(r.number).padStart(3, '0');
    const name = r.participants?.name || '';
    const phone = r.participants?.phone || '';
    return number.includes(q) || String(r.number).includes(q) || name.toLowerCase().includes(q) || phone.toLowerCase().includes(q);
  });

  tbody.innerHTML = '';

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay registros.</td></tr>';
    return;
  }

  for (const row of list) {
    const tr = document.createElement('tr');
    const participant = row.participants || {};
    const statusLabel = row.status === 'paid' ? 'PAGADO' : row.status === 'reserved' ? 'RESERVADO' : 'DISPONIBLE';
    const reservedAt = row.reserved_at ? new Date(row.reserved_at).toLocaleString('es-EC') : '—';

    tr.innerHTML = `
      <td><strong>${String(row.number).padStart(3, '0')}</strong></td>
      <td>${escapeHtml(participant.name || '—')}</td>
      <td>${escapeHtml(participant.phone || '—')}</td>
      <td>${statusLabel}</td>
      <td>${reservedAt}</td>
      <td class="actions"></td>
    `;

    const actions = tr.querySelector('.actions');

    if (row.status === 'reserved') {
      const pay = document.createElement('button');
      pay.textContent = 'Marcar pagado';
      pay.addEventListener('click', () => setStatus(row, 'paid'));
      actions.appendChild(pay);

      const release = document.createElement('button');
      release.textContent = 'Liberar';
      release.className = 'secondary';
      release.addEventListener('click', () => releaseNumber(row));
      actions.appendChild(release);
    } else if (row.status === 'paid') {
      const unpaid = document.createElement('button');
      unpaid.textContent = 'Quitar pago';
      unpaid.className = 'secondary';
      unpaid.addEventListener('click', () => setStatus(row, 'reserved'));
      actions.appendChild(unpaid);
    }

    tbody.appendChild(tr);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function setStatus(row, status) {
  const label = status === 'paid' ? 'marcar como pagado' : 'quitar el pago';
  if (!confirm(`¿Deseas ${label} el número ${String(row.number).padStart(3, '0')}?`)) return;

  showMessage(dashMsg, 'Guardando...');
  const payload = status === 'paid'
    ? { status: 'paid', paid_at: new Date().toISOString() }
    : { status: 'reserved', paid_at: null };

  const { error } = await db.from('raffle_numbers').update(payload).eq('id', row.id);
  if (error) {
    showMessage(dashMsg, error.message, true);
    return;
  }

  await loadDashboard();
}

async function releaseNumber(row) {
  if (!confirm(`¿Liberar el número ${String(row.number).padStart(3, '0')}? Esta acción lo dejará disponible.`)) return;

  showMessage(dashMsg, 'Liberando número...');
  const { error } = await db
    .from('raffle_numbers')
    .update({ participant_id: null, status: 'available', reserved_at: null, paid_at: null })
    .eq('id', row.id);

  if (error) {
    showMessage(dashMsg, error.message, true);
    return;
  }

  await loadDashboard();
}

async function enterDashboard() {
  loginCard.hidden = true;
  dashboard.hidden = false;
  try {
    const admin = await ensureAdmin();
    if (!admin) {
      await db.auth.signOut();
      loginCard.hidden = false;
      dashboard.hidden = true;
      showMessage(loginMsg, 'Este usuario no tiene permisos de administrador.', true);
      return;
    }
    await loadDashboard();
  } catch (error) {
    loginCard.hidden = false;
    dashboard.hidden = true;
    showMessage(loginMsg, error.message || 'No se pudo cargar el panel.', true);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(loginMsg, 'Ingresando...');

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    showMessage(loginMsg, error.message || 'Correo o contraseña incorrectos.', true);
    return;
  }

  await enterDashboard();
});

document.getElementById('logout').addEventListener('click', async () => {
  await db.auth.signOut();
  dashboard.hidden = true;
  loginCard.hidden = false;
  loginForm.reset();
  showMessage(loginMsg, 'Sesión cerrada.');
});

document.getElementById('refresh').addEventListener('click', () => loadDashboard().catch(error => showMessage(dashMsg, error.message, true)));
search.addEventListener('input', renderTable);
filter.addEventListener('change', renderTable);

db.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    dashboard.hidden = true;
    loginCard.hidden = false;
  }
});

(async () => {
  try {
    if (await ensureAdmin()) await enterDashboard();
  } catch (error) {
    showMessage(loginMsg, error.message || 'No se pudo iniciar el panel.', true);
  }
})();
