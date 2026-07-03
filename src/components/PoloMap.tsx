// Mapa dos polos (Leaflet + OpenStreetMap — gratuito, sem chave de API).
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Polo } from '../lib/types'

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

// Ícone de localização do polo (marcador de mapa clássico via SVG).
// divIcon evita o problema conhecido dos ícones default do Leaflet no Vite.
const pin = (ativo: boolean) => {
  const cor = ativo ? '#2f4fd8' : '#8b93a7'
  return L.divIcon({
    className: '',
    html: `<svg width="34" height="46" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg"
      style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.4 18.6 0 12 0z" fill="${cor}"/>
      <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.4 18.6 0 12 0z" fill="none" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="#fff"/>
    </svg>`,
    iconSize: [34, 46],
    iconAnchor: [17, 46],
    popupAnchor: [0, -42],
  })
}

export function PoloMap({ polos }: { polos: Polo[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const map = L.map(ref.current).setView([-23.55, -46.63], 11)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    const comCoord = polos.filter((p) => p.latitude != null && p.longitude != null)
    for (const p of comCoord) {
      L.marker([p.latitude!, p.longitude!], { icon: pin(p.status === 'ativo') })
        .addTo(map)
        .bindPopup(
          `<div style="min-width:180px">
            <strong>${esc(p.nome)}</strong><br/>
            ${p.endereco ? `${esc(p.endereco)}<br/>` : ''}
            ${p.responsavel ? `Responsável: ${esc(p.responsavel)}<br/>` : ''}
            ${p.contato ? `${esc(p.contato)}<br/>` : ''}
            <span style="color:${p.status === 'ativo' ? '#147a3d' : '#5c626e'};font-weight:600">
              ${p.status === 'ativo' ? '● Ativo' : '○ Inativo'}
            </span>
          </div>`,
        )
    }
    if (comCoord.length) {
      map.fitBounds(
        L.latLngBounds(comCoord.map((p) => [p.latitude!, p.longitude!] as [number, number])),
        { padding: [48, 48], maxZoom: 14 },
      )
    }
    return () => { map.remove() }
  }, [polos])

  const semCoord = polos.filter((p) => p.latitude == null || p.longitude == null)

  return (
    <div className="flex flex-col gap-3">
      <div ref={ref} className="h-[540px] w-full rounded-xl border border-[var(--c-border)]"
           style={{ zIndex: 0 }} />
      {semCoord.length > 0 && (
        <p className="rounded-lg bg-[var(--c-amber-bg)] p-3 text-xs text-[var(--c-amber-fg)]">
          ⚠️ Sem localização no mapa: <strong>{semCoord.map((p) => p.nome).join(', ')}</strong>.
          Edite o polo e use "Buscar coordenadas pelo endereço".
        </p>
      )}
    </div>
  )
}
