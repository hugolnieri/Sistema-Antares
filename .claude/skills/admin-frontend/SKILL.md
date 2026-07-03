---
name: admin-frontend
description: Use sempre que o usuário pedir para criar ou ajustar telas de admin, dashboards, painéis internos, tabelas de dados, formulários de cadastro, ou sistemas de gestão (PDV, CRM, ERP simplificado) para aplicações web. Guia a construção de interfaces administrativas de forma stack-agnóstica (React, Vue, HTML/CSS puro, etc.), cobrindo layout, componentes recorrentes, padrões de dados/estados, anti-padrões e checklist de entrega.
---

# Admin Frontend

Guia prescritivo para construir interfaces de sistemas administrativos web:
dashboards, painéis internos, PDVs, CRMs e ERPs simplificados. As regras são
**stack-agnósticas** — valem para React, Vue, Svelte ou HTML/CSS puro. Adapte a
sintaxe dos exemplos à stack do projeto; os princípios não mudam.

Regra de ouro: **componentize o que se repete, padronize o que representa dado.**
Duas telas admin nunca devem divergir em espaçamento, cor de status ou layout de
tabela.

---

## 1. Estrutura de Layout

### Shell da aplicação

Todo sistema admin tem uma casca (shell) persistente que **não** é reconstruída
por tela. Estrutura mínima:

```
┌──────────────────────────────────────────┐
│ Topbar (busca, notificações, usuário)    │
├──────────┬───────────────────────────────┤
│          │ Breadcrumbs                    │
│ Sidebar  │ ─────────────────────────────  │
│ (nav)    │                                │
│          │   Área de conteúdo (outlet)    │
│          │                                │
└──────────┴───────────────────────────────┘
```

- **Sidebar fixa** (padrão): visível ≥1024px, largura ~240–280px. Use quando a
  navegação é o eixo principal do produto.
- **Sidebar colapsável**: reduz para ~64px (só ícones) via toggle. Use quando o
  conteúdo precisa de largura (tabelas amplas, editores). Em telas <768px, vira
  drawer sobreposto (off-canvas) com backdrop.
- **Topbar**: altura fixa (~56–64px), sempre visível (sticky). Contém busca
  global, seletor de contexto (empresa/loja), notificações e menu do usuário.
- **Breadcrumbs**: primeira linha da área de conteúdo. Reflete a hierarquia real
  (`Início / Vendas / Pedido #1234`). Cada nível anterior é clicável.

O shell é **um componente montado uma vez**; a área de conteúdo é o único ponto
que troca por rota.

```html
<div class="app-shell">
  <aside class="sidebar"><!-- nav --></aside>
  <div class="app-main">
    <header class="topbar"><!-- busca, usuário --></header>
    <nav class="breadcrumbs"><!-- trilha --></nav>
    <main class="content"><!-- outlet da rota --></main>
  </div>
</div>
```

### Grid de dashboard e cards de métricas

- Use CSS Grid responsivo com `auto-fit` — nunca larguras fixas por card.
- KPIs no topo (linha de cards), gráficos/tabelas abaixo.

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-6); /* 24px */
}
```

Ordem visual: **KPIs → gráfico principal → tabelas/listas de apoio.** O que o
gestor olha primeiro fica em cima e à esquerda.

### Espaçamento em tokens

Nunca use valores mágicos de padding/margin. Defina uma escala e use só ela:

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
}
```

Regras práticas:
- Padding interno de card/campo: `--space-4` (16px).
- Gap entre cards/seções: `--space-6` (24px).
- Espaço vertical entre blocos maiores: `--space-8` (32px).
- Gap entre label e input, ou ícone e texto: `--space-2` (8px).

Aplique os mesmos tokens a border-radius (`4/8/12px`) e tipografia. Consistência
> criatividade em admin.

---

## 2. Componentes Recorrentes

### Tabela de dados

O componente mais importante de um admin. Uma tabela completa tem:

- **Cabeçalho de ações**: busca (à esquerda), filtros e botão primário
  "Novo" (à direita).
- **Colunas ordenáveis**: clique no header alterna asc/desc, com indicador (▲/▼).
- **Filtros**: chips ou dropdowns acima da tabela; filtros aplicados ficam
  visíveis e removíveis.
