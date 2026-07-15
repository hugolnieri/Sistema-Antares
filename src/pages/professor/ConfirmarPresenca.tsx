import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useTemaClaroForcado } from '../../lib/theme'
import { fmtData } from '../../lib/format'
import { Logo } from '../../components/Logo'
import type { InfoConfirmacao } from '../../lib/types'

// Página pública (sem login) que o professor abre pelo link enviado no WhatsApp.
// O token embutido na URL identifica a aula + professor; ele confirma ou recusa
// a presença. A resposta aparece no cronograma do admin e gera notificação.
export default function ConfirmarPresenca() {
  useTemaClaroForcado()
  const { token = '' } = useParams()
  const [info, setInfo] = useState<InfoConfirmacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [invalido, setInvalido] = useState(false)
  const [enviando, setEnviando] = useState<'confirmado' | 'recusado' | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('info_confirmacao', { p_token: token })
    const row = (data as InfoConfirmacao[] | null)?.[0] ?? null
    if (error || !row) setInvalido(true)
    else setInfo(row)
    setCarregando(false)
  }, [token])

  useEffect(() => { carregar() }, [carregar])

  const responder = async (status: 'confirmado' | 'recusado') => {
    setEnviando(status)
    const { data, error } = await supabase.rpc('responder_confirmacao', {
      p_token: token, p_status: status,
    })
    const row = (data as InfoConfirmacao[] | null)?.[0] ?? null
    if (!error && row) setInfo(row)
    setEnviando(null)
  }

  return (
    <div className="gradient-hero flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm !p-8 text-center shadow-xl">
        <div className="mb-6 flex flex-col items-center">
          <Logo size={64} />
          <span className="mt-2 text-xl font-bold">Antares</span>
          <p className="mt-2 text-sm text-[var(--c-text-soft)]">Confirmação de presença</p>
        </div>

        {carregando ? (
          <div className="skeleton mx-auto h-24 w-full !rounded-xl" />
        ) : invalido || !info ? (
          <p className="rounded-lg bg-[var(--c-red-bg)] p-3 text-sm text-[var(--c-red-fg)]">
            Link inválido ou expirado. Confira com o administrativo da Antares.
          </p>
        ) : (
          <>
            <div className="mb-5 rounded-xl border border-[var(--c-border)] p-4">
              <p className="text-lg font-bold">Olá, {info.professor_nome}!</p>
              <p className="mt-2 text-sm text-[var(--c-text-soft)]">Você é responsável por:</p>
              <p className="mt-1 font-semibold">Aula {info.numero_aula} · {info.polo_nome}</p>
              <p className="text-sm text-[var(--c-text-soft)]">{fmtData(info.data)}</p>
            </div>

            {info.status !== 'pendente' && (
              <p className={`mb-4 rounded-lg p-3 text-sm font-semibold ${
                info.status === 'confirmado'
                  ? 'bg-[var(--c-green-bg)] text-[var(--c-green-fg)]'
                  : 'bg-[var(--c-red-bg)] text-[var(--c-red-fg)]'}`}>
                {info.status === 'confirmado'
                  ? '✓ Presença confirmada. Obrigado!'
                  : '✗ Você marcou que não poderá ir.'}
              </p>
            )}

            <p className="mb-3 text-sm text-[var(--c-text-soft)]">
              {info.status === 'pendente'
                ? 'Você poderá comparecer a esta aula?'
                : 'Precisa mudar sua resposta?'}
            </p>
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary btn-lg w-full"
                      disabled={!!enviando}
                      onClick={() => responder('confirmado')}>
                {enviando === 'confirmado' ? 'Enviando…' : '✓ Confirmo presença'}
              </button>
              <button className="btn btn-ghost w-full"
                      disabled={!!enviando}
                      onClick={() => responder('recusado')}>
                {enviando === 'recusado' ? 'Enviando…' : 'Não poderei ir'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
