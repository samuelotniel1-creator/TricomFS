(function () {
  const gate = document.getElementById('gate');
  const content = document.getElementById('content');
  const keyInput = document.getElementById('key-input');
  const gateErr = document.getElementById('gate-err');
  const searchInput = document.getElementById('search-input');
  const rowsEl = document.getElementById('rows');
  const countEl = document.getElementById('count');

  if (!gate || !content || !keyInput || !rowsEl) return;

  let allPatients = [];
  let adminKey = '';

  async function tryLoad(key) {
    gateErr.textContent = '';
    try {
      const res = await fetch('/api/patients?key=' + encodeURIComponent(key));
      if (res.status === 401) { gateErr.textContent = 'Clave incorrecta.'; return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      adminKey = key;
      sessionStorage.setItem('tricom-admin-key', key);
      allPatients = data.patients || [];
      render();
      gate.style.display = 'none';
      content.style.display = 'block';
    } catch (err) {
      gateErr.textContent = 'No se pudo cargar el listado.';
    }
  }

  function matches(p, q) {
    if (!q) return true;
    return [p.name, p.email, p.phone, p.condition, p.medications, p.allergies, p.sleep, p.caffeineAlcohol, p.notes]
      .some((v) => (v || '').toLowerCase().includes(q));
  }

  function render() {
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const filtered = allPatients.filter((p) => matches(p, q));

    countEl.textContent = q
      ? `${filtered.length} de ${allPatients.length} paciente${allPatients.length === 1 ? '' : 's'}.`
      : `${allPatients.length} paciente${allPatients.length === 1 ? '' : 's'} registrado${allPatients.length === 1 ? '' : 's'}.`;

    if (filtered.length === 0) {
      rowsEl.innerHTML = `<tr><td colspan="10" class="empty">${allPatients.length === 0 ? 'Todavía no hay pacientes agendados.' : 'Sin resultados para esa búsqueda.'}</td></tr>`;
      return;
    }

    rowsEl.innerHTML = filtered.map((p) => `
      <tr data-id="${escapeHtml(p.id)}">
        <td>${new Date(p.start).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.email)}<div class="muted">${escapeHtml(p.phone)}</div></td>
        <td>${p.age} años<div class="muted">${escapeHtml(p.weight)}</div></td>
        <td>${escapeHtml(p.condition)}</td>
        <td>${escapeHtml(p.medications)}</td>
        <td>${escapeHtml(p.sleep)}</td>
        <td>${escapeHtml(p.caffeineAlcohol)}</td>
        <td>${escapeHtml(p.allergies)}</td>
        <td class="notes-cell">
          <textarea class="notes-input" rows="2" placeholder="Agregar nota…">${escapeHtml(p.notes)}</textarea>
          <button type="button" class="notes-save">Guardar</button>
          <span class="notes-status"></span>
        </td>
      </tr>
    `).join('');
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  rowsEl.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('notes-save')) return;
    const tr = e.target.closest('tr');
    const id = tr.getAttribute('data-id');
    const textarea = tr.querySelector('.notes-input');
    const status = tr.querySelector('.notes-status');
    const btn = e.target;
    btn.disabled = true;
    status.textContent = 'Guardando…';
    try {
      const res = await fetch(`/api/patients/${encodeURIComponent(id)}/notes?key=${encodeURIComponent(adminKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: textarea.value }),
      });
      if (!res.ok) throw new Error();
      const patient = allPatients.find((p) => p.id === id);
      if (patient) patient.notes = textarea.value;
      status.textContent = 'Guardado ✓';
      setTimeout(() => { status.textContent = ''; }, 2000);
    } catch (err) {
      status.textContent = 'Error al guardar.';
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('key-submit').addEventListener('click', () => tryLoad(keyInput.value));
  keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLoad(keyInput.value); });
  if (searchInput) searchInput.addEventListener('input', render);

  const saved = sessionStorage.getItem('tricom-admin-key');
  if (saved) tryLoad(saved);
})();
