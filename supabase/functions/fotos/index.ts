// Edge Function "fotos" — entrega URLs temporárias das fotos guardadas no
// SharePoint (Microsoft Graph). Necessária porque o compartilhamento anônimo
// está desligado no tenant do colégio: nada é público. Só administradores
// autenticados (allowlist) recebem URLs, e cada uma expira em ~1h (o
// downloadUrl do próprio Graph).
//
// Ação (POST JSON):
//   urls { fotoIds: string[] } -> { urls: { [fotoId]: string | null } }
//
// A foto pode estar no SharePoint (fotos_aula.arquivo_path = "sp:<itemId>") ou,
// no fallback, no bucket privado do Supabase (arquivo_path = caminho). Este
// endpoint resolve o caso SharePoint; o bucket continua sendo resolvido no
// próprio front via createSignedUrl.

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });

// --- allowlist: só admin autorizado passa ----------------------------------
async function masterEmail(): Promise<string | null> {
  const { data } = await admin
    .from("configuracoes").select("valor").eq("chave", "admin_master").maybeSingle();
  return data?.valor ? String(data.valor).toLowerCase() : null;
}

async function chamadorPermitido(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data } = await admin.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase();
  if (!email) return false;
  if (email === (await masterEmail())) return true;
  const { data: perm } = await admin
    .from("permissoes_usuarios").select("email").eq("email", email).maybeSingle();
  return !!perm;
}

// --- Microsoft Graph --------------------------------------------------------
let graphTokenCache: { token: string; exp: number } | null = null;
let graphCfgCache: { tenant: string; client: string; secret: string; driveId: string } | null = null;

async function getGraphConfig() {
  if (graphCfgCache) return graphCfgCache;
  const { data } = await admin
    .from("segredos").select("chave, valor")
    .in("chave", ["ms_tenant_id", "ms_client_id", "ms_client_secret", "ms_drive_id"]);
  const m = new Map((data ?? []).map((r: any) => [r.chave, r.valor]));
  const tenant = m.get("ms_tenant_id"), client = m.get("ms_client_id");
  const secret = m.get("ms_client_secret"), driveId = m.get("ms_drive_id");
  if (!tenant || !client || !secret || !driveId) return null;
  graphCfgCache = { tenant, client, secret, driveId };
  return graphCfgCache;
}

async function getGraphToken(cfg: { tenant: string; client: string; secret: string }): Promise<string | null> {
  if (graphTokenCache && graphTokenCache.exp > Date.now() + 60_000) return graphTokenCache.token;
  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.client, client_secret: cfg.secret,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.access_token) return null;
  graphTokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

// downloadUrl pré-autenticado do item (válido ~1h, sem precisar de header).
async function graphDownloadUrl(itemId: string): Promise<string | null> {
  const cfg = await getGraphConfig();
  if (!cfg) return null;
  const token = await getGraphToken(cfg);
  if (!token) return null;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${cfg.driveId}/items/${itemId}?select=id,@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const j = await res.json();
  return j["@microsoft.graph.downloadUrl"] ?? null;
}

async function acaoUrls(req: Request, fotoIds: unknown) {
  if (!(await chamadorPermitido(req))) return json({ error: "Não autorizado" }, 403);
  const ids = Array.isArray(fotoIds) ? fotoIds.map(String).slice(0, 1000) : [];
  if (!ids.length) return json({ urls: {} });

  // Só resolvemos fotos do SharePoint; o front cuida do bucket.
  const { data } = await admin
    .from("fotos_aula").select("id, arquivo_path").in("id", ids);
  const urls: Record<string, string | null> = {};
  for (const f of data ?? []) {
    const p = String((f as any).arquivo_path ?? "");
    urls[(f as any).id] = p.startsWith("sp:") ? await graphDownloadUrl(p.slice(3)) : null;
  }
  return json({ urls });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const body = await req.json();
    if (body.action === "urls") return await acaoUrls(req, body.fotoIds);
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno" }, 500);
  }
});
