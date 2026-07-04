import { useMemo, useState } from 'react'
import type { StatusColor } from '../lib/status'

export interface CalendarItem {
  id: string
  data: string            // YYYY-MM-DD ou ISO
  titulo: string
  color: StatusColor
  icon: string
  onClick?: () => void
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const CHIP: Record<StatusColor, string> = {
  green: 'bg-[var(--c-green-bg)] text-[var(--c-green-fg)]',
  amber: 'bg-[var(--c-amber-bg)] text-[var(--c-amber-fg)]',
  red: 'bg-[var(--c-red-bg)] text-[var(--c-red-fg)]',
  gray: 'bg-[var(--c-gray-bg)] text-[var(--c-gray-fg)]',
  blue: 'bg-[var(--c-blue-bg)] text-[var(--c-blue-fg)]',
}

// Normaliza a data do item para a chave YYYY-MM-DD no fuso local.
const chaveDia = (iso: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return new Date(iso).toLocaleDateString('en-CA')
}

export function CalendarMonth({ items }: { items: CalendarItem[] }) {
  const [ref, setRef] = useState(() => {
    const d = new Date()
    return { ano: d.getFullYear(), mes: d.getMonth() }
  })

  const porDia = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const it of items) {
      const k = chaveDia(it.data)
      const arr = map.get(k) ?? []
      arr.push(it)
      map.set(k, arr)
    }
    return map
  }, [items])

  const hojeKey = new Date().toLocaleDateString('en-CA')

  // Monta a grade: começa no domingo da semana do dia 1
  const semanas = useMemo(() => {
    const primeiro = new Date(ref.ano, ref.mes, 1)
    const inicio = new Date(primeiro)
    inicio.setDate(1 - primeiro.getDay())
    const dias: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicio)
      d.setDate(inicio.getDate() + i)
      dias.push(d)
    }
    // Corta a última semana se ela for inteiramente do próximo mês
    const usadas = dias.slice(0, dias[35].getMonth() === ref.mes ? 42 : 35)
    const linhas: Date[][] = []
    for (let i = 0; i < usadas.length; i += 7) linhas.push(usadas.slice(i, i + 7))
    return linhas
  }, [ref])

  const irMes = (delta: number) =>
    setRef((r) => {
      const d = new Date(r.ano, r.mes + delta, 1)
      return { ano: d.getFullYear(), mes: d.getMonth() }
    })

  const irHoje = () => {
    const d = new Date()
    setRef({ ano: d.getFullYear(), mes: d.getMonth() })
  }

  return (
    <div className="card !p-0">
      {/* Cabeçalho de navegação */}
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-bold">{MESES[ref.mes]} {ref.ano}</h2>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost !px-3 !py-1" onClick={() => irMes(-1)} aria-label="Mês anterior">‹</button>
          <button className="btn btn-ghost !px-3 !py-1 text-sm" onClick={irHoje}>Hoje</button>
          <button className="btn btn-ghost !px-3 !py-1" onClick={() => irMes(1)} aria-label="Próximo mês">›</button>
        </div>
      </div>

      {/* Cabeçalho dos dias da semana */}
      <div className="grid grid-cols-7 border-t border-[var(--c-border)] text-center text-xs font-semibold uppercase text-[var(--c-text-soft)]">
        {DIAS.map((d) => <div key={d} className="p-2">{d}</div>)}
      </div>

      {/* Grade do mês */}
      <div className="grid grid-cols-7 border-l border-t border-[var(--c-border)]">
        {semanas.flat().map((dia, i) => {
          const k = dia.toLocaleDateString('en-CA')
          const doMes = dia.getMonth() === ref.mes
          const itensDia = porDia.get(k) ?? []
          const ehHoje = k === hojeKey
          return (
            <div key={i}
                 className={`min-h-[92px] border-b border-r border-[var(--c-border)] p-1.5 ${
                   doMes ? '' : 'bg-[#fafbfc]'}`}>
              <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                ehHoje ? 'bg-[var(--c-primary)] font-bold text-white'
                       : doMes ? 'text-[var(--c-text)]' : 'text-[var(--c-text-soft)]'}`}>
                {dia.getDate()}
              </div>
              <div className="flex flex-col gap-1">
                {itensDia.slice(0, 3).map((it) => (
                  <button
                    key={it.id}
                    onClick={it.onClick}
                    title={it.titulo}
                    className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${CHIP[it.color]} ${
                      it.onClick ? 'hover:opacity-80' : 'cursor-default'}`}
                  >
                    <span aria-hidden="true">{it.icon}</span>
                    <span className="truncate">{it.titulo}</span>
                  </button>
                ))}
                {itensDia.length > 3 && (
                  <span className="px-1 text-[11px] text-[var(--c-text-soft)]">
                    +{itensDia.length - 3} mais
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
