import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer, Field, Modal, ConfirmModal, StatusBadge } from '../../components/ui'
import { PoloMap } from '../../components/PoloMap'
import { useToast } from '../../components/Toast'
import { gerarSlug, linkDoPolo } from '../../lib/format'
import type { Polo } from '../../lib/types'

const FORM_VAZIO = {
  nome: '', slug: '', endereco: '', responsavel: '',
  contato: '', pix: '', observacoes: '', status: 'ativo' as 'ativo' | 'inativo',
  latitude: '', longitude: '',
}

export default function Polos() {
  const [polos, setPolos] = useState<Polo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [visao, setVisao] = useState<'lista' | 'mapa'>('lista')
  const [buscandoCoords, setBuscandoCoords] = useState(false)
  const toast = useToast()

  // Drawer criar/editar
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<Polo | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [formErros, setFormErros] = useState<Record<string, string>>({})
  const [slugEditado, setSlugEditado] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Modal de senha
  const [poloSenha, setPoloSenha] = useState<Polo | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [senhaErro, setSenhaErro] = useState('')

  // Confirmação de inativação
  const [poloInativar, setPoloInativar] = useState<Polo | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, slug, endereco, responsavel, contato, pix, observacoes, latitude, longitude, token_version, status, created_at')
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
    setSlugEditado(false)
    setDrawerAberto(true)
  }

  const abrirEdicao = (p: Polo) => {
    setEditando(p)
    setForm({
      nome: p.nome, slug: p.slug, endereco: p.endereco ?? '',
      responsavel: p.responsavel ?? '', contato: p.contato ?? '',
      pix: p.pix ?? '', observacoes: p.observacoes ?? '', status: p.status,
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : '',
    })
    setFormErros({})
    setSlugEditado(true)
    setDrawerAberto(true)
  }

  const mudarNome = (nome: string) =>
    setForm((f) => ({ ...f, nome, slug: slugEditado ? f.slug : gerarSlug(nome) }))

  const validar = () => {
    const erros: Record<string, string> = {}
    if (!form.nome.trim()) erros.nome = 'Informe o nome do polo.'
    if (!form.slug.trim()) erros.slug = 'Informe o link (slug) do polo.'
    else if (!/^[a-z0-9-]+$/.test(form.slug)) {
      erros.slug = 'Use apenas letras minúsculas, números e hífens.'
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

  // Busca gratuita de coordenadas pelo endereço (Nominatim/OpenStreetMap)
  const buscarCoords = async () => {
    if (!form.endereco.trim()) {
      toast.error('Preencha o endereço primeiro.')
      return
    }
    setBuscandoCoords(true)
    try {
      const r = await fetch(
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' +
        encodeURIComponent(form.endereco),
      )
      const d = await r.json()
      if (!Array.isArray(d) || !d.length) {
        toast.error('Endereço não encontrado no mapa. Preencha as coordenadas manualmente.')
        return
      }
      setForm((f) => ({ ...f, latitude: d[0].lat, longitude: d[0].lon }))
      setFormErros((e) => ({ ...e, coords: '' }))
      toast.success('Coordenadas preenchidas a partir do endereço.')
    } catch {
      toast.error('Erro ao consultar o mapa. Tente novamente.')
    } finally {
      setBuscandoCoords(false)
    }
  }

  const salvar = async () => {
    if (!validar()) return
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(), slug: form.slug.trim(),
      endereco: form.endereco.trim() || null,
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
    toast.success(novoStatus === 'inativo' ? 'Polo inativado.' : 'Polo reativado.')
    setPoloInativar(null)
    carregar()
  }

  const copiarLink = async (p: Polo) => {
    await navigator.clipboard.writeText(linkDoPolo(p.slug))
    toast.success('Link do polo copiado. Envie para o professor.')
  }

  const colunas: Column<Polo>[] = [
    { key: 'nome', header: 'Nome', sortable: true },
    {
      key: 'slug', header: 'Link do professor',
      render: (p) => (
        <div className="flex items-center gap-2">
          <code className="rounded bg-[var(--c-gray-bg)] px-2 py-0.5 text-xs">/{p.slug}</code>
          <button className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => copiarLink(p)}>
            Copiar link
          </button>
        </div>
      ),
    },
    { key: 'responsavel', header: 'Responsável', render: (p) => p.responsavel ?? '—' },
    { key: 'contato', header: 'Contato', render: (p) => p.contato ?? '—' },
    { key: 'status', header: 'Status', sortable: true, render: (p) => <StatusBadge status={p.status} /> },
    {
      key: 'acoes', header: '',
      render: (p) => (
        <div className="flex justify-end gap-1">
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => abrirEdicao(p)}>
            Editar
          </button>
          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => setPoloSenha(p)}>
            Senha
          </button>
          <Link to={`/admin/alunos?polo=${p.id}`} className="btn btn-ghost !px-2 !py-1 text-xs">
            Alunos
          </Link>
          <Link to={`/admin/historico?polo=${p.id}`} className="btn btn-ghost !px-2 !py-1 text-xs">
            Histórico
          </Link>
          <button className="btn btn-ghost !px-2 !py-1 text-xs text-[var(--c-danger)]"
                  onClick={() => setPoloInativar(p)}>
            {p.status === 'ativo' ? 'Inativar' : 'Reativar'}
          </button>
        </div>
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
          <Field label="Link (slug)" required error={formErros.slug}>
            <input value={form.slug} aria-invalid={!!formErros.slug}
                   onChange={(e) => { setSlugEditado(true); setForm((f) => ({ ...f, slug: e.target.value })) }} />
          </Field>
          {form.slug && (
            <p className="rounded-lg bg-[var(--c-blue-bg)] p-3 text-xs text-[var(--c-blue-fg)]">
              Link do professor: <strong>{linkDoPolo(form.slug)}</strong>
              <br />O link é estável — trocar a senha não muda o link.
            </p>
          )}
          <Field label="Endereço / local de atendimento">
            <input value={form.endereco}
                   onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))} />
          </Field>

          <div className="rounded-lg border border-[var(--c-border)] p-3">
            <p className="mb-2 text-sm font-semibold">📍 Localização no mapa</p>
            <button className="btn btn-ghost mb-3 w-full !py-2 text-sm"
                    onClick={buscarCoords} disabled={buscandoCoords}>
              {buscandoCoords ? 'Buscando…' : '🔎 Buscar coordenadas pelo endereço'}
            </button>
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
    </>
  )
}
