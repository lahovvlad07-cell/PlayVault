import { sql, dec, tgUser, tg } from "../lib/core.js";

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  if (req.method === "GET") {
    const rows = await sql`
      select o.id, o.pack_id, o.price_rub, o.created_at, o.payment_method,
             p.name, a.login_enc, a.pass_enc
      from orders o
      join packs p on p.id = o.pack_id
      join accounts a on a.id = o.account_id
      where o.user_id = ${u.id} and o.status = 'paid'
      order by o.id desc`;
    return res.json(rows.map(({ login_enc, pass_enc, ...r }) => ({
      ...r,
      login: dec(login_enc),
      pass: dec(pass_enc)
    })));
  }

  if (req.method !== "POST") return res.status(405).end();

  const packId = Number(req.body?.pack_id);
  const paymentMethod = req.body?.payment_method === "balance" ? "balance" : "stars";

  const [p] = await sql`
    select id, name, price, disc
    from packs
    where id = ${packId} and active
  `;
  if (!p) return res.status(404).json({ error: "pack" });

  const rub = Math.max(1, Math.round(p.price * (1 - p.disc / 100)));

  if (paymentMethod === "balance") {
    try {
      const result = await sql.begin(async tx => {
        await tx`
          insert into users(id, username)
          values (${u.id}, ${u.username || null})
          on conflict (id) do update set username = excluded.username
        `;

        const [user] = await tx`
          select balance_rub
          from users
          where id = ${u.id}
          for update
        `;
        if (!user || Number(user.balance_rub) < rub) {
          const e = new Error("insufficient_balance");
          e.code = "insufficient_balance";
          throw e;
        }

        const [a] = await tx`
          select id
          from accounts
          where pack_id = ${p.id} and used < max_slots
          order by used asc, id asc
          limit 1
          for update skip locked
        `;
        if (!a) {
          const e = new Error("no_slots");
          e.code = "no_slots";
          throw e;
        }

        await tx`
          update users
          set balance_rub = balance_rub - ${rub}
          where id = ${u.id}
        `;

        await tx`
          update accounts
          set used = used + 1
          where id = ${a.id}
        `;

        const [o] = await tx`
          insert into orders(
            user_id, pack_id, account_id, price_rub, stars,
            status, payment_method
          )
          values (${u.id}, ${p.id}, ${a.id}, ${rub}, 0, 'paid', 'balance')
          returning id
        `;

        await tx`
          insert into balance_transactions(
            user_id, type, amount_rub, order_id
          )
          values (${u.id}, 'purchase', ${-rub}, ${o.id})
        `;

        const [fresh] = await tx`
          select balance_rub
          from users
          where id = ${u.id}
        `;

        return { order: o.id, balance: Number(fresh.balance_rub) };
      });

      return res.json(result);
    } catch (e) {
      if (e?.code === "insufficient_balance") {
        return res.status(409).json({ error: "insufficient_balance" });
      }
      if (e?.code === "no_slots") {
        return res.status(409).json({ error: "no_slots" });
      }
      throw e;
    }
  }

  const stars = Math.ceil(rub * Number(process.env.STARS_PER_RUB || 1));

  await sql`
    insert into users(id, username)
    values (${u.id}, ${u.username || null})
    on conflict (id) do nothing
  `;

  const free = await sql`
    select 1
    from accounts
    where pack_id = ${p.id} and used < max_slots
    limit 1
  `;
  if (!free.length) return res.status(409).json({ error: "no_slots" });

  const [o] = await sql`
    insert into orders(
      user_id, pack_id, price_rub, stars, payment_method
    )
    values (${u.id}, ${p.id}, ${rub}, ${stars}, 'stars')
    returning id
  `;

  const r = await tg("createInvoiceLink", {
    title: p.name,
    description: "Оффлайн-доступ к набору игр, навсегда",
    payload: String(o.id),
    currency: "XTR",
    prices: [{ label: p.name, amount: stars }],
  });

  if (!r?.ok || !r?.result) {
    await sql`delete from orders where id = ${o.id} and status = 'pending'`;
    return res.status(502).json({ error: "invoice" });
  }

  return res.json({ order: o.id, link: r.result });
}
