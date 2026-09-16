// Guarda los tokens OAuth de Google Calendar.
// - Sin SUPABASE_URL / SUPABASE_SERVICE_KEY -> archivo local tokens.json (sirve para desarrollo).
// - Con esas variables -> tabla google_tokens en Supabase (necesario en Vercel: el sistema de
//   archivos ahí es efímero y no puede guardar el token entre invocaciones).
const fs = require('fs');
const path = require('path');

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

if (useSupabase) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  module.exports = {
    async read() {
      const { data, error } = await supabase
        .from('google_tokens')
        .select('data')
        .eq('id', 'default')
        .maybeSingle();
      if (error) throw new Error(`Supabase: ${error.message}`);
      return data ? data.data : null;
    },
    async write(tokens) {
      const { error } = await supabase
        .from('google_tokens')
        .upsert({ id: 'default', data: tokens, updated_at: new Date().toISOString() });
      if (error) throw new Error(`Supabase: ${error.message}`);
    },
  };
} else {
  const TOKENS_FILE = path.join(__dirname, 'tokens.json');

  module.exports = {
    async read() {
      if (!fs.existsSync(TOKENS_FILE)) return null;
      const raw = fs.readFileSync(TOKENS_FILE, 'utf8').trim();
      return raw ? JSON.parse(raw) : null;
    },
    async write(tokens) {
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
    },
  };
}
