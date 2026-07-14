import { useCallback, useEffect, useState } from 'react'
import { supabase, MOCK } from '../../lib/supabase'
import { Field, ConfirmModal, EmptyState } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { registrarLog } from '../../lib/logs'
import { adminUsuarios, SENHA_PADRAO } from '../../lib/adminApi'
import {
  MENUS, NIVEIS, usePermissoes,
  type NivelPermissao, type PermissaoUsuario,
} from '../../lib/permissoes'

// Chave da configuração: WhatsApp do responsável do colégio Antares.
// É este número que recebe as consultas de responsáveis feitas pelos
// professores na chamada — o contato cadastrado em cada polo é só informativo.
const CHAVE_CONTATO = 'contato_antares'

// Permissões iniciais de um usuário recém-restrito: visualiza o dia a dia,
// mas não mexe em Configurações nem nos Registros até alguém liberar.
const permissoesIniciais = (): Record<string, NivelPermissao> => {
  const p: Record<string, NivelPermissao> = {}
  for (const m of MENUS) p[m.key] = 'ver'
  p.configuracoes = 'nenhum'
  p.logs = 'nenhum'
  return p
}

export default function Configuracoes() {
  const toast = useToast()
  const { email: emailLogado, podeEditar } = usePermissoes()
  const somenteLeitura = !podeEditar('configuracoes')

  // --- Contato central da Antares ---
  const [contato, setContato] = useState('')
  const [contatoExiste, setContatoExiste] = useState(false)
  const [loadingContato, setLoadingContato] = useState(true)
  const [salvandoContato, setSalvandoContato] = useState(false)

  // --- Controle de acesso ---
  const [usuarios, setUsuarios] = useState<PermissaoUsuario[]>([])
  const [emailMaster, setEmailMaster] = useState('')
  const [loadingUsuarios, setLoadingUsuarios] = useState(true)
  const [novoEmail, setNovoEmail] = useState('')
  const [salvandoEmail, setSalvandoEmail] = useState<string | null>(null)
  const [usuarioRemover, setUsuarioRemover] = useState<PermissaoUsuario | null>(null)
  // E-mails com o cartão de permissões expandido (recolhidos por padrão).
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const alternarExpandido = (email: string) =>
    setExpandidos((s) => {
      const n = new Set(s)
      n.has(email) ? n.delete(email) : n.add(email)
      return n
    })

  // Resumo dos níveis (para exibir quando o cartão está recolhido).
  const resumoNiveis = (u: PermissaoUsuario) => {
    const c = { editar: 0, ver: 0, nenhum: 0 }
    for (const m of MENUS) c[(u.permissoes[m.key] ?? 'editar') as NivelPermissao]++
    return c
  }

  const carregar = useCallback(async () => {
    setLoadingContato(true)
    setLoadingUsuarios(true)
    const [cfgRes, permRes] = await Promise.all([
      supabase.from('configuracoes').select('chave, valor'),
      supabase.from('permissoes_usuarios').select('email, permissoes').order('email'),
    ])
    const cfgs = (cfgRes.data ?? []) as { chave: string; valor: string | null }[]
    const row = cfgs.find((c) => c.chave === CHAVE_CONTATO)
    setEmailMaster((cfgs.find((c) => c.chave === 'admin_master')?.valor ?? '').toLowerCase())
    setContatoExiste(!!row)
    setContato(row?.valor ?? '')
    setLoadingContato(false)
    setUsuarios((permRes.data ?? []) as unknown as PermissaoUsuario[])
    setLoadingUsuarios(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const salvarContato = async () => {
    setSalvandoContato(true)
    const valor = contato.trim() || null
    const { error } = contatoExiste
      ? await supabase.from('configuracoes').update({ valor }).eq('chave', CHAVE_CONTATO)
      : await supabase.from('configuracoes').insert({ chave: CHAVE_CONTATO, valor })
    setSalvandoContato(false)
    if (error) { toast.error('Erro ao salvar as configurações.'); return }
    setContatoExiste(true)
    registrarLog({
      acao: 'editar', entidade: 'configuracao', entidadeId: CHAVE_CONTATO,
      descricao: valor
        ? `Definiu o WhatsApp do responsável do colégio como "${valor}".`
        : 'Removeu o WhatsApp do responsável do colégio.',
    })
    toast.success('Configurações salvas.')
  }

  // --- Ações do controle de acesso ---

  const adicionarUsuario = async () => {
    const email = novoEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      toast.error('Informe um e-mail válido.')
      return
    }
    if (email === emailMaster) {
      toast.error('Este é o administrador master — ele já tem acesso total.')
      return
    }
    if (usuarios.some((u) => u.email === email)) {
      toast.error('Este usuário já está na lista.')
      return
    }
    setSalvandoEmail(email)
    const permissoes = permissoesIniciais()
    // Ao restringir a própria conta, mantém Configurações editável (senão a
    // proteção anti-bloqueio impediria salvar as demais permissões).
    if (email === emailLogado) permissoes.configuracoes = 'editar'
    const { error } = await supabase
      .from('permissoes_usuarios').insert({ email, permissoes })
    if (error) { setSalvandoEmail(null); toast.error('Erro ao adicionar o usuário.'); return }
    // Cria a conta de verdade (Auth) com a senha padrão — validado no servidor.
    try {
      await adminUsuarios('criarUsuario', email)
    } catch (e: any) {
      // Sem conta o acesso não funciona: desfaz a linha para não ficar pela metade.
      await supabase.from('permissoes_usuarios').delete().eq('email', email)
      setSalvandoEmail(null)
      toast.error(e.message ?? 'Erro ao criar a conta do usuário.')
      return
    }
    setSalvandoEmail(null)
    registrarLog({
      acao: 'criar', entidade: 'usuario', entidadeId: email,
      descricao: `Liberou o acesso de "${email}" ao sistema (senha padrão).`,
    })
    setUsuarios((us) => [...us, { email, permissoes }].sort((a, b) => a.email.localeCompare(b.email)))
    setExpandidos((s) => new Set(s).add(email)) // já abre o novo para ajustar
    setNovoEmail('')
    toast.success(`Acesso liberado para "${email}". Senha inicial: ${SENHA_PADRAO}`)
  }

  // Volta a conta do usuário para a senha padrão (ex.: esqueceu a senha).
  const resetarSenha = async (u: PermissaoUsuario) => {
    setSalvandoEmail(u.email)
    try {
      await adminUsuarios('resetarSenha', u.email)
      registrarLog({
        acao: 'senha', entidade: 'usuario', entidadeId: u.email,
        descricao: `Redefiniu a senha de "${u.email}" para a padrão.`,
      })
      toast.success(MOCK
        ? 'Na demonstração não há contas reais — ação simulada.'
        : `Senha de "${u.email}" redefinida para ${SENHA_PADRAO}.`)
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao redefinir a senha.')
    } finally {
      setSalvandoEmail(null)
    }
  }

  const mudarNivel = (email: string, menu: string, nivelNovo: NivelPermissao) =>
    setUsuarios((us) => us.map((u) =>
      u.email === email ? { ...u, permissoes: { ...u.permissoes, [menu]: nivelNovo } } : u))

  const aplicarTodos = (email: string, nivelNovo: NivelPermissao) =>
    setUsuarios((us) => us.map((u) => {
      if (u.email !== email) return u
      const permissoes: Record<string, NivelPermissao> = {}
      for (const m of MENUS) permissoes[m.key] = nivelNovo
      return { ...u, permissoes }
    }))

  const salvarUsuario = async (u: PermissaoUsuario) => {
    // Anti-bloqueio: ninguém remove o próprio acesso de edição às Configurações.
    if (u.email === emailLogado && u.permissoes.configuracoes !== 'editar') {
      toast.error('Você não pode remover o seu próprio acesso de edição às Configurações.')
      return
    }
    setSalvandoEmail(u.email)
    const { error } = await supabase
      .from('permissoes_usuarios').update({ permissoes: u.permissoes }).eq('email', u.email)
    setSalvandoEmail(null)
    if (error) { toast.error('Erro ao salvar as permissões.'); return }
    const resumo = MENUS
      .map((m) => `${m.label}: ${NIVEIS.find((n) => n.valor === (u.permissoes[m.key] ?? 'editar'))?.label}`)
      .join(', ')
    registrarLog({
      acao: 'editar', entidade: 'usuario', entidadeId: u.email,
      descricao: `Alterou as permissões de "${u.email}" (${resumo}).`,
    })
    // Se editou a própria conta, recarrega para aplicar na hora (as permissões
    // são lidas no carregamento). Para outros usuários, vale no próximo acesso.
    if (u.email === emailLogado) {
      toast.success('Suas permissões foram atualizadas. Recarregando…')
      setTimeout(() => window.location.reload(), 900)
      return
    }
    toast.success(`Permissões de "${u.email}" salvas.`)
  }

  const removerUsuario = async () => {
    if (!usuarioRemover) return
    if (usuarioRemover.email === emailLogado) {
      toast.error('Você não pode remover o seu próprio acesso.')
      setUsuarioRemover(null)
      return
    }
    setSalvandoEmail(usuarioRemover.email)
    const { error } = await supabase
      .from('permissoes_usuarios').delete().eq('email', usuarioRemover.email)
    if (error) { setSalvandoEmail(null); toast.error('Erro ao remover o usuário.'); return }
    // Apaga também a conta do Auth — o acesso morre na hora.
    try {
      await adminUsuarios('removerUsuario', usuarioRemover.email)
    } catch (e: any) {
      toast.error(e.message ?? 'A conta pode não ter sido apagada — tente de novo.')
    }
    setSalvandoEmail(null)
    registrarLog({
      acao: 'excluir', entidade: 'usuario', entidadeId: usuarioRemover.email,
      descricao: `Removeu o acesso de "${usuarioRemover.email}" ao sistema.`,
    })
    setUsuarios((us) => us.filter((u) => u.email !== usuarioRemover.email))
    setUsuarioRemover(null)
    toast.success('Usuário removido — ele não consegue mais entrar no sistema.')
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* ---- Consultas de responsáveis ---- */}
      <div className="card flex flex-col gap-4">
        <div>
          <h2 className="font-bold">💬 Consultas de responsáveis</h2>
          <p className="mt-1 text-sm text-[var(--c-text-soft)]">
            Quando o professor toca em “Consultar responsáveis” na chamada, o
            WhatsApp abre direto para o número abaixo — é o responsável do
            colégio Antares quem recebe e responde esses pedidos. O contato
            cadastrado em cada polo é <strong>apenas informativo</strong> e não
            recebe as consultas.
          </p>
        </div>
        {loadingContato ? (
          <div className="flex flex-col gap-2">
            <div className="skeleton w-1/2" />
            <div className="skeleton w-full" />
          </div>
        ) : (
          <fieldset disabled={somenteLeitura} className="contents">
            <Field label="WhatsApp do responsável do colégio Antares">
              <input
                value={contato}
                placeholder="Ex.: (11) 98888-0000"
                inputMode="tel"
                onChange={(e) => setContato(e.target.value)}
              />
            </Field>
            {!contato.trim() && (
              <p className="rounded-lg bg-[var(--c-amber-bg)] px-3 py-2 text-xs text-[var(--c-amber-fg)]">
                ⚠️ Sem número definido, o botão “Consultar responsáveis” não
                aparece para os professores na chamada.
              </p>
            )}
            {!somenteLeitura && (
              <button className="btn btn-primary self-start" onClick={salvarContato} disabled={salvandoContato}>
                {salvandoContato ? 'Salvando…' : 'Salvar'}
              </button>
            )}
          </fieldset>
        )}
      </div>

      {/* ---- Controle de acesso ---- */}
      <div className="card flex flex-col gap-4">
        <div>
          <h2 className="font-bold">🔐 Controle de acesso</h2>
          <p className="mt-1 text-sm text-[var(--c-text-soft)]">
            <strong>Somente o administrador master e os e-mails desta lista conseguem
            entrar no sistema.</strong> Ao adicionar um e-mail, a conta é criada na hora
            com a senha padrão <strong>{SENHA_PADRAO}</strong> — a pessoa entra e pode
            trocar a senha clicando no avatar (canto superior direito). Para cada menu,
            defina: <strong>Editar</strong> (acesso completo), <strong>Só visualizar</strong>{' '}
            (vê tudo, sem botões de criar/editar/excluir) ou <strong>Sem acesso</strong>{' '}
            (o menu some).
          </p>
          <p className="mt-2 text-xs text-[var(--c-text-soft)]">
            Mudanças de permissão valem no <strong>próximo login</strong> do usuário
            (ou ao recarregar a página dele). Remover um usuário apaga a conta —
            ele não entra mais.
          </p>
          {MOCK && (
            <p className="mt-2 rounded-lg bg-[var(--c-amber-bg)] px-3 py-2 text-xs text-[var(--c-amber-fg)]">
              🧪 <strong>Modo demonstração:</strong> não há contas reais — qualquer
              e-mail entra, e as restrições valem se o e-mail estiver na lista.
              No sistema real (Supabase), só entra quem estiver aqui.
            </p>
          )}
        </div>

        {!somenteLeitura && (
          <div className="flex gap-2">
            <input
              value={novoEmail}
              type="email"
              placeholder="email@dousuario.com"
              className="min-w-0 flex-1 rounded-lg border border-[var(--c-border)] px-3 py-2"
              onChange={(e) => setNovoEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') adicionarUsuario() }}
            />
            <button className="btn btn-primary" disabled={!novoEmail.trim() || salvandoEmail !== null}
                    onClick={adicionarUsuario}>
              + Adicionar usuário
            </button>
          </div>
        )}

        {loadingUsuarios ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" />)}
          </div>
        ) : usuarios.length === 0 ? (
          <EmptyState
            icon="🔓" title="Nenhuma restrição cadastrada"
            message="Todos os usuários têm acesso total. Adicione um e-mail acima para restringir o que ele pode ver ou editar."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {usuarios.map((u) => {
              const salvandoEste = salvandoEmail === u.email
              const aberto = expandidos.has(u.email)
              const r = resumoNiveis(u)
              return (
                <li key={u.email} className="rounded-lg border border-[var(--c-border)]">
                  {/* Cabeçalho clicável: recolhe/expande as permissões do usuário */}
                  <button
                    className="flex w-full items-center gap-2 p-4 text-left"
                    aria-expanded={aberto}
                    onClick={() => alternarExpandido(u.email)}
                  >
                    <span className={`shrink-0 text-xs text-[var(--c-text-soft)] transition-transform ${aberto ? 'rotate-90' : ''}`}
                          aria-hidden="true">▶</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {u.email}
                      {u.email === emailLogado && (
                        <span className="badge badge--blue ml-2 !text-[11px]">você</span>
                      )}
                    </span>
                    {!aberto && (
                      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        {r.editar > 0 && <span className="badge badge--green !py-0.5 !text-[11px]">{r.editar} editar</span>}
                        {r.ver > 0 && <span className="badge badge--gray !py-0.5 !text-[11px]">{r.ver} ver</span>}
                        {r.nenhum > 0 && <span className="badge badge--red !py-0.5 !text-[11px]">{r.nenhum} s/ acesso</span>}
                      </span>
                    )}
                  </button>

                  {aberto && (
                    <div className="flex flex-col gap-3 border-t border-[var(--c-border)] p-4">
                      {!somenteLeitura && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--c-text-soft)]">Aplicar a tudo:</span>
                          {NIVEIS.map((n) => (
                            <button key={n.valor}
                                    className="badge badge--gray cursor-pointer !py-1 text-xs transition-opacity hover:opacity-75"
                                    onClick={() => aplicarTodos(u.email, n.valor)}>
                              {n.label}
                            </button>
                          ))}
                        </div>
                      )}

                      <fieldset disabled={somenteLeitura || salvandoEste} className="contents">
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                          {MENUS.map((m) => (
                            <label key={m.key} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--c-border)] px-3 py-2 text-sm">
                              <span className="font-medium">{m.label}</span>
                              <select
                                value={u.permissoes[m.key] ?? 'editar'}
                                className="!w-auto rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] !px-2 !py-1 text-xs"
                                onChange={(e) => mudarNivel(u.email, m.key, e.target.value as NivelPermissao)}
                              >
                                {NIVEIS.map((n) => (
                                  <option key={n.valor} value={n.valor}>{n.label}</option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      {!somenteLeitura && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button className="btn btn-ghost !py-1.5 text-sm"
                                  disabled={salvandoEste}
                                  onClick={() => resetarSenha(u)}>
                            🔑 Redefinir senha padrão
                          </button>
                          <button className="btn btn-ghost !py-1.5 text-sm text-[var(--c-danger)]"
                                  disabled={salvandoEste}
                                  onClick={() => setUsuarioRemover(u)}>
                            Remover acesso
                          </button>
                          <button className="btn btn-primary !py-1.5 text-sm"
                                  disabled={salvandoEste}
                                  onClick={() => salvarUsuario(u)}>
                            {salvandoEste ? 'Salvando…' : 'Salvar permissões'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-xs text-[var(--c-text-soft)]">
          As permissões passam a valer no próximo acesso do usuário (ou ao
          recarregar a página). Toda alteração fica registrada em Registros.
        </p>
      </div>

      <ConfirmModal
        open={!!usuarioRemover}
        title="Remover acesso"
        message={<>Remover o acesso de <strong>{usuarioRemover?.email}</strong>?
          A conta será apagada e o usuário <strong>não conseguirá mais entrar</strong> no
          sistema. Esta ação não pode ser desfeita (você pode liberá-lo de novo depois).</>}
        confirmLabel="Remover acesso"
        loading={salvandoEmail !== null}
        onConfirm={removerUsuario}
        onClose={() => setUsuarioRemover(null)}
      />
    </div>
  )
}
