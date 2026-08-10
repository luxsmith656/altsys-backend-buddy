// Builds/refreshes the assistant knowledge base (public.kb_chunks).
// Idempotent: chunks are keyed by a content hash, so re-running only adds
// what is new or missing an embedding.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { KB_SEED, embed, hashContent, type KbSeed } from "../_shared/kb.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const SERVICE_ROLE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
const ANON_KEY = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
const INDEX_TOKEN = (Deno.env.get("KB_INDEX_TOKEN") ?? "").trim();

/** Only admins (or an internal token) may rebuild the knowledge base. */
async function authorize(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (INDEX_TOKEN && auth === `Bearer ${INDEX_TOKEN}`) return true;
  if (!auth || !ANON_KEY) return false;
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return false;
  const { data } = await db.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "super_admin");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (!(await authorize(req))) return json({ error: "Not allowed" }, 403);

    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    const gateway = Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev";
    if (!apiKey) return json({ error: "AI key is not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const extra = Array.isArray(body?.chunks) ? (body.chunks as KbSeed[]) : [];
    const items = [...KB_SEED, ...extra].filter((c) => typeof c?.content === "string" && c.content.trim().length > 20);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: existing } = await db.from("kb_chunks").select("content_hash, embedding");
    const haveEmbedding = new Set(
      (existing ?? []).filter((r: { embedding: unknown }) => r.embedding !== null).map((r: { content_hash: string }) => r.content_hash),
    );

    const pending: { row: Record<string, unknown>; text: string }[] = [];
    for (const item of items) {
      const text = `${item.title}\n${item.content}`.trim();
      const content_hash = await hashContent(text);
      if (haveEmbedding.has(content_hash)) continue;
      pending.push({
        text,
        row: {
          title: item.title ?? "",
          category: item.category ?? "general",
          source: "seed",
          content: item.content,
          content_hash,
        },
      });
    }

    if (!pending.length) return json({ indexed: 0, total: items.length, message: "Knowledge base already up to date." });

    let indexed = 0;
    for (let i = 0; i < pending.length; i += 50) {
      const batch = pending.slice(i, i + 50);
      const vectors = await embed(batch.map((p) => p.text), apiKey, gateway);
      const rows = batch.map((p, idx) => ({ ...p.row, embedding: JSON.stringify(vectors[idx]) }));
      const { error } = await db.from("kb_chunks").upsert(rows, { onConflict: "content_hash" });
      if (error) throw new Error(error.message);
      indexed += rows.length;
    }

    return json({ indexed, total: items.length });
  } catch (e) {
    console.error("[kb-index]", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
