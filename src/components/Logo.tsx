import { useState } from 'react'

// Usa o arquivo real da logo em /public/logo-antares.png quando presente.
// Enquanto o arquivo não é adicionado, mostra um selo circular de fallback.
export function Logo({ size = 40 }: { size?: number }) {
  const [erro, setErro] = useState(false)

  if (!erro) {
    return (
      <img
        src="/logo-antares.png"
        alt="Antares — Centro de Formação de Bombeiros Civis"
        width={size}
        height={size}
        className="logo-img shrink-0 rounded-full object-contain"
        onError={() => setErro(true)}
      />
    )
  }

  // Fallback: selo circular preto (substituído pela logo real quando adicionada)
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-graphite)] font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label="Antares"
      title="Adicione a logo em public/logo-antares.png"
    >
      🚒
    </div>
  )
}

// Cabeçalho de marca: logo + nome da escola
export function BrandHeader({ size = 40, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={size} />
      {!compact && (
        <div className="leading-tight">
          <p className="font-bold tracking-tight">Antares</p>
          <p className="text-[11px] text-[var(--c-text-soft)]">
            Centro de Formação de Bombeiros Civis
          </p>
        </div>
      )}
    </div>
  )
}
