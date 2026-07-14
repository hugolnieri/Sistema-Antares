import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Field, ConfirmModal, EmptyState } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { registrarLog } from '../../lib/logs'
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
  const [loadingUsuarios, setLoadingUsuarios] = useState(true)
  const [novoEmail, setNovoEmail] = useState('')
  const [salvandoEmail, setSalvandoEmail] = useState<string | null>(null)
  const [usuarioRemover, setUsuarioRemover] = useState<PermissaoUsuario | null>(null)

  const carregar = useCallback(async () => {
    setLoadingContato(true)
    setLoadingUsuarios(true)
    const [cfgRes, permRes] = await Promise.all([
      supabase.from('configuracoes').select('chave, valor').eq('chave', CHAVE_CONTATO).limit(1),
      supabase.from('permissoes_usuarios').select('email, permissoes').order('email'),
    ])
    const row = (cfgRes.data ?? [])[0] as { valor: string | null } | undefined
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
    if (usuarios.some((u) => u.email === email)) {
      toast.error('Este usuário já está na lista.')
      return
    }
    setSalvandoEmail(email)
    const permissoes = permissoesIniciais()
    const { error } = await supabase
      .from('permissoes_usuarios').insert({ email, permissoes })
    setSalvandoEmail(null)
    if (error) { toast.error('Erro ao adicionar o usuário.'); return }
    registrarLog({
      acao: 'criar', entidade: 'usuario', entidadeId: email,
      descricao: `Adicionou restrições de acesso para "${email}".`,
    })
    setUsuarios((us) => [...us, { email, permissoes }].sort((a, b) => a.email.localeCompare(b.email)))
    setNovoEmail('')
    toast.success(`Usuário "${email}" adicionado. Ajuste as permissões e salve.`)
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
    toast.success(`Permissões de "${u.email}" salvas.`)
  }

  const removerUsuario = async () => {
    if (!usuarioRemover) return
    setSalvandoEmail(usuarioRemover.email)
    const { error } = await supabase
      .from('permissoes_usuarios').delete().eq('email', usuarioRemover.email)
    setSalvandoEmail(null)
    if (error) { toast.error('Erro ao remover as restrições.'); return }
    registrarLog({
      acao: 'excluir', entidade: 'usuario', entidadeId: usuarioRemover.email,
      descricao: `Removeu as restrições de "${usuarioRemover.email}" (voltou a ter acesso total).`,
    })
    setUsuarios((us) => us.filter((u) => u.email !== usuarioRemover.email))
    setUsuarioRemover(null)
    toast.success('Restrições removidas — o usuário voltou a ter acesso total.')
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
            Defina o que cada usuário pode fazer em cada menu:{' '}
            <strong>Editar</strong> (acesso completo), <strong>Só visualizar</strong>{' '}
            (vê tudo, sem botões de criar/editar/excluir) ou <strong>Sem acesso</strong>{' '}
            (o menu some). Usuários que <strong>não estão nesta lista têm acesso
            total</strong>. O login dos usuários é criado no Supabase
            (Authentication → Users) — aqui você só controla as permissões.
          </p>
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
          <ul className="flex flex-col gap-4">
            {usuarios.map((u) => {
              const salvandoEste = salvandoEmail === u.email
              return (
                <li key={u.email} className="rounded-lg border border-[var(--c-border)] p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold">
                      {u.email}
                      {u.email === emailLogado && (
                        <span className="badge badge--blue ml-2 !text-[11px]">você</span>
                      )}
                    </p>
                    {!somenteLeitura && (
                      <>
                        <span className="text-xs text-[var(--c-text-soft)]">Aplicar a tudo:</span>
                        {NIVEIS.map((n) => (
                          <button key={n.valor}
                                  className="badge badge--gray cursor-pointer !py-1 text-xs transition-opacity hover:opacity-75"
                                  onClick={() => aplicarTodos(u.email, n.valor)}>
                            {n.label}
                          </button>
                        ))}
                      </>
                    )}
                  </div>

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
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button className="btn btn-ghost !py-1.5 text-sm text-[var(--c-danger)]"
                              disabled={salvandoEste}
                              onClick={() => setUsuarioRemover(u)}>
                        Remover restrições
                      </button>
                      <button className="btn btn-primary !py-1.5 text-sm"
                              disabled={salvandoEste}
                              onClick={() => salvarUsuario(u)}>
                        {salvandoEste ? 'Salvando…' : 'Salvar permissões'}
                      </button>
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
        title="Remover restrições"
        message={<>Remover as restrições de <strong>{usuarioRemover?.email}</strong>?
          O usuário voltará a ter <strong>acesso total</strong> ao sistema.</>}
        confirmLabel="Remover restrições"
        loading={salvandoEmail !== null}
        onConfirm={removerUsuario}
        onClose={() => setUsuarioRemover(null)}
      />
    </div>
  )
}
