const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'patients.json');

function readAll() {
  if (!fs.existsSync(DB_FILE)) return [];
  const raw = fs.readFileSync(DB_FILE, 'utf8').trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function writeAll(patients) {
  fs.writeFileSync(DB_FILE, JSON.stringify(patients, null, 2), 'utf8');
}

async function savePatient(patient) {
  const patients = readAll();
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    notes: '',
    ...patient,
  };
  patients.push(record);
  writeAll(patients);
  return record;
}

async function getPatients() {
  return readAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function updatePatientNotes(id, notes) {
  const patients = readAll();
  const idx = patients.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error('Paciente no encontrado.');
  patients[idx].notes = notes;
  writeAll(patients);
  return patients[idx];
}

module.exports = { savePatient, getPatients, updatePatientNotes };
