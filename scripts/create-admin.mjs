// Cria (ou promove) o primeiro administrador.
// Uso:
//   node --env-file=.env.local scripts/create-admin.mjs <email> "<Nome>" [palavra-passe]
// Sem palavra-passe, um utilizador existente é apenas promovido a admin.
// Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.
import { createClient } from "@supabase/supabase-js";

const [email, fullName, password] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!email || !fullName) {
  console.error('Uso: node --env-file=.env.local scripts/create-admin.mjs <email> "<Nome>" [palavra-passe]');
  process.exit(1);
}
if (!url || !secret) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SECRET_KEY no ambiente.");
  process.exit(1);
}
if (password && password.length < 10) {
  console.error("A palavra-passe deve ter pelo menos 10 caracteres.");
  process.exit(1);
}

const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(target) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

let userId = await findUserId(email);
if (!userId) {
  if (!password) {
    console.error("Utilizador não existe. Indique uma palavra-passe para o criar.");
    process.exit(1);
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error("Erro ao criar utilizador:", error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`✓ Utilizador criado: ${email}`);
}

const { error } = await supabase
  .from("profiles")
  .update({ role: "admin", is_active: true, full_name: fullName })
  .eq("id", userId);
if (error) {
  console.error("Erro ao promover a administrador:", error.message);
  process.exit(1);
}
console.log(`✓ ${email} é administrador.`);