- **Ações em linha**: à direita de cada row (editar, excluir, ver). Em telas
  densas, agrupe num menu "⋯".
- **Paginação**: sempre. Rodapé com "1–20 de 342" + controles de página e
  seletor de itens por página.
- **Seleção múltipla** (quando há ações em lote): checkbox na primeira coluna +
  barra de ações em lote que aparece ao selecionar.

Estados obrigatórios — trate os três, nunca só o "feliz":

| Estado    | O que mostrar                                                    |
|-----------|-----------------------------------------------------------------|
| Loading   | Skeleton rows (não spinner solto no meio da tela)               |
| Vazio     | Empty state com ilustração/ícone + CTA ("Cadastrar primeiro X") |
| Erro      | Mensagem clara + botão "Tentar novamente"                       |

```html
<div class="table-toolbar">
  <input type="search" placeholder="Buscar cliente..." />
  <div class="table-actions">
    <button class="btn-ghost">Filtros</button>
    <button class="btn-primary">Novo cliente</button>
  </div>
</div>

<table class="data-table">
  <thead>
    <tr>
      <th aria-sort="ascending">Nome ▲</th>
      <th>Status</th>
      <th class="col-actions"></th>
    </tr>
  </thead>
  <tbody><!-- rows, ou skeleton, ou empty-state --></tbody>
</table>

<footer class="table-pagination">
  <span>1–20 de 342</span>
  <div class="pager"><!-- ‹ 1 2 3 › --></div>
</footer>
```

### Formulários

- **Layout**: 1 coluna para fluxos lineares (cadastro rápido); 2 colunas para
  formulários densos em telas largas. Agrupe campos relacionados em seções com
  título.
- **Label sempre acima do campo** (não placeholder-como-label). Placeholder é
  exemplo, não rótulo.
- **Validação inline**: valide no `blur` do campo, não só no submit. Erro aparece
  **abaixo** do campo, em vermelho, com texto acionável ("E-mail inválido", não
  "Erro").
- **Estado do botão de submit**: desabilitado enquanto inválido ou enquanto
  salva (com spinner + "Salvando...").
- **Multi-step** (wizard): use quando há >8–10 campos ou etapas lógicas
  (dados → endereço → pagamento). Mostre stepper com progresso, permita voltar,
  valide por etapa antes de avançar.

```html
<div class="field">
  <label for="email">E-mail</label>
  <input id="email" type="email" aria-invalid="true"
         aria-describedby="email-err" />
  <p id="email-err" class="field-error">E-mail inválido.</p>
</div>
```

### Modais e drawers

Para criar/editar sem sair da lista:

- **Modal (centro)**: ações curtas e focadas (confirmar exclusão, editar 2–4
  campos). Sempre com backdrop, foco preso dentro (focus trap), fecha no `Esc`.
- **Drawer (lateral)**: formulários maiores de criar/editar; mantém contexto da
  lista atrás. Desliza da direita, largura ~420–560px.
- **Confirmação destrutiva**: exclusões sempre passam por modal de confirmação
  com o nome do registro ("Excluir cliente **Maria Silva**?") e botão de
  perigo.

### Notificações (toast) e badges

- **Toast**: feedback de ação (salvou, excluiu, erro). Canto (top-right ou
  bottom-right), auto-dismiss em ~4s, com cor por tipo (sucesso/erro/info/aviso).
  Nunca use `alert()`.
- **Badge de status**: pill pequena com cor + texto (ver seção 3).

### Navegação lateral

- Grupos colapsáveis por domínio ("Vendas", "Cadastros", "Relatórios").
- **Indicador de página ativa** claro: fundo destacado + barra/borda lateral +
  ícone preenchido. O usuário deve saber onde está em <1s.
- Ícone + label (não só ícone, exceto no modo colapsado — aí use tooltip).

```html
<nav class="sidebar-nav">
  <div class="nav-group">
    <button class="nav-group-header">Vendas ▾</button>
    <a class="nav-item is-active" href="/pdv">🛒 PDV</a>
    <a class="nav-item" href="/pedidos">📦 Pedidos</a>
  </div>
</nav>
```

---

## 3. Padrões de Dados e Estados

### Status consistente (cor + ícone + texto)

