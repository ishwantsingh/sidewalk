import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
let pg: PGlite;
let run: string, business: string, site: string, product: string;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean);`,
  );
  const sql = (await readFile("supabase/schema.sql", "utf8")).replace(
    "create extension if not exists pgcrypto;",
    "",
  );
  await pg.exec(sql);
}, 30000);
afterAll(async () => {
  await pg.close();
});
describe("PostgreSQL persistence and invariants", () => {
  it("atomically claims a queued run and enforces one active run", async () => {
    const result = await pg.query<{ id: string }>(
      `insert into runs(params) values ('{"maxEstimatedRunCostUsd":5}') returning id`,
    );
    run = result.rows[0].id;
    await expect(
      pg.exec(`insert into runs(params) values ('{}')`),
    ).rejects.toThrow();
    const claimed = await pg.query<{ id: string }>(`select * from claim_run()`);
    expect(claimed.rows[0].id).toBe(run);
    expect((await pg.query("select * from claim_run()")).rows).toHaveLength(0);
  });
  it("reserves cost transactionally and refuses spending beyond the cap", async () => {
    expect(
      (
        await pg.query<{ ok: boolean }>(
          "select reserve_cost($1,null,$2,$3) as ok",
          [run, "research", 3],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await pg.query<{ ok: boolean }>(
          "select reserve_cost($1,null,$2,$3) as ok",
          [run, "build", 3],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await pg.query<{ ok: boolean }>(
          "select reserve_cost($1,null,$2,$3) as ok",
          [run, "negative", -1],
        )
      ).rows[0].ok,
    ).toBe(false);
    const spent = await pg.query<{ spent: string }>(
      "select sum(cost_usd) as spent from events",
    );
    expect(Number(spent.rows[0].spent)).toBe(3);
  });
  it("deduplicates place IDs and payment IDs in the database", async () => {
    business = (
      await pg.query<{ id: string }>(
        `insert into businesses(run_id,place_id,name,category) values($1,'place_1','Real business','cafe') returning id`,
        [run],
      )
    ).rows[0].id;
    await expect(
      pg.query(
        `insert into businesses(run_id,place_id,name,category) values($1,'place_1','Duplicate','cafe')`,
        [run],
      ),
    ).rejects.toThrow();
    site = (
      await pg.query<{ id: string }>(
        "insert into sites(business_id) values($1) returning id",
        [business],
      )
    ).rows[0].id;
    product = (
      await pg.query<{ id: string }>(
        "insert into products(site_id,amount) values($1,199) returning id",
        [site],
      )
    ).rows[0].id;
    await pg.query(
      `insert into orders(whop_payment_id,whop_event_id,product_id,buyer_email,amount,currency) values('pay_1','evt_1',$1,'buyer@example.com',199,'usd')`,
      [product],
    );
    await expect(
      pg.query(
        `insert into orders(whop_payment_id,whop_event_id,product_id,buyer_email,amount,currency) values('pay_1','evt_2',$1,'buyer@example.com',199,'usd')`,
        [product],
      ),
    ).rejects.toThrow();
  });
  it("atomically claims a delivery only once", async () => {
    const claim = () =>
      pg.query(
        `update orders set delivery_state='SENDING' where whop_payment_id='pay_1' and delivery_state in ('PENDING','EMAIL_FAILED') returning id`,
      );
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0);
  });
  it("keeps ZIP storage private and enables row security for all business data", async () => {
    const bucket = await pg.query<{ public: boolean }>(
      `select public from storage.buckets where id='website-zips'`,
    );
    expect(bucket.rows[0].public).toBe(false);
    const tables = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname,relrowsecurity from pg_class where relname in ('runs','businesses','audits','opportunities','sites','products','emails','orders','events')`,
    );
    expect(tables.rows).toHaveLength(9);
    expect(tables.rows.every((row) => row.relrowsecurity)).toBe(true);
  });
});
