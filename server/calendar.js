const { google } = require('googleapis');
const tokensStore = require('./tokens-store');

const CALENDAR_ID = process.env.CALENDAR_ID || 'primary';
const TIMEZONE = 'America/Mexico_City';
// Mexico dejo el horario de verano en 2022; la Ciudad de Mexico queda fija en UTC-6.
const MX_UTC_OFFSET_HOURS = 6;

// Horario de atención: sábado (6) y domingo (0), 9:00–17:00, citas de 1 hora.
const BUSINESS_DAYS = [0, 6];
const START_HOUR = 9;
const END_HOUR = 17;
const SLOT_MINUTES = 60;
const MONTHS_AHEAD_LIMIT = 3; // cuantos meses hacia adelante se puede navegar

function pad(n) { return String(n).padStart(2, '0'); }

// Construye el instante UTC que corresponde a esa fecha/hora en la Ciudad de Mexico,
// sin depender de la zona horaria del servidor (Vercel corre en UTC, el dev local no).
function mxToUTC(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + MX_UTC_OFFSET_HOURS, minute, 0, 0));
}

// Dado un instante, regresa sus componentes de fecha/hora "como si" fueran de Ciudad de Mexico.
function utcToMxParts(date) {
  const shifted = new Date(date.getTime() - MX_UTC_OFFSET_HOURS * 3600000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthIndex(year, month) { return year * 12 + (month - 1); }

function currentMxYearMonth() {
  const { year, month } = utcToMxParts(new Date());
  return { year, month };
}

function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
}

async function saveTokensFromCode(code) {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);
  await tokensStore.write(tokens);
  return tokens;
}

async function isConnected() {
  return Boolean(await tokensStore.read());
}

async function getAuthorizedClient() {
  const tokens = await tokensStore.read();
  if (!tokens) {
    throw new Error('Calendario no conectado todavía. Visita /auth para autorizarlo.');
  }
  const client = buildOAuthClient();
  client.setCredentials(tokens);
  client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    tokensStore.write(merged).catch((err) => console.error('No se pudo guardar el token renovado:', err));
  });
  return client;
}

function slotsForDate(year, month, day) {
  const slots = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour++) {
    const start = mxToUTC(year, month, day, hour, 0);
    const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
    slots.push({ start, end });
  }
  return slots;
}

function isBusinessDay(year, month, day) {
  return BUSINESS_DAYS.includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
}

// Devuelve la disponibilidad de un mes completo: cada dia de fin de semana como columna,
// con los 8 horarios (9am-5pm) marcados como 'free', 'booked' (ya agendado, pero visible)
// o 'past' (ya paso). No expone quien agendo cada horario, solo si esta libre u ocupado.
async function getMonthAvailability(yearParam, monthParam) {
  const current = currentMxYearMonth();
  const minIdx = monthIndex(current.year, current.month);
  const maxIdx = minIdx + MONTHS_AHEAD_LIMIT;

  let year = Number.isInteger(yearParam) ? yearParam : current.year;
  let month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : current.month;
  let idx = monthIndex(year, month);

  if (idx < minIdx || idx > maxIdx) {
    year = current.year;
    month = current.month;
    idx = minIdx;
  }

  const totalDays = daysInMonth(year, month);
  const today = utcToMxParts(new Date());
  const isCurrentMonth = year === today.year && month === today.month;

  const businessDates = [];
  for (let d = 1; d <= totalDays; d++) {
    if (!isBusinessDay(year, month, d)) continue;
    if (isCurrentMonth && d < today.day) continue;
    businessDates.push(d);
  }

  if (businessDates.length === 0) {
    return { year, month, days: [], canGoPrev: idx > minIdx, canGoNext: idx < maxIdx };
  }

  const client = await getAuthorizedClient();
  const calendarApi = google.calendar({ version: 'v3', auth: client });

  const timeMin = mxToUTC(year, month, businessDates[0], 0, 0);
  const timeMax = mxToUTC(year, month, businessDates[businessDates.length - 1], 23, 59);

  const freebusy = await calendarApi.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: CALENDAR_ID }],
    },
  });

  const busy = (freebusy.data.calendars[CALENDAR_ID].busy || []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));

  const now = new Date();
  const days = businessDates.map((d) => {
    const slots = slotsForDate(year, month, d).map((slot) => {
      let status = 'free';
      if (slot.start <= now) status = 'past';
      else if (busy.some((b) => slot.start < b.end && slot.end > b.start)) status = 'booked';
      return { start: slot.start.toISOString(), end: slot.end.toISOString(), status };
    });
    return { date: `${year}-${pad(month)}-${pad(d)}`, slots };
  });

  return { year, month, days, canGoPrev: idx > minIdx, canGoNext: idx < maxIdx };
}

function isValidBookableSlot(startISO, endISO) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end.getTime() - start.getTime() !== SLOT_MINUTES * 60000) return false;
  if (start.getTime() <= Date.now()) return false;

  const mx = utcToMxParts(start);
  if (!BUSINESS_DAYS.includes(mx.weekday)) return false;
  if (mx.minute !== 0) return false;
  if (mx.hour < START_HOUR || mx.hour >= END_HOUR) return false;
  return true;
}

async function isSlotStillFree(startISO, endISO) {
  const client = await getAuthorizedClient();
  const calendarApi = google.calendar({ version: 'v3', auth: client });

  const freebusy = await calendarApi.freebusy.query({
    requestBody: {
      timeMin: startISO,
      timeMax: endISO,
      timeZone: TIMEZONE,
      items: [{ id: CALENDAR_ID }],
    },
  });

  const busy = freebusy.data.calendars[CALENDAR_ID].busy || [];
  return busy.length === 0;
}

async function createEvent({ start, end, summary, description, attendeeEmail, attendeeName }) {
  const client = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth: client });

  const event = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    sendUpdates: 'all',
    requestBody: {
      summary,
      description,
      start: { dateTime: start, timeZone: TIMEZONE },
      end: { dateTime: end, timeZone: TIMEZONE },
      attendees: [{ email: attendeeEmail, displayName: attendeeName }],
    },
  });

  return event.data;
}

module.exports = {
  getAuthUrl,
  saveTokensFromCode,
  isConnected,
  getMonthAvailability,
  isValidBookableSlot,
  isSlotStillFree,
  createEvent,
};
