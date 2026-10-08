// node --env-file=.env.local scripts/add-account.js <pack_id> <login> <password> [max_slots]
import { sql, enc } from "../lib/core.js";
const [pack, login, pass, slots = 5] = process.argv.slice(2);
if (!pass) { console.log("usage: add-account.js <pack_id> <login> <password> [max_slots]"); process.exit(1); }
await sql`insert into accounts(pack_id, login_enc, pass_enc, max_slots) values (${+pack}, ${enc(login)}, ${enc(pass)}, ${+slots})`;
console.log("ok");
await sql.end();
