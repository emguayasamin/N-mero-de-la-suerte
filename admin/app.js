document.addEventListener('DOMContentLoaded', async () => {

  if (!window.supabase) {
    console.error('Supabase JS no cargó.');
    return;
  }

  if (!window.SUPABASE_CONFIG) {
    console.error('config.js no cargó.');
    return;
  }

  const { createClient } = window.supabase;

  const sb = createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.publishableKey
  );

  const $ = id => document.getElementById(id);

  let rows = [];

  // Elementos
  const loginForm = $('loginForm');
  const loginMsg = $('loginMsg');

  if (!loginForm) {
    console.error('No se encontró loginForm en index.html');
    return;
  }

  // LOGIN
  loginForm.addEventListener('submit', async (e) => {

    e.preventDefault();

    loginMsg.textContent = 'Ingresando...';

    const email = $('email').value.trim();
    const password = $('password').value;

    if (!email || !password) {
      loginMsg.textContent = 'Ingresa tu correo y contraseña.';
      return;
    }

    try {

      const { data, error } = await sb.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        console.error('Error de login:', error);
        loginMsg.textContent = error.message;
        return;
      }

      if (!data.session) {
        loginMsg.textContent = 'No se pudo iniciar la sesión.';
        return;
      }

      loginMsg.textContent = 'Acceso correcto.';

      await showDashboard();

    } catch (err) {

      console.error(err);
      loginMsg.textContent =
        'Error inesperado: ' + (err.message || err);

    }

  });


  // CERRAR SESIÓN
  if ($('logout')) {
    $('logout').onclick = async () => {
      await sb.auth.signOut();
      location.reload();
    };
  }


  // BOTONES
  if ($('refresh')) {
    $('refresh').onclick = loadData;
  }

  if ($('search')) {
    $('search').oninput = render;
  }

  if ($('filter')) {
    $('filter').onchange = render;
  }


  // COMPROBAR SESIÓN
  async function checkSession() {

    try {

      const {
        data: { session }
      } = await sb.auth.getSession();

      if (session) {
        await showDashboard();
      } else {
        $('loginCard').hidden = false;
      }

    } catch (err) {

      console.error('Error comprobando sesión:', err);
      $('loginMsg').textContent = 'Error al conectar con Supabase.';

    }

  }


  // MOSTRAR PANEL
  async function showDashboard() {

    const {
      data: { user }
    } = await sb.auth.getUser();

    if (!user) {
      location.reload();
      return;
    }

    const {
      data: isAdmin,
      error
    } = await sb.rpc('is_admin');

    if (error || isAdmin !== true) {

      $('loginCard').hidden = false;
      $('dashboard').hidden = true;

      $('loginMsg').textContent =
        'Usuario sin permisos de administrador.';

      await sb.auth.signOut();

      return;
    }

    $('loginCard').hidden = true;
    $('dashboard').hidden = false;

    await loadData();

  }


  // CARGAR NÚMEROS
  async function loadData() {

    $('dashMsg').textContent = 'Cargando...';

    const {
      data,
      error
    } = await sb
      .from('raffle_numbers')
      .select(
        'number,status,participant_id,reserved_at,paid_at,participants(name,phone)'
      )
      .order('number');

    if (error) {

      console.error(error);

      $('dashMsg').textContent = error.message;

      return;
    }

    rows = data || [];

    updateStats();
    render();

    $('dashMsg').textContent = '';

  }


  // ESTADÍSTICAS
  function updateStats() {

    const available =
      rows.filter(x => x.status === 'available').length;

    const reserved =
      rows.filter(x => x.status === 'reserved').length;

    const paid =
      rows.filter(x => x.status === 'paid').length;

    $('available').textContent = available;
    $('reserved').textContent = reserved;
    $('paid').textContent = paid;
    $('money').textContent = `$${paid}`;

  }


  // TABLA
  function render() {

    const q =
      $('search').value.toLowerCase().trim();

    const f =
      $('filter').value;

    const list = rows.filter(x => {

      if (f !== 'all' && x.status !== f) {
        return false;
      }

      const p = x.participants;

      return (
        !q ||
        String(x.number).includes(q) ||
        (p?.name || '').toLowerCase().includes(q) ||
        (p?.phone || '').includes(q)
      );

    });


    $('tbody').innerHTML = list.length

      ? list.map(x => {

          const p = x.participants;

          const date =
            x.reserved_at
              ? new Date(x.reserved_at).toLocaleString('es-EC')
              : '—';

          let action = '—';

          if (x.status === 'reserved') {

            action = `
              <button
                class="action"
                onclick="markPaid(${x.number})">
                Marcar pagado
              </button>

              <button
                class="action danger"
                onclick="releaseNumber(${x.number})">
                Liberar
              </button>
            `;

          } else if (x.status === 'paid') {

            action = `
              <button
                class="action danger"
                onclick="releaseNumber(${x.number})">
                Liberar
              </button>
            `;

          }

          return `
            <tr>
              <td>
                <strong>
                  ${String(x.number).padStart(3, '0')}
                </strong>
              </td>

              <td>${esc(p?.name || '—')}</td>

              <td>${esc(p?.phone || '—')}</td>

              <td>
                <span class="badge ${x.status}">
                  ${
                    x.status === 'reserved'
                      ? 'RESERVADO'
                      : x.status === 'paid'
                        ? 'PAGADO'
                        : 'DISPONIBLE'
                  }
                </span>
              </td>

              <td>${date}</td>

              <td>${action}</td>
            </tr>
          `;

        }).join('')

      : `
        <tr>
          <td colspan="6" class="empty">
            No hay resultados.
          </td>
        </tr>
      `;

  }


  // MARCAR PAGADO
  window.markPaid = async function(number) {

    if (
      !confirm(
        `¿Confirmar pago del número ${String(number).padStart(3, '0')}?`
      )
    ) {
      return;
    }

    const { error } =
      await sb.rpc('admin_mark_paid', {
        p_number: number
      });

    if (error) {

      alert(error.message);

      return;
    }

    await loadData();

  };


  // LIBERAR
  window.releaseNumber = async function(number) {

    if (
      !confirm(
        `¿Liberar el número ${String(number).padStart(3, '0')}? Esta acción elimina su asignación.`
      )
    ) {
      return;
    }

    const { error } =
      await sb.rpc('admin_release_number', {
        p_number: number
      });

    if (error) {

      alert(error.message);

      return;
    }

    await loadData();

  };


  // ESCAPAR HTML
  function esc(s) {

    return String(s).replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[c])
    );

  }


  // INICIAR
  await checkSession();

});
