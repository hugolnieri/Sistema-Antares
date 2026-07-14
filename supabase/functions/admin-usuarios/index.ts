// Edge Function "admin-usuarios" — gestão de contas do painel administrativo.
// O front NUNCA usa a service role: criação/remoção/reset de usuários do Auth
// passa por aqui, com autorização verificada no servidor.
//
// Regras de acesso ao sistema (allowlist):
//   * admin master (configuracoes.admin_master) sempre pode tudo;
//   * demais usuários precisam estar em permissoes_usuarios;
//   * um trigger em auth.users impede contas fora da lista.
//
// Ações (POST JSON):
//   bootstrap     { token, senha }  -> cria o admin master (uma única vez;
//                                      exige segredos.bootstrap_token, apagado após o uso)
//   criarUsuario  { email }         -> cria conta com a senha padrão (caller precisa
//                                      poder editar Configurações; e-mail deve estar na lista)
//   removerUsuario{ email }         -> apaga a conta do Auth (não remove o master)
//   resetarSenha  { email }         -> volta a conta para a senha padrão
//
// A senha padrão é exibida no painel (Configurações) — o usuário troca depois
// pelo próprio painel (auth.updateUser).

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export const SENHA_PADRAO = "Antares@2026";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });

async function masterEmail(): Promise<string | null> {
  const { data } = await admin
    .from("configuracoes").select("valor").eq("chave", "admin_master").maybeSingle();
  return data?.valor ? String(data.valor).toLowerCase() : null;
}

// E-mail do usuário logado que chamou a função (via JWT do Authorization).
async function emailDoChamador(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data.user?.email?.toLowerCase() ?? null;
}

// Só quem pode EDITAR Configurações gerencia usuários (master sempre pode).
async function chamadorEhGestor(req: Request): Promise<boolean> {
  const email = await emailDoChamador(req);
  if (!email) return false;
  if (email === (await masterEmail())) return true;
  const { data } = await admin
    .from("permissoes_usuarios").select("permissoes").eq("email", email).maybeSingle();
  if (!data) return false;
  return ((data.permissoes as Record<string, string>)?.configuracoes ?? "editar") === "editar";
}

async function idPorEmail(email: string): Promise<string | null> {
  const { data } = await admin.rpc("auth_user_id_por_email", { p_email: email });
  return (data as string | null) ?? null;
}

// Cria o admin master. Exige o bootstrap_token (gerado no provisionamento),
// que é apagado após o primeiro uso — a ação não funciona duas vezes.
async function acaoBootstrap(token?: string, senha?: string) {
  const { data: s } = await admin
    .from("segredos").select("valor").eq("chave", "bootstrap_token").maybeSingle();
  if (!s?.valor || !token || s.valor !== token) {
    return json({ error: "Não autorizado" }, 403);
  }
  const email = await masterEmail();
  if (!email) return json({ error: "admin_master não configurado" }, 500);
  if (!senha || senha.length < 8) return json({ error: "Senha muito curta" }, 400);

  if (await idPorEmail(email)) {
    await admin.from("segredos").delete().eq("chave", "bootstrap_token");
    return json({ ok: true, jaExistia: true });
  }
  const { error } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
  });
  if (error) return json({ error: `Erro ao criar o usuário: ${error.message}` }, 500);
  await admin.from("segredos").delete().eq("chave", "bootstrap_token");
  await admin.from("logs").insert({
    ator: "Sistema", ator_tipo: "sistema", acao: "criar", entidade: "usuario",
    entidade_id: email, descricao: `Conta do administrador master criada (${email}).`,
  });
  return json({ ok: true });
}

// Cria a conta de um usuário JÁ presente na lista de permissões,
// com a senha padrão (o usuário troca depois no próprio painel).
async function acaoCriarUsuario(req: Request, email?: string) {
  if (!(await chamadorEhGestor(req))) return json({ error: "Não autorizado" }, 403);
  const alvo = (email ?? "").trim().toLowerCase();
  if (!alvo || !alvo.includes("@")) return json({ error: "E-mail inválido" }, 400);

  const { data: listado } = await admin
    .from("permissoes_usuarios").select("email").eq("email", alvo).maybeSingle();
  if (!listado) {
    return json({ error: "Adicione o e-mail à lista de permissões antes de criar a conta." }, 400);
  }
  if (await idPorEmail(alvo)) return json({ ok: true, jaExistia: true });

  const { error } = await admin.auth.admin.createUser({
    email: alvo, password: SENHA_PADRAO, email_confirm: true,
  });
  if (error) return json({ error: `Erro ao criar o usuário: ${error.message}` }, 500);
  return json({ ok: true });
}

// Remove a conta do Auth (o usuário perde o acesso na hora).
async function acaoRemoverUsuario(req: Request, email?: string) {
  if (!(await chamadorEhGestor(req))) return json({ error: "Não autorizado" }, 403);
  const alvo = (email ?? "").trim().toLowerCase();
  if (!alvo) return json({ error: "E-mail inválido" }, 400);
  if (alvo === (await masterEmail())) {
    return json({ error: "O administrador master não pode ser removido." }, 400);
  }
  const id = await idPorEmail(alvo);
  if (!id) return json({ ok: true, naoExistia: true });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return json({ error: `Erro ao remover o usuário: ${error.message}` }, 500);
  return json({ ok: true });
}

// Volta a conta para a senha padrão (ex.: usuário esqueceu a senha).
async function acaoResetarSenha(req: Request, email?: string) {
  if (!(await chamadorEhGestor(req))) return json({ error: "Não autorizado" }, 403);
  const alvo = (email ?? "").trim().toLowerCase();
  if (!alvo) return json({ error: "E-mail inválido" }, 400);
  if (alvo === (await masterEmail())) {
    return json({ error: "Use a troca de senha do próprio painel para o master." }, 400);
  }
  const id = await idPorEmail(alvo);
  if (!id) return json({ error: "Usuário não encontrado" }, 404);
  const { error } = await admin.auth.admin.updateUserById(id, { password: SENHA_PADRAO });
  if (error) return json({ error: `Erro ao redefinir a senha: ${error.message}` }, 500);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const body = await req.json();
    switch (body.action) {
      case "bootstrap":      return await acaoBootstrap(body.token, body.senha);
      case "criarUsuario":   return await acaoCriarUsuario(req, body.email);
      case "removerUsuario": return await acaoRemoverUsuario(req, body.email);
      case "resetarSenha":   return await acaoResetarSenha(req, body.email);
      default:               return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno" }, 500);
  }
});
