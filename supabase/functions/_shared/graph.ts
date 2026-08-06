// Microsoft Graph — acesso ao SharePoint do colégio, compartilhado pelas Edge
// Functions "polo" (sobe fotos e serve PDFs ao professor) e "fotos" (serve URLs
// ao admin e sobe os PDFs dos materiais).
//
// Por que o SharePoint: os arquivos pesados (fotos das aulas e PDFs de material)
// não ficam no Supabase. Assim o storage e o egress do Supabase seguem perto de
// zero — o navegador baixa a imagem direto da Microsoft, sem passar por aqui.
//
// O compartilhamento anônimo está DESABILITADO no tenant, então nada é público:
// toda leitura vira uma URL temporária (~1h) emitida sob demanda.
//
// Credenciais ficam na tabela `segredos`, que tem RLS sem policies — só a
// service role enxerga.

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GRAPH = "https://graph.microsoft.com/v1.0";

// Tamanho pedido para a miniatura da galeria. As células têm 180px; 400px cobre
// telas retina e ainda pesa dezenas de KB em vez dos até 5 MB do original.
const THUMB_SIZE = "c400x400";

// A URL temporária do Graph vale ~1h; guardamos por 45min com folga.
const URL_TTL_MS = 45 * 60 * 1000;

export interface GraphUrls {
  url: string | null;   // arquivo original (download/lightbox)
  thumb: string | null; // miniatura (grade da galeria); null se não houver
}

interface GraphCfg { tenant: string; client: string; secret: string; driveId: string }

let cfgCache: GraphCfg | null = null;
let tokenCache: { token: string; exp: number } | null = null;
const urlCache = new Map<string, GraphUrls & { exp: number }>();

export async function getGraphConfig(): Promise<GraphCfg | null> {
  if (cfgCache) return cfgCache;
  const { data } = await admin
    .from("segredos").select("chave, valor")
    .in("chave", ["ms_tenant_id", "ms_client_id", "ms_client_secret", "ms_drive_id"]);
  const m = new Map((data ?? []).map((r: any) => [r.chave, r.valor]));
  const tenant = m.get("ms_tenant_id"), client = m.get("ms_client_id");
  const secret = m.get("ms_client_secret"), driveId = m.get("ms_drive_id");
  if (!tenant || !client || !secret || !driveId) return null; // Graph não configurado
  cfgCache = { tenant, client, secret, driveId };
  return cfgCache;
}

export async function getGraphToken(cfg: GraphCfg): Promise<string | null> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
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
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

// Config + token numa tacada só; null se o Graph não estiver disponível.
async function conectar(): Promise<{ cfg: GraphCfg; token: string } | null> {
  const cfg = await getGraphConfig();
  if (!cfg) return null;
  const token = await getGraphToken(cfg);
  return token ? { cfg, token } : null;
}

// Sobe UM arquivo (foto ou PDF) e devolve o id do drive item, ou null se o Graph
// não estiver disponível — nesse caso o chamador cai no bucket do Supabase.
// O PUT simples do Graph aceita até 250 MB, folgado para os limites do sistema.
export async function graphUpload(path: string, arquivo: File | Blob): Promise<string | null> {
  const conn = await conectar();
  if (!conn) return null;
  const res = await fetch(`${GRAPH}/drives/${conn.cfg.driveId}/root:/${path}:/content`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${conn.token}`,
      "Content-Type": arquivo.type || "application/octet-stream",
    },
    body: await arquivo.arrayBuffer(),
  });
  if (!res.ok) return null;
  const item = await res.json();
  return item?.id ?? null;
}

// Extrai downloadUrl + miniatura do corpo de um driveItem.
function lerUrls(item: any): GraphUrls {
  const thumbs = item?.thumbnails?.[0];
  return {
    url: item?.["@microsoft.graph.downloadUrl"] ?? null,
    thumb: thumbs?.[THUMB_SIZE]?.url ?? thumbs?.large?.url ?? thumbs?.medium?.url ?? null,
  };
}

// Resolve vários itens de uma vez usando o $batch do Graph (20 por requisição),
// em vez de uma ida e volta por foto. Resultados ficam em cache enquanto a URL
// temporária for válida, então recarregar a galeria não refaz o trabalho.
export async function graphResolverUrls(itemIds: string[]): Promise<Record<string, GraphUrls>> {
  const saida: Record<string, GraphUrls> = {};
  const agora = Date.now();

  const pendentes: string[] = [];
  for (const id of new Set(itemIds)) {
    const cache = urlCache.get(id);
    if (cache && cache.exp > agora) saida[id] = { url: cache.url, thumb: cache.thumb };
    else pendentes.push(id);
  }
  if (!pendentes.length) return saida;

  const conn = await conectar();
  if (!conn) {
    for (const id of pendentes) saida[id] = { url: null, thumb: null };
    return saida;
  }

  // $expand=thumbnails traz o downloadUrl e a miniatura no mesmo item.
  const lotes: string[][] = [];
  for (let i = 0; i < pendentes.length; i += 20) lotes.push(pendentes.slice(i, i + 20));

  const resultados = await Promise.all(lotes.map(async (lote) => {
    const res = await fetch(`${GRAPH}/$batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: lote.map((id, i) => ({
          id: String(i),
          method: "GET",
          url: `/drives/${conn.cfg.driveId}/items/${id}?$expand=thumbnails($select=${THUMB_SIZE},large,medium)`,
        })),
      }),
    });
    if (!res.ok) return lote.map((id) => [id, { url: null, thumb: null }] as const);
    const j = await res.json();
    const porIndice = new Map<string, any>(
      (j?.responses ?? []).map((r: any) => [String(r.id), r]),
    );
    return lote.map((id, i) => {
      const r = porIndice.get(String(i));
      const ok = r && r.status >= 200 && r.status < 300;
      return [id, ok ? lerUrls(r.body) : { url: null, thumb: null }] as const;
    });
  }));

  for (const par of resultados.flat()) {
    const [id, urls] = par;
    saida[id] = urls;
    if (urls.url) urlCache.set(id, { ...urls, exp: agora + URL_TTL_MS });
  }
  return saida;
}

// Atalho para um item só (PDF de material, foto aberta isolada).
export async function graphDownloadUrl(itemId: string): Promise<string | null> {
  const urls = await graphResolverUrls([itemId]);
  return urls[itemId]?.url ?? null;
}
