import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Field } from '../../components/ui'
import { useToast } from '../../components/Toast'
import { registrarLog } from '../../lib/logs'

// Chave da configuração: WhatsApp do responsável do colégio Antares.
// É este número que recebe as consultas de responsáveis feitas pelos
// professores na chamada — o contato cadastrado em cada polo é só informativo.
const CHAVE_CONTATO = 'contato_antares'

export default function Configuracoes() {
  const [contato, setContato] = useState('')
  const [existe, setExiste] = useState(false)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const toast = useToast()

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('configuracoes').select('chave, valor').eq('chave', CHAVE_CONTATO).limit(1)
    const row = (data ?? [])[0] as { valor: string | null } | undefined
    setExiste(!!row)
    setContato(row?.valor ?? '')
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const salvar = async () => {
    setSalvando(true)
    const valor = contato.trim() || null
    const { error } = existe
      ? await supabase.from('configuracoes').update({ valor }).eq('chave', CHAVE_CONTATO)
      : await supabase.from('configuracoes').insert({ chave: CHAVE_CONTATO, valor })
    setSalvando(false)
    if (error) { toast.error('Erro ao salvar as configurações.'); return }
    setExiste(true)
    registrarLog({
      acao: 'editar', entidade: 'configuracao', entidadeId: CHAVE_CONTATO,
      descricao: valor
        ? `Definiu o WhatsApp do responsável do colégio como "${valor}".`
        : 'Removeu o WhatsApp do responsável do colégio.',
    })
    toast.success('Configurações salvas.')
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
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
        {loading ? (
          <div className="flex flex-col gap-2">
            <div className="skeleton w-1/2" />
            <div className="skeleton w-full" />
          </div>
        ) : (
          <>
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
            <button className="btn btn-primary self-start" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