Defina o mapa de status **uma vez** e reutilize em toda tabela, badge e detalhe.
Nunca use só cor (acessibilidade) nem cores diferentes para o mesmo status em
telas diferentes.

```js
const STATUS = {
  ativo:     { label: 'Ativo',     color: 'green',  icon: '●' },
  pendente:  { label: 'Pendente',  color: 'amber',  icon: '◐' },
  cancelado: { label: 'Cancelado', color: 'red',    icon: '✕' },
  rascunho:  { label: 'Rascunho',  color: 'gray',   icon: '○' },
};
```

```html
<span class="badge badge--green"><span aria-hidden="true">●</span> Ativo</span>
```

Padrão de cores (mantenha em todo o sistema):
- Verde → sucesso / ativo / pago
- Âmbar → pendente / atenção / aguardando
- Vermelho → erro / cancelado / vencido
- Cinza → inativo / rascunho / neutro
- Azul → informativo / em processamento

### Cards de KPI

Anatomia: **número grande** + label + variação % (com seta/cor) + mini gráfico
(sparkline) opcional.

```html
<div class="kpi-card">
  <span class="kpi-label">Faturamento (mês)</span>
  <strong class="kpi-value">R$ 128.400</strong>
  <span class="kpi-delta kpi-delta--up">▲ 12,4% vs. mês anterior</span>
  <svg class="kpi-sparkline"><!-- linha --></svg>
</div>
```

- Variação positiva em verde, negativa em vermelho — mas **sempre com seta**, não
  só cor. Contextualize ("vs. mês anterior").
- Número grande e escaneável; label discreto acima.

### Empty states

Todo lugar que pode estar vazio precisa de um empty state desenhado, não uma tela
em branco. Contém: ícone/ilustração + título curto + frase de apoio + CTA.

```html
<div class="empty-state">
  <div class="empty-icon">📭</div>
  <h3>Nenhum pedido ainda</h3>
  <p>Os pedidos aparecerão aqui assim que forem criados.</p>
  <button class="btn-primary">Criar pedido</button>
</div>
```

Diferencie "vazio porque é novo" (com CTA) de "vazio porque o filtro não achou
nada" (com "Limpar filtros").

---

## 4. Anti-padrões a Evitar

- ❌ **Tabela sem paginação** despejando centenas de linhas → trava o navegador e
  o usuário. Sempre pagine (ou virtualize) acima de ~50 linhas.
- ❌ **Formulário sem feedback de erro** ou com "Erro ao salvar" genérico → diga o
  que fazer e em qual campo. Valide inline, não só no submit.
- ❌ **Cores de status inconsistentes** entre telas (pendente ora amarelo, ora
  laranja) → centralize o mapa de status e importe em todo lugar.
- ❌ **Sidebar/topbar recriadas por tela** → o shell é montado uma vez; só o
  conteúdo troca. Duplicar navegação gera divergência e bugs de estado ativo.
- ❌ **Placeholder como label** → some ao digitar e quebra acessibilidade. Label
  sempre visível acima.
- ❌ **Spinner solto no meio da tela** para carregar tabela → use skeleton que
  preserva o layout.
- ❌ **Espaçamento e cores ad-hoc** por tela → use tokens (seção 1).
- ❌ **Ação destrutiva sem confirmação** → excluir sempre confirma, com nome do
  registro.

---

## 5. Checklist Rápido (antes de entregar qualquer tela admin)

- [ ] Usa o shell componentizado (sidebar/topbar/breadcrumbs), não reconstruído.
- [ ] Página ativa indicada na navegação lateral.
- [ ] Espaçamentos e cores vêm de tokens, não de valores mágicos.
- [ ] Toda tabela tem: busca, ordenação, filtros, paginação e ações em linha.
- [ ] Estados **loading / vazio / erro** tratados (não só o caso feliz).
- [ ] Formulários com label acima, validação inline e botão que reflete o estado.
- [ ] Ações destrutivas confirmam antes de executar.
- [ ] Status representado por **cor + ícone + texto**, consistente com o resto do
      sistema.
- [ ] Feedback de ação via toast (nunca `alert`).
- [ ] Responsivo: sidebar colapsa/vira drawer e grids se reorganizam em telas
      pequenas.
- [ ] Empty states desenhados com CTA claro.
