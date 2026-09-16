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
    const year = Number.parseInt(req.query.year, 10);
    const month = Number.parseInt(req.query.month, 10);
    const data = await calendar.getMonthAvailability(
      Number.isInteger(year) ? year : undefined,
      Number.isInteger(month) ? month : undefined
    );
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message });
  }
});

app.post('/api/book', async (req, res) => {
  try {
    const {
      start, end, name, email, phone,
      age, weight, condition, medications, sleep, caffeineAlcohol, allergies,
    } = req.body || {};

    if (!start || !end || !name || !email || !phone || !age || !weight
      || !condition || !medications || !sleep || !caffeineAlcohol || !allergies) {
      return res.status(400).json({ error: 'Faltan datos obligatorios del formulario.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'El correo no es válido.' });
    }
    if (!calendar.isValidBookableSlot(start, end)) {
      return res.status(400).json({ error: 'Ese horario no es válido.' });
    }

    // Verificar que el horario siga libre (evita choques si dos personas agendan a la vez)
    const stillFree = await calendar.isSlotStillFree(start, end);
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
        `Edad: ${age}`,
        `Peso: ${weight}`,
        `Diagnóstico médico: ${condition}`,
        `Medicamentos que toma: ${medications}`,
        `Ciclo de sueño: ${sleep}`,
        `Consumo de café o alcohol: ${caffeineAlcohol}`,
        `Alergias: ${allergies}`,
      ].join('\n'),
      attendeeEmail: email,
      attendeeName: name,
    });

    await db.savePatient({
      name, email, phone, age, weight, condition, medications,
      sleep, caffeineAlcohol, allergies, start, end, eventId: event.id,
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

app.patch('/api/patients/:id/notes', async (req, res) => {
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  try {
    const { notes } = req.body || {};
    const patient = await db.updatePatientNotes(req.params.id, typeof notes === 'string' ? notes : '');
    res.json({ ok: true, patient });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar la nota.' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Tricom FS corriendo en http://localhost:${PORT}`);
    calendar.isConnected()
      .then((connected) => console.log(connected
        ? 'Calendario de Google ya conectado.'
        : 'Calendario NO conectado todavía — visita /auth una vez para autorizarlo.'))
      .catch((err) => console.log('No se pudo verificar el estado del calendario:', err.message));
  });
}

module.exports = app;
