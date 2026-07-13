// Ícones de linha (SVG inline, sem dependências) — estilo Feather.
// Herdam a cor via currentColor e a espessura fixa em 1.75.
import type { ReactNode } from 'react'

const svg = (children: ReactNode, size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"
       strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export type IconName =
  | 'dashboard' | 'polos' | 'professores' | 'alunos' | 'responsaveis'
  | 'cronograma' | 'materiais' | 'historico' | 'logs'
  | 'sino' | 'sair' | 'menu' | 'sol' | 'lua'

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  switch (name) {
    case 'dashboard':
      return svg(<>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>, size)
    case 'polos':
      return svg(<>
        <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" />
        <circle cx="12" cy="11" r="2.2" />
      </>, size)
    case 'professores':
      return svg(<>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </>, size)
    case 'alunos':
      return svg(<>
        <path d="M12 4 2.5 9 12 14l9.5-5L12 4Z" />
        <path d="M6.5 11v4.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V11" />
        <path d="M21.5 9v4.5" />
      </>, size)
    case 'responsaveis':
      return svg(<>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8" />
        <path d="M17 14.2a5.5 5.5 0 0 1 3.5 5" />
      </>, size)
    case 'cronograma':
      return svg(<>
        <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
        <path d="M3.5 9h17M8 3v3M16 3v3" />
        <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
      </>, size)
    case 'materiais':
      return svg(<>
        <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5v-15Z" />
        <path d="M5 18.5A1.5 1.5 0 0 1 6.5 17H19" />
        <path d="M9 7.5h6" />
      </>, size)
    case 'historico':
      return svg(<>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>, size)
    case 'logs':
      return svg(<>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>, size)
    case 'sino':
      return svg(<>
        <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z" />
        <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
      </>, size)
    case 'sair':
      return svg(<>
        <path d="M15 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H15" />
        <path d="M18.5 12H10M16 9l3 3-3 3" />
      </>, size)
    case 'menu':
      return svg(<><path d="M4 7h16M4 12h16M4 17h16" /></>, size)
    case 'sol':
      return svg(<>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </>, size)
    case 'lua':
      return svg(<>
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
      </>, size)
  }
}
