require('dotenv').config();
const path = require('path');
const express = require('express');
const calendar = require('./calendar');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.get('/auth', (req, res) => {
  res.redirect(calendar.getAuthUrl());
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Falta el parámetro code.');
    await calendar.saveTokensFromCode(code);
    res.send('Calendario conectado correctamente. Ya puedes cerrar esta pestaña.');
  } catch (err) {
    console.error(err);
    res.status(500).send('No se pudo conectar el calendario: ' + err.message);
  }
});

app.get('/api/availability', async (req, res) => {
  try {
    const availability = await calendar.getAvailability();
    res.json({ availability });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message });
  }
});

app.post('/api/book', async (req, res) => {
  try {
    const {
      start, end, name, email, phone,
      age, condition, medications, allergies, notes,
    } = req.body || {};

    if (!start || !end || !name || !email || !phone || !condition) {
      return res.status(400).json({ error: 'Faltan datos obligatorios del formulario.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'El correo no es válido.' });
    }

    // Verificar que el horario siga libre (evita choques si dos personas agendan a la vez)
    const availability = await calendar.getAvailability();
    const stillFree = availability.some((day) =>
      day.slots.some((slot) => slot.start === start && slot.end === end)
    );
    if (!stillFree) {
      return res.status(409).json({ error: 'Ese horario ya no está disponible. Elige otro.' });
    }

    const event = await calendar.createEvent({
      start,
      end,
      summary: `Consulta CBD — ${name}`,
      description: [
        `Paciente: ${name}`,
        `Teléfono: ${phone}`,
        `Motivo de consulta: ${condition}`,
        medications ? `Medicamentos actuales: ${medications}` : null,
        allergies ? `Alergias: ${allergies}` : null,
        notes ? `Notas adicionales: ${notes}` : null,
      ].filter(Boolean).join('\n'),
      attendeeEmail: email,
      attendeeName: name,
    });

    await db.savePatient({
      name, email, phone, age: age || null, condition,
      medications: medications || null, allergies: allergies || null,
      notes: notes || null, start, end, eventId: event.id,
    });

    res.json({ ok: true, start, end });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo agendar la cita: ' + err.message });
  }
});

app.get('/api/patients', async (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  try {
    res.json({ patients: await db.getPatients() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo leer el listado de pacientes.' });
  }
});

app.listen(PORT, () => {
  console.log(`Tricom FS corriendo en http://localhost:${PORT}`);
  console.log(calendar.isConnected()
    ? 'Calendario de Google ya conectado.'
    : 'Calendario NO conectado todavía — visita /auth una vez para autorizarlo.');
});
