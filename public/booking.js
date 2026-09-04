(function () {
  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  const state = {
    availability: [],
    selectedDay: null,
    selectedSlot: null,
  };

  const el = {
    loading: document.getElementById('bk-loading'),
    daysWrap: document.getElementById('bk-days-wrap'),
    dayList: document.getElementById('day-list'),
    slotsWrap: document.getElementById('slots-wrap'),
    slotList: document.getElementById('slot-list'),
    backToDays: document.getElementById('back-to-days'),
    backToSlots: document.getElementById('back-to-slots'),
    panelDays: document.getElementById('panel-days'),
    panelForm: document.getElementById('panel-form'),
    panelConfirm: document.getElementById('panel-confirm'),
    step1: document.getElementById('bk-step-1'),
    step2: document.getElementById('bk-step-2'),
    step3: document.getElementById('bk-step-3'),
    selectedSlotPill: document.getElementById('selected-slot-pill'),
    form: document.getElementById('patient-form'),
    submitBtn: document.getElementById('submit-btn'),
    formError: document.getElementById('form-error'),
    confirmDetail: document.getElementById('confirm-detail'),
  };

  function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  function fmtDay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return { dow: DOW[d.getDay()], num: d.getDate(), month: MONTHS[d.getMonth()] };
  }
  function fmtFull(dateStr, iso) {
    const d = new Date(dateStr + 'T12:00:00');
    return `${DOW[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]} · ${fmtTime(iso)}`;
  }

  function showPanel(name) {
    [el.panelDays, el.panelForm, el.panelConfirm].forEach(p => p.classList.remove('active'));
    [el.step1, el.step2, el.step3].forEach(s => s.innerHTML = s.innerHTML.replace(/<b>|<\/b>/g, ''));
    if (name === 'days') { el.panelDays.classList.add('active'); }
    if (name === 'form') { el.panelForm.classList.add('active'); el.step2.innerHTML = '<b>2</b> Tu historial'; }
    if (name === 'confirm') { el.panelConfirm.classList.add('active'); el.step3.innerHTML = '<b>3</b> Confirmación'; }
    if (name === 'days') { el.step1.innerHTML = '<b>1</b> Horario'; }
  }

  async function loadAvailability() {
    try {
      const res = await fetch('/api/availability');
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.availability = data.availability || [];
      renderDays();
    } catch (err) {
      el.loading.textContent = 'No pudimos consultar la disponibilidad en este momento. Intenta más tarde o escríbenos directamente.';
    }
  }

  function renderDays() {
    el.loading.style.display = 'none';
    el.daysWrap.style.display = 'block';

    if (state.availability.length === 0) {
      el.dayList.innerHTML = '<p style="opacity:.6">No hay horarios disponibles por ahora. Vuelve a intentarlo más tarde.</p>';
      return;
    }

    el.dayList.innerHTML = '';
    state.availability.forEach((day) => {
      const { dow, num, month } = fmtDay(day.date);
      const btn = document.createElement('button');
      btn.className = 'day-btn';
      btn.type = 'button';
      btn.innerHTML = `<span class="dow">${dow} · ${month}</span><span class="dnum">${num}</span><span class="dcount">${day.slots.length} horario${day.slots.length === 1 ? '' : 's'}</span>`;
      btn.addEventListener('click', () => selectDay(day, btn));
      el.dayList.appendChild(btn);
    });
  }

  function selectDay(day, btn) {
    state.selectedDay = day;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');

    el.slotsWrap.style.display = 'block';
    el.slotList.innerHTML = '';
    day.slots.forEach((slot) => {
      const sbtn = document.createElement('button');
      sbtn.className = 'slot-btn';
      sbtn.type = 'button';
      sbtn.textContent = fmtTime(slot.start);
      sbtn.addEventListener('click', () => selectSlot(slot, sbtn));
      el.slotList.appendChild(sbtn);
    });
    el.slotsWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function selectSlot(slot, btn) {
    state.selectedSlot = slot;
    document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    el.selectedSlotPill.innerHTML = `Horario elegido: <b>${fmtFull(state.selectedDay.date, slot.start)}</b>`;
    showPanel('form');
  }

  el.backToDays.addEventListener('click', () => { el.slotsWrap.style.display = 'none'; });
  el.backToSlots.addEventListener('click', () => showPanel('days'));

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.formError.textContent = '';
    if (!state.selectedSlot) { el.formError.textContent = 'Elige un horario primero.'; return; }

    const fd = new FormData(el.form);
    const payload = {
      start: state.selectedSlot.start,
      end: state.selectedSlot.end,
      name: fd.get('name').trim(),
      email: fd.get('email').trim(),
      phone: fd.get('phone').trim(),
      age: fd.get('age') ? Number(fd.get('age')) : null,
      condition: fd.get('condition').trim(),
      medications: fd.get('medications').trim(),
      allergies: fd.get('allergies').trim(),
      notes: fd.get('notes').trim(),
    };

    el.submitBtn.disabled = true;
    el.submitBtn.textContent = 'Agendando…';

    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo agendar la cita.');

      el.confirmDetail.textContent = `Quedaste agendada/o el ${fmtFull(state.selectedDay.date, payload.start)}. Te llegó una invitación a ${payload.email} — acéptala para que se agregue a tu propio calendario.`;
      showPanel('confirm');
    } catch (err) {
      el.formError.textContent = err.message;
      if (err.message && err.message.includes('ya no está disponible')) {
        await loadAvailability();
      }
    } finally {
      el.submitBtn.disabled = false;
      el.submitBtn.textContent = 'Confirmar cita';
    }
  });

  loadAvailability();
})();
