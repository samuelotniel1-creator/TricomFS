(function () {
  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

  const state = {
    year: null,
    month: null,
    selectedSlot: null,
    selectedDate: null,
  };

  const el = {
    loading: document.getElementById('bk-loading'),
    calWrap: document.getElementById('bk-cal-wrap'),
    calPrev: document.getElementById('cal-prev'),
    calNext: document.getElementById('cal-next'),
    calMonthLabel: document.getElementById('cal-month-label'),
    calTableWrap: document.querySelector('.cal-table-wrap'),
    calTableHead: document.getElementById('cal-table-head'),
    calTableBody: document.getElementById('cal-table-body'),
    calEmpty: document.getElementById('cal-empty'),
    panelForm: document.getElementById('panel-form'),
    panelConfirm: document.getElementById('panel-confirm'),
    backToSlots: document.getElementById('back-to-slots'),
    step1: document.getElementById('bk-step-1'),
    step2: document.getElementById('bk-step-2'),
    step3: document.getElementById('bk-step-3'),
    panelDays: document.getElementById('panel-days'),
    selectedSlotPill: document.getElementById('selected-slot-pill'),
    form: document.getElementById('patient-form'),
    submitBtn: document.getElementById('submit-btn'),
    formError: document.getElementById('form-error'),
    confirmDetail: document.getElementById('confirm-detail'),
    addGoogleCal: document.getElementById('add-google-cal'),
    addIcsCal: document.getElementById('add-ics-cal'),
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  function fmtDay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return { dow: DOW[d.getDay()], num: d.getDate() };
  }
  function fmtFull(dateStr, iso) {
    const d = new Date(dateStr + 'T12:00:00');
    return `${DOW[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]} · ${fmtTime(iso)}`;
  }

  function showPanel(name) {
    [el.panelDays, el.panelForm, el.panelConfirm].forEach((p) => p.classList.remove('active'));
    [el.step1, el.step2, el.step3].forEach((s) => { s.innerHTML = s.innerHTML.replace(/<b>|<\/b>/g, ''); });
    if (name === 'days') { el.panelDays.classList.add('active'); el.step1.innerHTML = '<b>1</b> Horario'; }
    if (name === 'form') { el.panelForm.classList.add('active'); el.step2.innerHTML = '<b>2</b> Tu historial'; }
    if (name === 'confirm') { el.panelConfirm.classList.add('active'); el.step3.innerHTML = '<b>3</b> Confirmación'; }
  }

  function toCompactUTC(iso) {
    const d = new Date(iso);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate())
      + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  function buildCalendarLinks({ start, end }) {
    const summary = 'Consulta CBD — Tricom FS';
    const details = 'Consulta con Marisol Zepeda Janet — Tricom FS. Revisa tu correo para más detalles.';

    const gcalUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(summary)
      + '&dates=' + toCompactUTC(start) + '/' + toCompactUTC(end)
      + '&details=' + encodeURIComponent(details)
      + '&location=' + encodeURIComponent('Tricom FS');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Tricom FS//Agenda//ES',
      'BEGIN:VEVENT',
      'UID:' + toCompactUTC(new Date().toISOString()) + '-' + Math.random().toString(36).slice(2, 8) + '@tricomfs',
      'DTSTAMP:' + toCompactUTC(new Date().toISOString()),
      'DTSTART:' + toCompactUTC(start),
      'DTEND:' + toCompactUTC(end),
      'SUMMARY:' + summary,
      'DESCRIPTION:' + details,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const icsUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));

    return { gcalUrl, icsUrl };
  }

  async function loadMonth(year, month) {
    el.calWrap.style.display = 'none';
    el.loading.style.display = 'block';
    el.loading.textContent = 'Consultando disponibilidad real del calendario…';

    try {
      const qs = (year && month) ? `?year=${year}&month=${month}` : '';
      const res = await fetch('/api/availability' + qs);
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.year = data.year;
      state.month = data.month;
      renderMonth(data);
    } catch (err) {
      el.loading.textContent = 'No pudimos consultar la disponibilidad en este momento. Intenta más tarde o escríbenos directamente.';
    }
  }

  function cellHtml(slot) {
    const time = fmtTime(slot.start);
    if (slot.status === 'free') {
      return `<td><button type="button" class="cal-slot-btn" data-start="${slot.start}" data-end="${slot.end}">${time}</button></td>`;
    }
    if (slot.status === 'booked') {
      return `<td><button type="button" class="cal-slot-btn booked" disabled>${time}</button></td>`;
    }
    return `<td><button type="button" class="cal-slot-btn past" disabled>${time}</button></td>`;
  }

  function renderMonth(data) {
    el.loading.style.display = 'none';
    el.calWrap.style.display = 'block';

    const label = `${MONTH_NAMES[data.month - 1]} ${data.year}`;
    el.calMonthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    el.calPrev.disabled = !data.canGoPrev;
    el.calNext.disabled = !data.canGoNext;

    if (!data.days || data.days.length === 0) {
      el.calTableWrap.style.display = 'none';
      el.calEmpty.style.display = 'block';
      return;
    }
    el.calTableWrap.style.display = 'block';
    el.calEmpty.style.display = 'none';

    el.calTableHead.innerHTML = data.days.map((day) => {
      const { dow, num } = fmtDay(day.date);
      return `<th data-date="${day.date}">${dow}<span class="cal-day-num">${num}</span></th>`;
    }).join('');

    el.calTableBody.innerHTML = HOURS.map((_, rowIdx) => {
      const cells = data.days.map((day) => cellHtml(day.slots[rowIdx] || { status: 'past', start: '', end: '' })
        .replace('<td>', `<td data-date="${day.date}">`)).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
  }

  el.calTableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.cal-slot-btn');
    if (!btn || btn.disabled) return;
    document.querySelectorAll('.cal-slot-btn.sel').forEach((b) => b.classList.remove('sel'));
    btn.classList.add('sel');

    const start = btn.getAttribute('data-start');
    const end = btn.getAttribute('data-end');
    const date = btn.closest('td').getAttribute('data-date');
    state.selectedSlot = { start, end };
    state.selectedDate = date;

    el.selectedSlotPill.innerHTML = `Horario elegido: <b>${fmtFull(date, start)}</b>`;
    showPanel('form');
  });

  el.calPrev.addEventListener('click', () => {
    let { year, month } = state;
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
    loadMonth(year, month);
  });
  el.calNext.addEventListener('click', () => {
    let { year, month } = state;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    loadMonth(year, month);
  });

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
      weight: fd.get('weight').trim(),
      condition: fd.get('condition').trim(),
      medications: fd.get('medications').trim(),
      sleep: fd.get('sleep').trim(),
      caffeineAlcohol: fd.get('caffeineAlcohol').trim(),
      allergies: fd.get('allergies').trim(),
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

      el.confirmDetail.textContent = `Quedaste agendada/o el ${fmtFull(state.selectedDate, payload.start)}. Te llegó una invitación a ${payload.email} — acéptala, o usa uno de los botones de abajo para guardarlo en tu calendario.`;
      const { gcalUrl, icsUrl } = buildCalendarLinks({ start: payload.start, end: payload.end });
      el.addGoogleCal.href = gcalUrl;
      el.addIcsCal.href = icsUrl;
      showPanel('confirm');
    } catch (err) {
      el.formError.textContent = err.message;
      if (err.message && err.message.includes('ya no está disponible')) {
        await loadMonth(state.year, state.month);
      }
    } finally {
      el.submitBtn.disabled = false;
      el.submitBtn.textContent = 'Confirmar cita';
    }
  });

  loadMonth();
})();
