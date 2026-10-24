import { createClient } from "@supabase/supabase-js";
import { env } from "./config";
export function db() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function insert(table: string, values: Record<string, unknown>) {
  const { data, error } = await db()
    .from(table)
    .insert(values)
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function update(
  table: string,
  id: string,
  values: Record<string, unknown>,
) {
  const { error } = await db().from(table).update(values).eq("id", id);
  if (error) throw error;
}
export async function rows(table: string, column?: string, value?: string) {
  let q = db().from(table).select("*");
  if (column && value) q = q.eq(column, value);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function one(table: string, id: string) {
  const { data, error } = await db()
    .from(table)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
export async function event(
  run_id: string,
  business_id: string | null,
  action: string,
  reason: string,
  cost_usd = 0,
) {
  return insert("events", {
    run_id,
    business_id,
    action,
    reason,
    cost_usd,
    cost_kind: "estimate",
  });
}
