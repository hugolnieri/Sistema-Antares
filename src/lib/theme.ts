import { useEffect } from 'react'

// Tema claro/escuro — só existe no painel administrativo. O estado vive no
// atributo data-theme do <html> e é persistido em localStorage. O
// index.html aplica antes do render (no-flash), só em rotas /admin.
export type Tema = 'light' | 'dark'
const KEY = 'antares-theme'

export const getTema = (): Tema =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'

export function setTema(tema: Tema) {
  if (tema === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  try { localStorage.setItem(KEY, tema) } catch { /* modo privado */ }
}

export const alternarTema = (): Tema => {
  const proximo: Tema = getTema() === 'dark' ? 'light' : 'dark'
  setTema(proximo)
  return proximo
}

// A área do professor é sempre clara, independente do tema escolhido no
// admin. Só força a exibição atual (remove o atributo do <html>) — não
// mexe no localStorage, então a preferência do admin continua intacta.
export function useTemaClaroForcado() {
  useEffect(() => {
    const anterior = document.documentElement.getAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme')
    return () => {
      if (anterior) document.documentElement.setAttribute('data-theme', anterior)
    }
  }, [])
}
