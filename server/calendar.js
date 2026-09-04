const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const TOKENS_FILE = path.join(__dirname, 'tokens.json');
const CALENDAR_ID = process.env.CALENDAR_ID || 'primary';
const TIMEZONE = 'America/Mexico_City';

// Horario de atención: sábado (6) y domingo (0), 9:00–17:00, citas de 1 hora.
const BUSINESS_DAYS = [0, 6];
const START_HOUR = 9;
const END_HOUR = 17;
const SLOT_MINUTES = 60;
const DAYS_AHEAD = 42; // ~6 semanas de horarios visibles

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
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
  return tokens;
}

function isConnected() {
  return fs.existsSync(TOKENS_FILE);
}

function getAuthorizedClient() {
  if (!isConnected()) {
    throw new Error('Calendario no conectado todavía. Visita /auth para autorizarlo.');
  }
  const client = buildOAuthClient();
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  client.setCredentials(tokens);
  client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  });
  return client;
}

function slotsForDay(date) {
  const slots = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour += SLOT_MINUTES / 60) {
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
    slots.push({ start, end });
  }
  return slots;
}

function upcomingBusinessDays() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (BUSINESS_DAYS.includes(d.getDay())) days.push(d);
  }
  return days;
}

async function getAvailability() {
  const client = getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth: client });

  const days = upcomingBusinessDays();
  const timeMin = days[0];
  const timeMax = new Date(days[days.length - 1]);
  timeMax.setHours(23, 59, 59, 999);

  const freebusy = await calendar.freebusy.query({
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
  const availability = days.map((day) => {
    const daySlots = slotsForDay(day)
      .filter((slot) => slot.start > now)
      .filter((slot) => !busy.some((b) => slot.start < b.end && slot.end > b.start))
      .map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      }));
    return {
      date: day.toISOString().slice(0, 10),
      slots: daySlots,
    };
  });

  return availability.filter((d) => d.slots.length > 0);
}

async function createEvent({ start, end, summary, description, attendeeEmail, attendeeName }) {
  const client = getAuthorizedClient();
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
  getAvailability,
  createEvent,
};
