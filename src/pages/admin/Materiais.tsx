import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Drawer, Field, StatusBadge, EmptyState } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { registrarLog } from '../../lib/logs'
import type { Material } from '../../lib/types'

const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20 MB

export default function Materiais() {
  const [materiais, setMateriais] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const toast = useToast()

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [numeroAula, setNumeroAula] = useState(1)
  const [form, setForm] = useState({ titulo: '', descricao: '', relatorio: '', status: 'ativo' as 'ativo' | 'inativo' })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [formErros, setFormErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase
      .from('materiais').select('*').order('numero_aula')
    if (error) setErro('Não foi possível carregar os materiais.')
    else setMateriais((data ?? []) as Material[])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const porAula = new Map(materiais.map((m) => [m.numero_aula, m]))

  const abrirAula = (n: number) => {
    const m = porAula.get(n)
    setNumeroAula(n)
    setForm({
      titulo: m?.titulo ?? `Aula ${n}`,
      descricao: m?.descricao ?? '',
      relatorio: m?.relatorio ?? '',
      status: m?.status ?? 'ativo',
    })
    setArquivo(null)
    setFormErros({})
    if (fileInput.current) fileInput.current.value = ''
    setDrawerAberto(true)
  }

  const escolherArquivo = (f: File | null) => {
    if (!f) { setArquivo(null); return }
    if (f.type !== 'application/pdf') {
      setFormErros((e) => ({ ...e, arquivo: 'Apenas arquivos PDF são aceitos.' }))
      return
    }
    if (f.size > MAX_PDF_BYTES) {
      setFormErros((e) => ({ ...e, arquivo: 'O PDF deve ter no máximo 20 MB.' }))
      return
    }
    setFormErros((e) => ({ ...e, arquivo: '' }))
    setArquivo(f)
  }

  const salvar = async () => {
    const existente = porAula.get(numeroAula)
    const erros: Record<string, string> = {}
    if (!form.titulo.trim()) erros.titulo = 'Informe o título.'
    if (!existente?.arquivo_path && !arquivo) erros.arquivo = 'Anexe o PDF da aula.'
    setFormErros(erros)
    if (Object.values(erros).some(Boolean)) return

    setSalvando(true)
    let arquivoPath = existente?.arquivo_path ?? null

    if (arquivo) {
      const path = `aula-${String(numeroAula).padStart(2, '0')}.pdf`
      const { error: upErr } = await supabase.storage
        .from('materiais')
        .upload(path, arquivo, { contentType: 'application/pdf', upsert: true })
      if (upErr) { setSalvando(false); toast.error('Erro ao enviar o PDF.'); return }
      arquivoPath = path
    }

    const payload = {
      numero_aula: numeroAula,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      relatorio: form.relatorio.trim() || null,
      arquivo_path: arquivoPath,
      status: form.status,
    }
    const { error } = existente
      ? await supabase.from('materiais').update(payload).eq('id', existente.id)
      : await supabase.from('materiais').insert(payload)
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar o material.'); return }
    registrarLog({
      acao: existente ? 'editar' : 'criar', entidade: 'material', entidadeId: existente?.id,
      descricao: `${existente ? 'Editou' : 'Cadastrou'} o material da Aula ${numeroAula} — "${payload.titulo}".`,
    })
    toast.success(`Material da Aula ${numeroAula} salvo.`)
    setDrawerAberto(false)
    carregar()
  }

  const abrirPdf = async (m: Material) => {
    if (!m.arquivo_path) return
    const { data, error } = await supabase.storage
      .from('materiais').createSignedUrl(m.arquivo_path, 3600)
    if (error || !data) { toast.error('Erro ao abrir o PDF.'); return }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <>
      {erro ? (
        <div className="card">
          <EmptyState icon="⚠️" title="Erro ao carregar" message={erro}
                      action={<button className="btn btn-ghost" onClick={carregar}>Tentar novamente</button>} />
        </div>
      ) : (
        <div className="grid gap-4" style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => {
            const m = porAula.get(n)
            return (
              <div key={n} className="card flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--c-text-soft)]">
                    Aula {n}
                  </span>
                  {loading
                    ? <div className="skeleton w-16" />
                    : m
                      ? <StatusBadge status={m.status} />
                      : <span className="badge badge--gray"><span aria-hidden="true">○</span> Sem PDF</span>}
                </div>
                <strong className="min-h-10">
                  {loading ? <div className="skeleton w-3/4" /> : (m?.titulo ?? '—')}
                </strong>
                {m?.descricao && (
                  <p className="text-xs text-[var(--c-text-soft)]">{m.descricao}</p>
                )}
                {!loading && (
                  <span className={`badge !px-1.5 !py-0 text-[11px] ${
                    m?.relatorio ? 'badge--green' : 'badge--gray'}`}>
                    <span aria-hidden="true">{m?.relatorio ? '💬' : '○'}</span>{' '}
                    {m?.relatorio ? 'Relatório pronto' : 'Sem relatório'}
                  </span>
                )}
                <div className="mt-auto flex gap-2 pt-2">
                  {m?.arquivo_path && (
                    <button className="btn btn-ghost !py-1 text-xs" onClick={() => abrirPdf(m)}>
                      Abrir PDF
                    </button>
                  )}
                  <button className="btn btn-primary !py-1 text-xs" onClick={() => abrirAula(n)}
                          disabled={loading}>
                    {m ? 'Editar' : 'Cadastrar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Drawer
        open={drawerAberto}
        title={`Material — Aula ${numeroAula}`}
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
          <Field label="Título" required error={formErros.titulo}>
            <input value={form.titulo} aria-invalid={!!formErros.titulo}
                   onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
          </Field>
          <Field label="Descrição (opcional)">
            <textarea rows={3} value={form.descricao}
                      onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
          </Field>
          <Field label="Relatório da aula (para enviar às famílias)">
            <textarea rows={5} value={form.relatorio}
                      placeholder="Texto padrão que será enviado no grupo das famílias após a aula. Ex.: resumo do que foi trabalhado, recados…"
                      onChange={(e) => setForm((f) => ({ ...f, relatorio: e.target.value }))} />
          </Field>
          <p className="-mt-2 text-xs text-[var(--c-text-soft)]">
            Fica salvo nesta aula e é reaproveitado a cada ciclo. Ao agendar a aula no
            cronograma, marque o lembrete para enviá-lo no WhatsApp.
          </p>
          <Field label="Arquivo PDF" error={formErros.arquivo || undefined}>
            <input ref={fileInput} type="file" accept="application/pdf"
                   aria-invalid={!!formErros.arquivo}
                   onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)} />
          </Field>
          {porAula.get(numeroAula)?.arquivo_path && !arquivo && (
            <p className="text-xs text-[var(--c-text-soft)]">
              Já existe um PDF para esta aula. Envie um novo arquivo para substituí-lo.
            </p>
          )}
          <Field label="Status">
            <select value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ativo' | 'inativo' }))}>
              <option value="ativo">Ativo (visível para o professor)</option>
              <option value="inativo">Inativo (oculto)</option>
            </select>
          </Field>
        </div>
      </Drawer>
    </>
  )
}
