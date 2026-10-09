// Загружает аккаунты из accounts.local.json в БД уже зашифрованными (AES-256-GCM).
// node --env-file=.env.local scripts/seed-accounts.js [--force]
// После загрузки УДАЛИ accounts.local.json: пароли должны лежать только в базе.
import fs from "node:fs";
import { sql, enc } from "../lib/core.js";

const list = JSON.parse(fs.readFileSync(new URL("../accounts.local.json", import.meta.url), "utf8"));
const force = process.argv.includes("--force");
for (const a of list) {
  const [{ n }] = await sql`select count(*)::int as n from accounts where pack_id = ${a.pack_id}`;
  if (n && !force) { console.log(`набор ${a.pack_id}: аккаунт уже есть, пропускаю (--force чтобы добавить ещё)`); continue; }
  await sql`insert into accounts(pack_id, login_enc, pass_enc, max_slots) values (${a.pack_id}, ${enc(a.login)}, ${enc(a.password)}, ${a.max_slots || 5})`;
  console.log(`набор ${a.pack_id}: аккаунт добавлен`);
}
await sql.end();
