// Edge Function "polo" — toda a área do professor passa por aqui.
// A senha nunca é validada no navegador; sessões são tokens HMAC que
// carregam o token_version do polo — trocar a senha invalida tudo.
//
// Ações (POST JSON, exceto 'chamada' que é multipart/form-data):
//   info    { slug }                 -> { nome }
//   login   { slug, senha }          -> { token, polo }
//   dados   { token }                -> { polo, alunos (+responsáveis), materiais (URLs assinadas) }
//   chamada FormData: token, dados(JSON), fotos[] -> { historicoId }
//   obterChamada        { token, historicoId }                    -> retoma chamada pendente
//   atualizarPresenca   { token, historicoId, alunoId, presente } -> auto-save por aluno
//   solicitarContato    { token, alunoId, alunoNome, motivo }     -> pedido de contato p/ o admin
//   sugerirAluno        { token, nome, historicoId? }             -> sugere cadastro de aluno
//
// Segredo HMAC: lido da tabela `segredos` (chave 'polo_token_secret'), que tem
// RLS sem policies — só a service role enxerga. Env POLO_TOKEN_SECRET, se
// definida, tem prioridade. SUPABASE_URL/SERVICE_ROLE_KEY são automáticos.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

let tokenSecretCache: string | null = Deno.env.get("POLO_TOKEN_SECRET") ?? null;
async function getTokenSecret(): Promise<string> {
  if (tokenSecretCache) return tokenSecretCache;
  const { data } = await supabase
    .from("segredos").select("valor").eq("chave", "polo_token_secret").maybeSingle();
  if (!data?.valor) throw new Error("Segredo polo_token_secret não configurado");
  tokenSecretCache = data.valor;
  return tokenSecretCache;
}
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const MAX_FOTO_BYTES = 5 * 1024 * 1024;   // 5 MB por foto
const MAX_FOTOS = 10;

// --- Microsoft Graph (fotos no SharePoint) ---------------------------------
// As fotos das aulas vão para o SharePoint do colégio (biblioteca "Documentos"
// do site Antares Fotos). O compartilhamento anônimo está DESABILITADO no
// tenant (bom p/ privacidade), então nada fica público: a leitura acontece via
// Edge Function "fotos", que entrega URLs temporárias só a admins autenticados.
// Credenciais ficam na tabela `segredos` (só a service role lê). Se o Graph
// estiver indisponível/mal configurado, o upload cai no bucket privado do
// Supabase (fallback) — a chamada do professor nunca quebra por causa da foto.

let graphTokenCache: { token: string; exp: number } | null = null;
let graphCfgCache: { tenant: string; client: string; secret: string; driveId: string } | null = null;

