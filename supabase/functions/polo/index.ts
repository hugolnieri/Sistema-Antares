// Edge Function "polo" — toda a área do professor passa por aqui.
// A senha nunca é validada no navegador; sessões são tokens HMAC que
// carregam o token_version do polo — trocar a senha invalida tudo.
//
// Ações (POST JSON, exceto 'chamada' que é multipart/form-data):
//   info    { slug }                 -> { nome }
//   login   { slug, senha }          -> { token, polo }
//   dados   { token }                -> { polo, alunos (+responsáveis), materiais (URLs assinadas) }
//   chamada FormData: token, dados(JSON), fotos[] -> { historicoId }
//
// Secrets necessários: POLO_TOKEN_SECRET (defina com `supabase secrets set`).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TOKEN_SECRET = Deno.env.get("POLO_TOKEN_SECRET") ?? "defina-o-secret-polo";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const MAX_FOTO_BYTES = 5 * 1024 * 1024;   // 5 MB por foto
const MAX_FOTOS = 10;

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
    "raw", enc.encode(TOKEN_SECRET),
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
    .select("id, nome, slug, token_version, status")
    .eq("id", payload.poloId)
    .single();
  if (!polo || polo.status !== "ativo" || polo.token_version !== payload.tv) return null;
  return polo;
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
  return json({ token, polo: { id: polo.polo_id, nome: polo.nome } });
}

async function acaoDados(token: string) {
  const polo = await requirePolo(token);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);

  const [alunosRes, materiaisRes] = await Promise.all([
    supabase
      .from("alunos")
      .select("id, nome, contato, observacoes, aluno_responsaveis(parentesco, responsaveis(nome, telefone, observacoes))")
      .eq("polo_id", polo.id).eq("status", "ativo").order("nome"),
    supabase
      .from("materiais")
      .select("numero_aula, titulo, descricao, arquivo_path")
      .eq("status", "ativo").order("numero_aula"),
  ]);

  const alunos = (alunosRes.data ?? []).map((a: any) => ({
    id: a.id,
    nome: a.nome,
    contato: a.contato,
    observacoes: a.observacoes,
    responsaveis: (a.aluno_responsaveis ?? []).map((ar: any) => ({
      nome: ar.responsaveis?.nome,
      telefone: ar.responsaveis?.telefone,
      parentesco: ar.parentesco,
      observacoes: ar.responsaveis?.observacoes,
    })),
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

  return json({ polo: { id: polo.id, nome: polo.nome }, alunos, materiais });
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

async function uploadFotos(poloId: string, historicoId: string, fotos: File[]): Promise<string[]> {
  const fotosErro: string[] = [];
  for (const foto of fotos) {
    const ext = (foto.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${poloId}/${historicoId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("fotos-aulas")
      .upload(path, foto, { contentType: foto.type });
    if (upErr) { fotosErro.push(foto.name); continue; }
    await supabase.from("fotos_aula").insert({
      historico_id: historicoId, polo_id: poloId,
      nome_arquivo: foto.name, arquivo_path: path,
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
    .from("historico_aulas").select("id, polo_id").eq("id", historicoId).single();
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
  return json({ historicoId: hist.id, fotosErro });
}

async function acaoChamada(form: FormData) {
  const polo = await requirePolo(form.get("token") as string | null);
  if (!polo) return json({ error: "Sessão expirada. Digite a senha novamente." }, 401);

  let dados: {
    numeroAula: number;
    professorNome: string;
    observacoes?: string;
    relatorio?: string;
    presencas: { alunoId: string; presente: boolean }[];
    alunosExtras?: string[];
  };
  try {
    dados = JSON.parse(form.get("dados") as string);
  } catch {
    return json({ error: "Dados inválidos" }, 400);
  }

  if (!dados.professorNome?.trim()) return json({ error: "Informe o nome do professor" }, 400);
  if (!dados.numeroAula || dados.numeroAula < 1 || dados.numeroAula > 18) {
    return json({ error: "Aula inválida" }, 400);
  }
  if (!dados.presencas?.length) return json({ error: "Nenhum aluno na chamada" }, 400);

  // Presenças só de alunos que realmente pertencem a este polo
  const { data: alunosPolo } = await supabase
    .from("alunos").select("id").eq("polo_id", polo.id);
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
      professor_nome: dados.professorNome.trim(),
      observacoes: dados.observacoes || null,
      relatorio: dados.relatorio || null,
      criado_por: "professor",
    })
    .select("id").single();
  if (histErr || !hist) return json({ error: "Erro ao salvar a chamada" }, 500);

  const { error: presErr } = await supabase.from("presencas").insert(
    presencas.map((p) => ({
      historico_id: hist.id, aluno_id: p.alunoId, presente: p.presente,
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

  const fotosErro = await uploadFotos(polo.id, hist.id, fotos);
  return json({ historicoId: hist.id, fotosErro });
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
      default:      return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno" }, 500);
  }
});
