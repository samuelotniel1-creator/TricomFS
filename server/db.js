// Selecciona el almacenamiento de pacientes automáticamente:
// - Sin SUPABASE_URL / SUPABASE_SERVICE_KEY en .env -> usa el archivo local patients.json.
// - Con esas dos variables configuradas -> usa Supabase (Postgres). Ver schema.sql.
// Ambas implementaciones exponen el mismo contrato: savePatient(patient), getPatients().
const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

module.exports = useSupabase ? require('./db.supabase') : require('./db.json');
