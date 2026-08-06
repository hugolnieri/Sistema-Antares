// Edge Function "fotos" — ponte do admin com o SharePoint (Microsoft Graph).
// Necessária porque o compartilhamento anônimo está desligado no tenant do
// colégio: nada é público. Só administradores autenticados (allowlist) recebem
// URLs, e cada uma expira em ~1h.
//
// Ações:
//   urls           POST JSON      { fotoIds: string[] }        -> { urls: { [fotoId]: { url, thumb } } }
//   urlMaterial    POST JSON      { arquivoPath }              -> { url }
//   uploadMaterial POST multipart numeroAula, arquivo          -> { arquivoPath, viaSharePoint }
//
// Fotos e PDFs ficam no SharePoint (`arquivo_path = "sp:<itemId>"`). O bucket
// privado do Supabase segue como fallback quando o Graph está indisponível; o
// front resolve esse caso com createSignedUrl.

import { createClient } from "npm:@supabase/supabase-js@2";
import { graphResolverUrls, graphUpload } from "../_shared/graph.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB por material

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

async function emailDoChamador(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  const email = data.user?.email?.toLowerCase();
  if (!email) return null;
  if (email === (await masterEmail())) return email;
  const { data: perm } = await admin
    .from("permissoes_usuarios").select("email").eq("email", email).maybeSingle();
  return perm ? email : null;
}

// --- ações ------------------------------------------------------------------

async function acaoUrls(fotoIds: unknown) {
  const ids = Array.isArray(fotoIds) ? fotoIds.map(String).slice(0, 1000) : [];
  if (!ids.length) return json({ urls: {} });

  // Só resolvemos fotos do SharePoint; o front cuida do bucket.
  const { data } = await admin
    .from("fotos_aula").select("id, arquivo_path").in("id", ids);

  const porItem = new Map<string, string>(); // itemId do Graph -> id da foto
  for (const f of data ?? []) {
    const p = String((f as any).arquivo_path ?? "");
    if (p.startsWith("sp:")) porItem.set(p.slice(3), (f as any).id);
  }

  const resolvidas = await graphResolverUrls([...porItem.keys()]);
  const urls: Record<string, { url: string | null; thumb: string | null }> = {};
  for (const [itemId, fotoId] of porItem) {
    urls[fotoId] = resolvidas[itemId] ?? { url: null, thumb: null };
  }
  return json({ urls });
}

async function acaoUrlMaterial(arquivoPath: unknown) {
  const p = String(arquivoPath ?? "");
  if (!p.startsWith("sp:")) return json({ url: null }); // bucket: o front resolve
  const urls = await graphResolverUrls([p.slice(3)]);
  return json({ url: urls[p.slice(3)]?.url ?? null });
}

async function acaoUploadMaterial(form: FormData, email: string) {
  const numeroAula = Number(form.get("numeroAula"));
  if (!Number.isInteger(numeroAula) || numeroAula < 1 || numeroAula > 18) {
    return json({ error: "Número de aula inválido" }, 400);
  }
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return json({ error: "Nenhum arquivo enviado" }, 400);
  if (arquivo.type !== "application/pdf") return json({ error: "Apenas arquivos PDF são aceitos" }, 400);
  if (arquivo.size > MAX_PDF_BYTES) return json({ error: "O PDF deve ter no máximo 20 MB" }, 400);

  const nome = `aula-${String(numeroAula).padStart(2, "0")}.pdf`;

  // 1) SharePoint (destino preferencial — não pesa no Supabase)
  let arquivoPath: string | null = null;
  try {
    const itemId = await graphUpload(`Materiais/${nome}`, arquivo);
    if (itemId) arquivoPath = `sp:${itemId}`;
  } catch (_e) { /* cai no fallback abaixo */ }

  if (arquivoPath) return json({ arquivoPath, viaSharePoint: true });

  // 2) Fallback: bucket privado do Supabase. Fica registrado no log para que dê
  // para achar e remigrar o que caiu aqui quando o Graph estava fora do ar.
  const { error } = await admin.storage
    .from("materiais").upload(nome, arquivo, { contentType: "application/pdf", upsert: true });
  if (error) return json({ error: "Não foi possível enviar o PDF" }, 500);

  await admin.from("logs").insert({
    acao: "editar", ator: email, ator_tipo: "admin",
    entidade: "material", entidade_id: null,
    descricao: `SharePoint indisponível: o PDF da Aula ${numeroAula} foi salvo no Supabase (${nome}). Reenvie quando o SharePoint voltar.`,
  });
  return json({ arquivoPath: nome, viaSharePoint: false });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const email = await emailDoChamador(req);
    if (!email) return json({ error: "Não autorizado" }, 403);

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      if (String(form.get("action")) === "uploadMaterial") {
        return await acaoUploadMaterial(form, email);
      }
      return json({ error: "Ação desconhecida" }, 400);
    }

    const body = await req.json();
    if (body.action === "urls") return await acaoUrls(body.fotoIds);
    if (body.action === "urlMaterial") return await acaoUrlMaterial(body.arquivoPath);
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno" }, 500);
  }
});