async function getGraphConfig() {
  if (graphCfgCache) return graphCfgCache;
  const { data } = await supabase
    .from("segredos").select("chave, valor")
    .in("chave", ["ms_tenant_id", "ms_client_id", "ms_client_secret", "ms_drive_id"]);
  const m = new Map((data ?? []).map((r: any) => [r.chave, r.valor]));
  const tenant = m.get("ms_tenant_id"), client = m.get("ms_client_id");
  const secret = m.get("ms_client_secret"), driveId = m.get("ms_drive_id");
  if (!tenant || !client || !secret || !driveId) return null; // Graph não configurado
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

// Sobe UMA foto ao SharePoint. Retorna o id do item (drive item) ou null se
// o Graph não estiver disponível — nesse caso o chamador usa o bucket.
async function graphUploadFoto(path: string, foto: File): Promise<string | null> {
  const cfg = await getGraphConfig();
  if (!cfg) return null;
  const token = await getGraphToken(cfg);
  if (!token) return null;
  const url = `https://graph.microsoft.com/v1.0/drives/${cfg.driveId}/root:/${path}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": foto.type || "application/octet-stream" },
    body: await foto.arrayBuffer(),
  });
  if (!res.ok) return null;
  const item = await res.json();
  return item?.id ?? null;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// --- token HMAC ------------------------------------------------------------

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw", enc.encode(await getTokenSecret()),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

type TokenPayload = { poloId: string; tv: number; exp: number };

async function signToken(payload: TokenPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

async function verifyToken(token: string): Promise<TokenPayload | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  if (b64url(expected) !== sig) return null;
  try {
    const payload: TokenPayload = JSON.parse(
      atob(body.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Valida o token E confere se o token_version ainda é o atual
// (senha trocada => versão mudou => sessão antiga cai).
async function requirePolo(token: string | null) {
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const { data: polo } = await supabase
    .from("polos")
    .select("id, nome, slug, contato, token_version, ciclo_atual, status")
    .eq("id", payload.poloId)
    .single();
  if (!polo || polo.status !== "ativo" || polo.token_version !== payload.tv) return null;
  return polo;
}

// Registro de auditoria de uma ação do professor. Nunca deve quebrar o fluxo.
async function registrarLog(
  polo: { id: string; nome: string },
  entrada: { acao: string; entidade: string; entidadeId?: string | null; descricao: string },
) {
  try {
    await supabase.from("logs").insert({
      ator: `Professor · ${polo.nome}`,
      ator_tipo: "professor",
      acao: entrada.acao,
      entidade: entrada.entidade,
      entidade_id: entrada.entidadeId ?? null,
      descricao: entrada.descricao,
    });
  } catch (_e) { /* logs não podem interromper a ação principal */ }
}

// --- ações -----------------------------------------------------------------

async function acaoInfo(slug: string) {
  const { data } = await supabase
    .from("polos").select("nome").eq("slug", slug).eq("status", "ativo").single();
  if (!data) return json({ error: "Polo não encontrado" }, 404);
  return json({ nome: data.nome });
}

async function acaoLogin(slug: string, senha: string) {
  const { data, error } = await supabase.rpc("verify_polo_password", {
    p_slug: slug, p_password: senha,
  });
  if (error || !data?.length) {
    return json({ error: "Senha incorreta. Verifique com o administrativo." }, 401);
  }
  const polo = data[0];
  const token = await signToken({
    poloId: polo.polo_id, tv: polo.token_version, exp: Date.now() + TOKEN_TTL_MS,
  });
  await registrarLog({ id: polo.polo_id, nome: polo.nome }, {
    acao: "login", entidade: "sessao", entidadeId: polo.polo_id,
    descricao: `Professor acessou o polo "${polo.nome}".`,
  });
  return json({ token, polo: { id: polo.polo_id, nome: polo.nome } });
}

// Professor sugere o cadastro de um aluno fora da lista (antes ou depois da
// chamada existir). Vira pendência de aprovação no admin — não cria o aluno.
async function acaoSugerirAluno(token: string, nome?: string, historicoId?: string) {
  const polo = await requirePolo(token);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);
  const nomeTrim = (nome ?? "").trim();
  if (!nomeTrim) return json({ error: "Informe o nome do aluno" }, 400);

  const { data: existentes } = await supabase
    .from("alunos_sugeridos").select("id")
    .eq("polo_id", polo.id).eq("status", "pendente").ilike("nome", nomeTrim).limit(1);
  if (!existentes?.length) {
    await supabase.from("alunos_sugeridos").insert({
      polo_id: polo.id, historico_id: historicoId ?? null, nome: nomeTrim, status: "pendente",
    });
    await registrarLog(polo, {
      acao: "sugestao", entidade: "aluno",
      descricao: `Sugeriu o cadastro do aluno "${nomeTrim}".`,
    });
  }
  return json({ ok: true });
}

// Professor solicita os dados do responsável de um aluno — vira pendência no admin.
async function acaoSolicitarContato(
  token: string, alunoId?: string, alunoNome?: string, motivo?: string,
) {
  const polo = await requirePolo(token);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);

  let nome = (alunoNome ?? "").trim();
  let idValido: string | null = null;
  if (alunoId) {
    const { data: aluno } = await supabase
      .from("alunos").select("id, nome").eq("id", alunoId).eq("polo_id", polo.id).single();
    if (aluno) { idValido = aluno.id; nome = aluno.nome; }
  }
  if (!nome) return json({ error: "Aluno inválido" }, 400);
  const motivoTexto = (motivo ?? "").trim() || null;

  // Se já houver pendência para o mesmo aluno, atualiza o motivo e a data
  // (em vez de duplicar) — o admin sempre vê o pedido mais recente.
  const { data: existente } = await supabase
    .from("solicitacoes_contato").select("id")
    .eq("polo_id", polo.id).eq("status", "pendente")
    .eq(idValido ? "aluno_id" : "aluno_nome", idValido ?? nome)
    .maybeSingle();
  if (existente) {
    await supabase.from("solicitacoes_contato")
      .update({ motivo: motivoTexto, created_at: new Date().toISOString() })
      .eq("id", existente.id);
  } else {
    await supabase.from("solicitacoes_contato").insert({
      polo_id: polo.id, aluno_id: idValido, aluno_nome: nome,
      motivo: motivoTexto, status: "pendente",
    });
  }
  await registrarLog(polo, {
    acao: "contato", entidade: "aluno", entidadeId: idValido,
    descricao: `Solicitou o contato do responsável de "${nome}".`,
  });
  return json({ ok: true });
}

async function acaoDados(token: string) {
  const polo = await requirePolo(token);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);

  const [alunosRes, materiaisRes, historicoRes, configRes] = await Promise.all([
    supabase
      .from("alunos")
      .select("id, nome, contato, observacoes")
      .eq("polo_id", polo.id).eq("status", "ativo").order("nome"),
    supabase
      .from("materiais")
      .select("numero_aula, titulo, descricao, arquivo_path")
      .eq("status", "ativo").order("numero_aula"),
    // Chamadas do ciclo atual do polo. temFotos distingue "pendente de fotos"
    // (ainda selecionável, pra anexar depois) de "concluída" (bloqueada).
    supabase
      .from("historico_aulas")
      .select("id, numero_aula, fotos_aula(id)")
      .eq("polo_id", polo.id).eq("ciclo", polo.ciclo_atual),
    // WhatsApp central do colégio (Configurações do admin) — destino das
    // consultas de responsáveis. O contato do polo é apenas informativo.
    supabase
      .from("configuracoes").select("valor")
      .eq("chave", "contato_antares").maybeSingle(),
  ]);
  const chamadas = (historicoRes.data ?? []).map((h: any) => ({
    numeroAula: h.numero_aula,
    historicoId: h.id,
    temFotos: (h.fotos_aula?.length ?? 0) > 0,
  }));

  const alunos = (alunosRes.data ?? []).map((a: any) => ({
    id: a.id,
    nome: a.nome,
    contato: a.contato,
    observacoes: a.observacoes,
  }));

  // URLs assinadas dos PDFs (válidas por 12h, mesmo TTL da sessão)
  const materiais = await Promise.all(
    (materiaisRes.data ?? []).map(async (m: any) => {
      let url: string | null = null;
      if (m.arquivo_path) {
        const { data: signed } = await supabase.storage
          .from("materiais").createSignedUrl(m.arquivo_path, TOKEN_TTL_MS / 1000);
        url = signed?.signedUrl ?? null;
      }
      return { numero_aula: m.numero_aula, titulo: m.titulo, descricao: m.descricao, url };
    }),
  );

  return json({
    polo: { id: polo.id, nome: polo.nome, contato: polo.contato, ciclo: polo.ciclo_atual },
    contatoAntares: configRes.data?.valor ?? null,
    alunos, materiais, chamadas,
  });
}

// Retoma uma chamada "pendente de fotos" — usado ao selecionar de novo a aula,
// inclusive depois de recarregar a página (a presença já marcada volta pra tela).
async function acaoObterChamada(token: string, historicoId?: string) {
  const polo = await requirePolo(token);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);
  if (!historicoId) return json({ error: "Registro de aula não encontrado" }, 404);

  const { data: hist } = await supabase
    .from("historico_aulas")
    .select("id, numero_aula, data_hora, professores_nomes, relatorio, presencas(aluno_id, presente)")
    .eq("id", historicoId).eq("polo_id", polo.id).single();
  if (!hist) return json({ error: "Registro de aula não encontrado" }, 404);

  return json({
    historicoId: hist.id,
    numeroAula: hist.numero_aula,
    dataAula: String(hist.data_hora).slice(0, 10),
    professoresNomes: hist.professores_nomes ?? [],
    relatorio: hist.relatorio,
    presencas: (hist.presencas ?? []).map((p: any) => ({ alunoId: p.aluno_id, presente: p.presente })),
  });
}

// Salva a presença de UM aluno na hora (sem esperar um botão de "salvar
// chamada" — cada toggle do professor já fica gravado). A chamada em si
// (historico_aulas) já precisa existir — é criada no 1º toggle via acaoChamada.
async function acaoAtualizarPresenca(
  token: string, historicoId?: string, alunoId?: string, presente?: boolean,
) {
  const polo = await requirePolo(token);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);
  if (!historicoId || !alunoId || typeof presente !== "boolean") {
    return json({ error: "Dados inválidos" }, 400);
  }

  const { data: hist } = await supabase
    .from("historico_aulas").select("id, polo_id").eq("id", historicoId).single();
  if (!hist || hist.polo_id !== polo.id) {
    return json({ error: "Registro de aula não encontrado" }, 404);
  }
  const { data: aluno } = await supabase
    .from("alunos").select("id, nome").eq("id", alunoId).eq("polo_id", polo.id).single();
  if (!aluno) return json({ error: "Aluno inválido" }, 400);

  const { error } = await supabase
    .from("presencas")
    .upsert(
      { historico_id: historicoId, aluno_id: alunoId, aluno_nome: aluno.nome, presente },
      { onConflict: "historico_id,aluno_id" },
    );
  if (error) return json({ error: "Erro ao salvar a presença" }, 500);
  return json({ ok: true });
}

// O ciclo se encerra quando TODAS as 18 aulas estão concluídas (com foto).
// Se estiver completo, avança o ciclo_atual (libera 1-18 de novo) e retorna true.
async function avancarCicloSeCompleto(poloId: string, ciclo: number): Promise<boolean> {
  const { data } = await supabase
    .from("historico_aulas")
    .select("numero_aula, fotos_aula(id)")
    .eq("polo_id", poloId).eq("ciclo", ciclo);
  const comFotos = new Set(
    (data ?? [])
      .filter((h: any) => (h.fotos_aula?.length ?? 0) > 0)
      .map((h: any) => h.numero_aula),
  );
  if (comFotos.size < 18) return false;
  await supabase.from("polos").update({ ciclo_atual: ciclo + 1 }).eq("id", poloId);
  return true;
}

// Valida a lista de fotos; retorna a Response de erro ou null se ok.
function validarFotos(fotos: File[], jaExistentes = 0): Response | null {
  if (jaExistentes + fotos.length > MAX_FOTOS) {
    return json({ error: `Máximo de ${MAX_FOTOS} fotos por chamada` }, 400);
  }
  for (const foto of fotos) {
    if (!foto.type.startsWith("image/")) {
      return json({ error: `"${foto.name}" não é uma imagem` }, 400);
    }
    if (foto.size > MAX_FOTO_BYTES) {
      return json({ error: `"${foto.name}" passa de 5 MB` }, 400);
    }
  }
  return null;
}

// Sobe as fotos e registra em fotos_aula. Destino preferencial: SharePoint
// (arquivo_path = "sp:<itemId>"). Se o Graph falhar, cai no bucket privado do
// Supabase (arquivo_path = caminho no bucket). O front resolve os dois casos.
async function uploadFotos(poloId: string, historicoId: string, fotos: File[]): Promise<string[]> {
  const fotosErro: string[] = [];
  for (const foto of fotos) {
    const ext = (foto.name.split(".").pop() || "jpg").toLowerCase();
    const nome = `${crypto.randomUUID()}.${ext}`;
    const path = `${poloId}/${historicoId}/${nome}`;

    // 1) Tenta o SharePoint (Microsoft Graph)
    let arquivoPath: string | null = null;
    try {
      const itemId = await graphUploadFoto(path, foto);
      if (itemId) arquivoPath = `sp:${itemId}`;
    } catch (_e) { /* cai no fallback abaixo */ }

    // 2) Fallback: bucket privado do Supabase
    if (!arquivoPath) {
      const { error: upErr } = await supabase.storage
        .from("fotos-aulas")
        .upload(path, foto, { contentType: foto.type });
      if (upErr) { fotosErro.push(foto.name); continue; }
      arquivoPath = path;
    }

    await supabase.from("fotos_aula").insert({
      historico_id: historicoId, polo_id: poloId,
      nome_arquivo: foto.name, arquivo_path: arquivoPath,
    });
  }
  return fotosErro;
}

// Anexa fotos a uma chamada JÁ salva (a foto pode ficar para o final da aula).
async function acaoFotosExtra(form: FormData) {
  const polo = await requirePolo(form.get("token") as string | null);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);

  const historicoId = String(form.get("historicoId") ?? "");
  const { data: hist } = await supabase
    .from("historico_aulas").select("id, polo_id, numero_aula, ciclo").eq("id", historicoId).single();
  if (!hist || hist.polo_id !== polo.id) {
    return json({ error: "Registro de aula não encontrado" }, 404);
  }

  const fotos = form.getAll("fotos").filter((f): f is File => f instanceof File);
  if (!fotos.length) return json({ error: "Nenhuma foto enviada" }, 400);
  const { count } = await supabase
    .from("fotos_aula").select("id", { count: "exact", head: true })
    .eq("historico_id", historicoId);
  const invalida = validarFotos(fotos, count ?? 0);
  if (invalida) return invalida;

  const fotosErro = await uploadFotos(polo.id, hist.id, fotos);
  await registrarLog(polo, {
    acao: "fotos", entidade: "chamada", entidadeId: hist.id,
    descricao: `Enviou ${fotos.length} foto${fotos.length === 1 ? "" : "s"} da Aula ${hist.numero_aula} (Ciclo ${hist.ciclo}).`,
  });
  // Anexar fotos pode ter concluído a última aula pendente do ciclo.
  const cicloConcluido = await avancarCicloSeCompleto(polo.id, polo.ciclo_atual);
  return json({ historicoId: hist.id, fotosErro, cicloConcluido });
}

async function acaoChamada(form: FormData) {
  const polo = await requirePolo(form.get("token") as string | null);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);

  let dados: {
    numeroAula: number;
    professoresNomes?: string[];
    professorNome?: string; // compatibilidade
    dataAula?: string;      // YYYY-MM-DD
    relatorio?: string;
    presencas: { alunoId: string; presente: boolean }[];
    alunosExtras?: string[];
  };
  try {
    dados = JSON.parse(form.get("dados") as string);
  } catch {
    return json({ error: "Dados inválidos" }, 400);
  }

  // Lista de professores (mínimo 1 obrigatório). Aceita o campo antigo
  // professorNome como fallback.
  const professores = (dados.professoresNomes ?? (dados.professorNome ? [dados.professorNome] : []))
    .map((n) => String(n).trim()).filter(Boolean);
  if (!professores.length) return json({ error: "Informe ao menos um professor" }, 400);

  if (!dados.numeroAula || dados.numeroAula < 1 || dados.numeroAula > 18) {
    return json({ error: "Aula inválida" }, 400);
  }
  if (!dados.dataAula || !/^\d{4}-\d{2}-\d{2}$/.test(dados.dataAula)) {
    return json({ error: "Informe a data da aula" }, 400);
  }
  if (!dados.presencas?.length) return json({ error: "Nenhum aluno na chamada" }, 400);

  // Essa aula já foi registrada no ciclo atual do polo?
  const { count: jaDada } = await supabase
    .from("historico_aulas").select("id", { count: "exact", head: true })
    .eq("polo_id", polo.id).eq("ciclo", polo.ciclo_atual).eq("numero_aula", dados.numeroAula);
  if ((jaDada ?? 0) > 0) {
    return json({ error: "Esta aula já foi registrada neste ciclo. Escolha outra." }, 409);
  }

  // Data da aula ao meio-dia (evita virar o dia por fuso horário)
  const dataHora = new Date(`${dados.dataAula}T12:00:00`).toISOString();

  // Presenças só de alunos que realmente pertencem a este polo
  const { data: alunosPolo } = await supabase
    .from("alunos").select("id, nome").eq("polo_id", polo.id);
  const nomePorId = new Map((alunosPolo ?? []).map((a) => [a.id, a.nome]));
  const idsValidos = new Set((alunosPolo ?? []).map((a) => a.id));
  const presencas = dados.presencas.filter((p) => idsValidos.has(p.alunoId));
  if (!presencas.length) return json({ error: "Alunos inválidos para este polo" }, 400);

  // Valida fotos ANTES de gravar qualquer coisa (fotos são opcionais:
  // o professor pode salvar agora e anexar depois pela confirmação)
  const fotos = form.getAll("fotos").filter((f): f is File => f instanceof File);
  const invalida = validarFotos(fotos);
  if (invalida) return invalida;

  const { data: hist, error: histErr } = await supabase
    .from("historico_aulas")
    .insert({
      polo_id: polo.id,
      numero_aula: dados.numeroAula,
      ciclo: polo.ciclo_atual,
      professor_nome: professores.join(", "),
      professores_nomes: professores,
      data_hora: dataHora,
      relatorio: dados.relatorio || null,
      criado_por: "professor",
    })
    .select("id").single();
  if (histErr || !hist) return json({ error: "Erro ao salvar a chamada" }, 500);

  const { error: presErr } = await supabase.from("presencas").insert(
    presencas.map((p) => ({
      historico_id: hist.id, aluno_id: p.alunoId,
      aluno_nome: nomePorId.get(p.alunoId) ?? null, presente: p.presente,
    })),
  );
  if (presErr) {
    await supabase.from("historico_aulas").delete().eq("id", hist.id);
    return json({ error: "Erro ao salvar as presenças" }, 500);
  }

  // Alunos citados pelo professor mas fora da lista: viram SUGESTÃO de
  // cadastro (pendente) para o administrativo aprovar. Não cria aluno.
  const extras = (dados.alunosExtras ?? [])
    .map((n) => String(n).trim()).filter(Boolean).slice(0, 20);
  if (extras.length) {
    await supabase.from("alunos_sugeridos").insert(
      extras.map((nome) => ({
        polo_id: polo.id, historico_id: hist.id, nome, status: "pendente",
      })),
    );
  }

  await registrarLog(polo, {
    acao: "chamada", entidade: "chamada", entidadeId: hist.id,
    descricao: `Registrou a chamada da Aula ${dados.numeroAula} (Ciclo ${polo.ciclo_atual}).`,
  });

  const fotosErro = await uploadFotos(polo.id, hist.id, fotos);
  // Se o professor já enviou fotos junto com a chamada, isso pode ter fechado
  // o ciclo (todas as 18 concluídas). Sem fotos, a aula fica pendente.
  const cicloConcluido = await avancarCicloSeCompleto(polo.id, polo.ciclo_atual);
  return json({ historicoId: hist.id, fotosErro, cicloConcluido });
}

// --- roteamento ------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      // Com historicoId: anexar fotos a uma chamada já salva
      return form.get("historicoId")
        ? await acaoFotosExtra(form)
        : await acaoChamada(form);
    }
    const body = await req.json();
    switch (body.action) {
      case "info":  return await acaoInfo(body.slug);
      case "login": return await acaoLogin(body.slug, body.senha);
      case "dados": return await acaoDados(body.token);
      case "solicitarContato":
        return await acaoSolicitarContato(body.token, body.alunoId, body.alunoNome, body.motivo);
      case "sugerirAluno":
        return await acaoSugerirAluno(body.token, body.nome, body.historicoId);
      case "obterChamada":
        return await acaoObterChamada(body.token, body.historicoId);
      case "atualizarPresenca":
        return await acaoAtualizarPresenca(body.token, body.historicoId, body.alunoId, body.presente);
      default:      return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno" }, 500);
  }
});
