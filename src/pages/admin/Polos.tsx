import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer, Field, Modal, ConfirmModal, StatusBadge } from '../../components/ui'
import { PoloMap } from '../../components/PoloMap'
import { useToast } from '../../components/Toast'
import { gerarSlug, linkDoPolo } from '../../lib/format'
import { enderecoBuscavel, geocodificarEndereco } from '../../lib/geocode'
import { registrarLog } from '../../lib/logs'
import type { Polo } from '../../lib/types'

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]

const FORM_VAZIO = {
  nome: '', slug: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  responsavel: '', contato: '', pix: '', observacoes: '',
  status: 'ativo' as 'ativo' | 'inativo',
  latitude: '', longitude: '',
}

export default function Polos() {
  const [polos, setPolos] = useState<Polo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [visao, setVisao] = useState<'lista' | 'mapa'>('lista')
  const [statusLocalizacao, setStatusLocalizacao] = useState<
    'ocioso' | 'buscando' | 'encontrado' | 'nao-encontrado'
  >('ocioso')
  const toast = useToast()

  // Drawer criar/editar
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<Polo | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [formErros, setFormErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  // Modal de senha
  const [poloSenha, setPoloSenha] = useState<Polo | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [senhaErro, setSenhaErro] = useState('')

  // Confirmação de inativação
  const [poloInativar, setPoloInativar] = useState<Polo | null>(null)
  // Confirmação de exclusão definitiva
  const [poloExcluir, setPoloExcluir] = useState<Polo | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, slug, cep, logradouro, numero, complemento, bairro, cidade, estado, responsavel, contato, pix, observacoes, latitude, longitude, token_version, ciclo_atual, status, created_at')
      .order('nome')
    if (error) setErro('Não foi possível carregar os polos.')
    else setPolos((data ?? []) as Polo[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirNovo = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setFormErros({})
    setStatusLocalizacao('ocioso')
    setDrawerAberto(true)
  }

  const abrirEdicao = (p: Polo) => {
    setEditando(p)
    setForm({
      nome: p.nome, slug: p.slug,
      cep: p.cep ?? '', logradouro: p.logradouro ?? '', numero: p.numero ?? '',
      complemento: p.complemento ?? '', bairro: p.bairro ?? '',
      cidade: p.cidade ?? '', estado: p.estado ?? '',
      responsavel: p.responsavel ?? '', contato: p.contato ?? '',
      pix: p.pix ?? '', observacoes: p.observacoes ?? '', status: p.status,
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : '',
    })
    setFormErros({})
    setStatusLocalizacao('ocioso')
    setDrawerAberto(true)
  }

  // Link gerado automaticamente a partir do nome — só ao CRIAR o polo.
  // Ao editar, o slug já existente fica congelado: o link já foi
  // distribuído ao professor e trocar o nome não pode quebrá-lo.
  const mudarNome = (nome: string) =>
    setForm((f) => ({ ...f, nome, slug: editando ? f.slug : gerarSlug(nome) }))

  const validar = () => {
    const erros: Record<string, string> = {}
    if (!form.nome.trim()) erros.nome = 'Informe o nome do polo.'
    else if (!form.slug.trim()) {
      erros.nome = 'O nome deve conter letras ou números (usados para gerar o link).'
    }
    const temLat = form.latitude.trim() !== ''
    const temLng = form.longitude.trim() !== ''
    if (temLat !== temLng) {
      erros.coords = 'Preencha latitude E longitude (ou deixe as duas vazias).'
    } else if (temLat && (isNaN(Number(form.latitude)) || isNaN(Number(form.longitude)))) {
      erros.coords = 'Coordenadas inválidas. Use números (ex.: -23.5505).'
    }
    setFormErros(erros)
    return Object.keys(erros).length === 0
  }

  // Busca automática de coordenadas assim que Logradouro + Cidade + UF
  // estiverem preenchidos. Não sobrescreve latitude/longitude já definidos
  // (à mão ou por uma busca anterior) — só entra em ação enquanto vazios.
  useEffect(() => {
    if (!drawerAberto) return
    if (form.latitude.trim() || form.longitude.trim()) return
    if (!enderecoBuscavel(form)) { setStatusLocalizacao('ocioso'); return }

    const controller = new AbortController()
    setStatusLocalizacao('buscando')
    const timer = setTimeout(async () => {
      try {
        const achado = await geocodificarEndereco(form, controller.signal)
        if (achado) {
          setForm((f) => ({ ...f, latitude: achado.lat, longitude: achado.lon }))
          setFormErros((e) => ({ ...e, coords: '' }))
          setStatusLocalizacao('encontrado')
        } else {
          setStatusLocalizacao('nao-encontrado')
        }
      } catch {
        if (!controller.signal.aborted) setStatusLocalizacao('nao-encontrado')
      }
    }, 800)

    return () => { clearTimeout(timer); controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    drawerAberto, form.cep, form.logradouro, form.numero,
    form.cidade, form.estado, form.latitude, form.longitude,
  ])

  const salvar = async () => {
    if (!validar()) return
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(), slug: form.slug.trim(),
      cep: form.cep.trim() || null,
      logradouro: form.logradouro.trim() || null,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim() || null,
      responsavel: form.responsavel.trim() || null,
      contato: form.contato.trim() || null,
      pix: form.pix.trim() || null,
      observacoes: form.observacoes.trim() || null,
      latitude: form.latitude.trim() ? Number(form.latitude) : null,
      longitude: form.longitude.trim() ? Number(form.longitude) : null,
      status: form.status,
    }
    const { error } = editando
      ? await supabase.from('polos').update(payload).eq('id', editando.id)
      : await supabase.from('polos').insert(payload)
    setSalvando(false)
    if (error) {
      if (error.code === '23505') setFormErros({ slug: 'Este link já está em uso por outro polo.' })
      else toast.error('Erro ao salvar o polo.')
      return
    }
    registrarLog({
      acao: editando ? 'editar' : 'criar', entidade: 'polo', entidadeId: editando?.id,
      descricao: `${editando ? 'Editou' : 'Criou'} o polo "${payload.nome}".`,
    })
    toast.success(editando ? 'Polo atualizado.' : 'Polo criado. Agora defina a senha do polo.')
    setDrawerAberto(false)
    carregar()
  }

  const salvarSenha = async () => {
    if (!poloSenha) return
    if (novaSenha.length < 4) {
      setSenhaErro('A senha deve ter pelo menos 4 caracteres.')
      return
    }
    setSalvando(true)
    const { error } = await supabase.rpc('set_polo_password', {
      p_polo_id: poloSenha.id, p_password: novaSenha,
    })
    setSalvando(false)
    if (error) { toast.error('Erro ao definir a senha.'); return }
    registrarLog({
      acao: 'senha', entidade: 'polo', entidadeId: poloSenha.id,
      descricao: `Alterou a senha do polo "${poloSenha.nome}".`,
    })
    toast.success(`Senha do polo "${poloSenha.nome}" atualizada. Sessões antigas foram invalidadas.`)
    setPoloSenha(null)
    setNovaSenha('')
  }

  const inativar = async () => {
    if (!poloInativar) return
    setSalvando(true)
    const novoStatus = poloInativar.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase
      .from('polos').update({ status: novoStatus }).eq('id', poloInativar.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao alterar o status.'); return }
    registrarLog({
      acao: 'status', entidade: 'polo', entidadeId: poloInativar.id,
      descricao: `${novoStatus === 'inativo' ? 'Inativou' : 'Reativou'} o polo "${poloInativar.nome}".`,
    })
    toast.success(novoStatus === 'inativo' ? 'Polo inativado.' : 'Polo reativado.')
    setPoloInativar(null)
    carregar()
  }

  const excluir = async () => {
    if (!poloExcluir) return
    setSalvando(true)
    const { error } = await supabase.from('polos').delete().eq('id', poloExcluir.id)
    setSalvando(false)
    if (error) { toast.error('Erro ao excluir o polo.'); return }
    registrarLog({
      acao: 'excluir', entidade: 'polo', entidadeId: poloExcluir.id,
      descricao: `Excluiu o polo "${poloExcluir.nome}".`,
    })
    toast.success('Polo excluído.')
    setPoloExcluir(null)
    setDrawerAberto(false)
    carregar()
  }

  const copiarLink = async (p: Polo) => {
    await navigator.clipboard.writeText(linkDoPolo(p.slug))
    toast.success('Link do polo copiado. Envie para o professor.')
  }

  const copiarPix = async (p: Polo) => {
    if (!p.pix) return
    try {
      await navigator.clipboard.writeText(p.pix)
      toast.success(`PIX do polo ${p.nome} copiado.`)
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente: ' + p.pix)
    }
  }

  const colunas: Column<Polo>[] = [
    { key: 'nome', header: 'Nome', sortable: true },
    {
      key: 'slug', header: 'Link do professor',
      render: (p) => (
        <button
          className="btn btn-ghost !px-2 !py-1 text-xs"
          onClick={(e) => { e.stopPropagation(); copiarLink(p) }}
        >
          🔗 Copiar link
        </button>
      ),
    },
    { key: 'responsavel', header: 'Responsável', render: (p) => p.responsavel ?? '—' },
    { key: 'contato', header: 'Contato', render: (p) => p.contato ?? '—' },
    {
      key: 'pix', header: 'Pix',
      render: (p) => p.pix ? (
        <button className="btn btn-ghost !px-2 !py-1 text-xs"
                onClick={(e) => { e.stopPropagation(); copiarPix(p) }} aria-label={`Copiar PIX de ${p.nome}`}>
          📋 Copiar PIX
        </button>
      ) : <span className="text-[var(--c-text-soft)]">—</span>,
    },
    {
      key: 'ciclo_atual', header: 'Ciclo atual', sortable: true,
      render: (p) => <span className="badge">Ciclo {p.ciclo_atual}</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (p) => (
        <button
          className="border-0 bg-transparent p-0 cursor-pointer hover:opacity-80"
          title={p.status === 'ativo' ? 'Clique para inativar o polo' : 'Clique para reativar o polo'}
          onClick={(e) => { e.stopPropagation(); setPoloInativar(p) }}
        >
          <StatusBadge status={p.status} />
        </button>
      ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button
          className={`btn !py-1.5 ${visao === 'lista' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setVisao('lista')}
          aria-pressed={visao === 'lista'}
        >
          📋 Lista
        </button>
        <button
          className={`btn !py-1.5 ${visao === 'mapa' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setVisao('mapa')}
          aria-pressed={visao === 'mapa'}
        >
          🗺️ Mapa
        </button>
        {visao === 'mapa' && (
          <button className="btn btn-primary ml-auto" onClick={abrirNovo}>+ Novo polo</button>
        )}
      </div>

      {visao === 'mapa' ? (
        loading ? (
          <div className="card"><div className="skeleton h-[540px] !rounded-xl" /></div>
        ) : (
          <PoloMap polos={polos} />
        )
      ) : (
      <DataTable
        columns={colunas}
        rows={polos}
        loading={loading}
        error={erro}
        onRetry={carregar}
        onRowClick={(p) => abrirEdicao(p)}
        searchValue={(p) => `${p.nome} ${p.slug} ${p.responsavel ?? ''}`}
        searchPlaceholder="Buscar polo…"
        toolbar={<button className="btn btn-primary" onClick={abrirNovo}>+ Novo polo</button>}
        empty={{
          icon: '📍', title: 'Nenhum polo cadastrado',
          message: 'Crie o primeiro polo para gerar o link de acesso do professor.',
          action: <button className="btn btn-primary" onClick={abrirNovo}>Criar polo</button>,
        }}
      />
      )}

      {/* Drawer criar/editar */}
      <Drawer
        open={drawerAberto}
        title={editando ? `Editar polo — ${editando.nome}` : 'Novo polo'}
        onClose={() => setDrawerAberto(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDrawerAberto(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nome do polo" required error={formErros.nome}>
            <input value={form.nome} aria-invalid={!!formErros.nome}
                   onChange={(e) => mudarNome(e.target.value)} />
          </Field>
          {form.slug && (
            <p className="rounded-lg bg-[var(--c-blue-bg)] p-3 text-xs text-[var(--c-blue-fg)]">
              Link do professor: <strong>{linkDoPolo(form.slug)}</strong>
              <br />Gerado automaticamente a partir do nome — trocar a senha
              não muda o link, e ele não muda mais depois de criado.
            </p>
          )}
          {editando && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--c-border)] p-3">
              <button className="btn btn-ghost !py-1.5 text-sm" onClick={() => setPoloSenha(editando)}>
                🔑 Alterar senha
              </button>
              <Link to={`/admin/alunos?polo=${editando.id}`} className="btn btn-ghost !py-1.5 text-sm">
                🎓 Ver alunos
              </Link>
              <Link to={`/admin/historico?polo=${editando.id}`} className="btn btn-ghost !py-1.5 text-sm">
                🕘 Ver histórico
              </Link>
              <button className="btn btn-ghost !py-1.5 text-sm text-[var(--c-danger)]"
                      onClick={() => setPoloExcluir(editando)}>
                🗑️ Excluir polo
              </button>
            </div>
          )}
          <div className="rounded-lg border border-[var(--c-border)] p-3">
            <p className="mb-3 text-sm font-semibold">📍 Endereço</p>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="CEP">
                  <input value={form.cep} placeholder="00000-000"
                         onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))} />
                </Field>
                <Field label="Número">
                  <input value={form.numero} placeholder="Ex.: 205 ou s/n"
                         onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} />
                </Field>
              </div>
              <Field label="Logradouro (rua / avenida)">
                <input value={form.logradouro} placeholder="Ex.: Av. Brasil"
                       onChange={(e) => setForm((f) => ({ ...f, logradouro: e.target.value }))} />
              </Field>
              <Field label="Complemento">
                <input value={form.complemento} placeholder="Sala, bloco, referência…"
                       onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))} />
              </Field>
              <Field label="Bairro">
                <input value={form.bairro}
                       onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Field label="Cidade">
                  <input value={form.cidade}
                         onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))} />
                </Field>
                <Field label="UF">
                  <select value={form.estado} className="!w-20"
                          onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}>
                    <option value="">—</option>
                    {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--c-border)] p-3">
            <p className="mb-2 text-sm font-semibold">🗺️ Localização no mapa</p>
            <p className="mb-3 text-xs text-[var(--c-text-soft)]">
              Preenchendo Logradouro, Cidade e UF acima, o sistema localiza as
              coordenadas automaticamente. Se preferir, edite manualmente abaixo.
            </p>
            {statusLocalizacao === 'buscando' && (
              <p className="mb-3 text-xs font-semibold text-[var(--c-blue-fg)]">
                🔎 Localizando endereço no mapa…
              </p>
            )}
            {statusLocalizacao === 'encontrado' && (
              <p className="mb-3 text-xs font-semibold text-[var(--c-green-fg)]">
                ✓ Localização encontrada automaticamente.
              </p>
            )}
            {statusLocalizacao === 'nao-encontrado' && (
              <p className="mb-3 text-xs font-semibold text-[var(--c-amber-fg)]">
                ⚠️ Endereço não encontrado no mapa. Preencha as coordenadas manualmente
                abaixo (ex.: copiando do Google Maps).
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <input value={form.latitude} placeholder="-23.5505"
                       aria-invalid={!!formErros.coords}
                       onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} />
              </Field>
              <Field label="Longitude">
                <input value={form.longitude} placeholder="-46.6333"
                       aria-invalid={!!formErros.coords}
                       onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} />
              </Field>
            </div>
            {formErros.coords && <p className="field-error mt-2">{formErros.coords}</p>}
          </div>
          <Field label="Responsável pelo polo">
            <input value={form.responsavel}
                   onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} />
          </Field>
          <Field label="Contato (telefone / WhatsApp)">
            <input value={form.contato}
                   onChange={(e) => setForm((f) => ({ ...f, contato: e.target.value }))} />
          </Field>
          <Field label="PIX do polo">
            <input value={form.pix}
                   onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))} />
          </Field>
          <Field label="Observações">
            <textarea rows={3} value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
          </Field>
          <Field label="Status">
            <select value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ativo' | 'inativo' }))}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </Field>
          {editando && (
            <p className="text-xs text-[var(--c-text-soft)]">
              Ciclo atual: <strong>{editando.ciclo_atual}</strong> — avança
              automaticamente quando as 18 aulas do ciclo têm foto.
            </p>
          )}
        </div>
      </Drawer>

      {/* Modal de senha */}
      <Modal
        open={!!poloSenha}
        title={`Senha do polo — ${poloSenha?.nome ?? ''}`}
        onClose={() => { setPoloSenha(null); setNovaSenha(''); setSenhaErro('') }}
        footer={
          <>
            <button className="btn btn-ghost"
                    onClick={() => { setPoloSenha(null); setNovaSenha(''); setSenhaErro('') }}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={salvarSenha} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Definir senha'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--c-text-soft)]">
            Esta é a senha que o professor digita ao abrir o link do polo.
            Ao trocá-la, todos os acessos antigos são invalidados imediatamente.
          </p>
          <Field label="Nova senha" required error={senhaErro || undefined}>
            <input type="text" value={novaSenha} aria-invalid={!!senhaErro}
                   placeholder="Ex.: antares2026"
                   onChange={(e) => { setNovaSenha(e.target.value); setSenhaErro('') }} />
          </Field>
        </div>
      </Modal>

      {/* Confirmação inativar/reativar */}
      <ConfirmModal
        open={!!poloInativar}
        title={poloInativar?.status === 'ativo' ? 'Inativar polo' : 'Reativar polo'}
        message={
          poloInativar?.status === 'ativo' ? (
            <>Inativar o polo <strong>{poloInativar?.nome}</strong>? O link do professor
            deixará de funcionar até o polo ser reativado.</>
          ) : (
            <>Reativar o polo <strong>{poloInativar?.nome}</strong>?</>
          )
        }
        confirmLabel={poloInativar?.status === 'ativo' ? 'Inativar' : 'Reativar'}
        danger={poloInativar?.status === 'ativo'}
        loading={salvando}
        onConfirm={inativar}
        onClose={() => setPoloInativar(null)}
      />

      {/* Confirmação de exclusão definitiva */}
      <ConfirmModal
        open={!!poloExcluir}
        title="Excluir polo"
        message={<>Excluir definitivamente o polo <strong>{poloExcluir?.nome}</strong>?
          O cronograma e o histórico de aulas deste polo serão apagados, e os alunos
          ficarão sem polo. Esta ação não pode ser desfeita. Para apenas desativar o
          acesso, use “Inativar”.</>}
        confirmLabel="Excluir"
        loading={salvando}
        onConfirm={excluir}
        onClose={() => setPoloExcluir(null)}
      />
    </>
  )
}
