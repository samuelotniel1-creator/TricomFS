const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function fromRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    age: row.age,
    condition: row.condition,
    medications: row.medications,
    allergies: row.allergies,
    notes: row.notes,
    start: row.start_time,
    end: row.end_time,
    eventId: row.event_id,
  };
}

async function savePatient(patient) {
  const { data, error } = await supabase
    .from('patients')
    .insert({
      name: patient.name,
      email: patient.email,
      phone: patient.phone,
      age: patient.age,
      condition: patient.condition,
      medications: patient.medications,
      allergies: patient.allergies,
      notes: patient.notes,
      start_time: patient.start,
      end_time: patient.end,
      event_id: patient.eventId,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase: ${error.message}`);
  return fromRow(data);
}

async function getPatients() {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Supabase: ${error.message}`);
  return data.map(fromRow);
}

module.exports = { savePatient, getPatients };
