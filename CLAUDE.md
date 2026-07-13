# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server (http://localhost:5173)
npm run build            # TypeScript check + Vite build → dist/
npm run preview          # Preview production build locally
supabase login           # Authenticate with Supabase CLI
supabase link --project-ref PROJECT_REF  # Link to Supabase project
supabase functions deploy polo           # Deploy Edge Function
supabase secrets set POLO_TOKEN_SECRET=... # Set HMAC secret for professor tokens
```

## High-Level Architecture

### Dual Mode: Demo + Real Supabase

The app runs in **two modes**, selected at startup by checking `.env`:

- **Demo Mode** (`MOCK=true`): All data lives in localStorage (`antares-mock-db` key). Parallel mock implementations in `src/mock/` mirror the real API exactly, so switching to real Supabase requires **zero UI changes**. Reset demo data via `antaresResetDemo()` in browser console.
- **Real Mode**: Uses Supabase (Postgres, Auth, Edge Functions, Storage). Flip by populating `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.

This is why `src/mock/` exists: it's not scaffolding to be deleted—it's a permanent **1:1 parallel implementation** of the professor API, used for offline development and CI testing.

### Two User Areas

**Admin (`/admin`):**
- Email + password login via Supabase Auth.
- Full CRUDs: polos, professors, students, guardians, materials (PDFs for each of 18 class numbers), attendance history.
- Cronograma: manual scheduling of classes (no restrictions—allows planning the next cycle's classes in advance).
- Historico: searchable, filterable log of all completed classes across all polos, with attendance counts and photos.

**Professor (`/professor/polo/:slug`):**
- No signup. Receives polo link + password from admin.
- Session: password validated server-side (Edge Function) only; browser gets a 12h HMAC-signed token embedding `poloId` and `token_version` (password change = immediate session kill).
- Chamada (attendance): select class 1–18 → mark presence for students → attach photos → save.
- The professor's entire workflow is **server-side validated** via one Edge Function (`supabase/functions/polo/index.ts`).

### Ciclos (Cycles) — Key Recent Architecture

Each polo has a cycle counter (`polos.ciclo_atual`). When **all 18 classes** in the current cycle have **photos attached**, the cycle auto-advances, and classes 1–18 become available again for the next cohort.

**Critical invariant:** A class is considered "completed" (locked in the selector) **only when it has photos**. This allows the professor to:
1. Save attendance (photo optional) → class becomes "pending photos"
2. Close the browser
3. Reopen the link later → same class is still selectable to attach photos
4. Once photos arrive → class is locked

This is why `src/lib/types.ts` has `DadosPolo.chamadas: ChamadaExistente[]` (with `temFotos` boolean), not a simple list of "completed class numbers."

The cycle is incremented in:
- Edge Function: `supabase/functions/polo/index.ts`, in helper `avancarCicloSeCompleto()`
- Mock: `src/mock/mockPoloApi.ts`, in same-named helper

Both check: "Do all 18 classes in this polo + cycle have at least one photo?" If yes, increment `ciclo_atual`.

### Professor Flow — Current (Post-Ciclo Refactor)

`src/pages/professor/Chamada.tsx` is **progressive disclosure**:

1. **Select class first** → rest of form is hidden. Only the class dropdown and cycle counter visible.
2. **Choose class** → if never done, form appears (date, professor names, student list).
   - If class is already "pending photos" (saved but no photo yet), skip straight to "attach photos" mode.
3. **Mark presence** → single toggle button per student ("Confirmar presença"). Unmarked = absent.
4. **Save** (no photo required) → class becomes "pending photos", screen stays same, shifts to "attach photos" UI.
5. **Attach photos + send** → class is locked. Professor can do step 5 immediately or close and return later.

Removal of "Ausente" button: the payload already sends `presente: presencas[a.id] ?? false`, so "not marked" = absent. Single button is a UI simplification.

### Edge Function (`supabase/functions/polo/index.ts`)

Entry point for the professor area. Handles:
- `action: "info"` — public polo name (for the login screen)
- `action: "login"` — validate password, return token + polo name
- `action: "dados"` — fetch alunos, materiais, and current-cycle's chamadas (with `temFotos` flags)
- `action: "chamada"` (multipart form) — save attendance + photos. Checks for duplicate (class already saved in this cycle). Increments cycle if all 18 are done.
- `action: "adicionarFotos"` (multipart form) — attach photos to existing chamada. May trigger cycle advance if this completes the 18th class.
- `action: "solicitarContato"` — professor requests student contact (creates pending request for admin)

**Security:** Password never reaches the browser. Token is HMAC-signed with `POLO_TOKEN_SECRET` and embeds `poloId` + `token_version`. Changing a polo's password increments `token_version`, invalidating old tokens instantly.

**Photos:** Multipart form, validated for image type and size (5 MB each, max 10 per chamada). Stored in Supabase Storage (`fotos-aulas` bucket) with signed URLs. Bucket is private; all access goes through the function.

### Mock Implementation (`src/mock/`)

`src/mock/mockClient.ts` creates a fake Supabase client that routes calls to `src/mock/mockPoloApi.ts`.

`src/mock/db.ts` is the in-memory DB:
- Seeded with example polos (Jardim Santa Maria, Centro, Vila Nova, Parque das Flores), students, professors, materials, and a few chamadas.
- Persisted to localStorage under key `antares-mock-db`.
- Has a **migration block** in `loadDB()` that adds missing fields to existing records (e.g., if an old record lacks `ciclo`, it defaults to 1).

**Why parallel mock?** Allows:
- Offline development (no Supabase CLI login needed, no network latency)
- Full-stack testing without provisioning a real project
- Exact behavior parity — the mock is the source of truth for the professor API contract

If a bug is fixed in the Edge Function, the mock must be updated identically. If a UI change works in the mock, it will work in prod.

### Tipo-Related Conventions

- `src/lib/types.ts`: All shared types (Polo, Aluno, HistoricoAula, DadosPolo, ChamadaExistente, etc.)
- `DadosPolo` is the main response from the professor area. It includes `chamadas` (not just class numbers, but `{ numeroAula, historicoId, temFotos }`).
- New types for the professor area go into `types.ts`, not scattered in pages.

### Admin Pages & Data Tables

- `src/components/DataTable.tsx`: Reusable table with sorting, searching, and filtering. Used across admin pages.
- `src/pages/admin/Polos.tsx`: Table + Drawer for creating/editing. Polo has a `ciclo_atual` field (editable by admin for manual cycle corrections) and a "Ciclo atual" badge column.
- `src/pages/admin/Historico.tsx`: Filters by polo, class, date, student, photo presence. Shows "Aula N · Ciclo M" to disambiguate repeated class numbers across cycles.
- `src/pages/admin/HistoricoDetalhe.tsx`: Details of one chamada. Also shows "Aula N · Ciclo M".
- `src/pages/admin/Alunos.tsx`: Student history table. Shows "Aula N · Ciclo M" alongside attendance status.

### Routing & Layout

- `src/App.tsx`: React Router setup. Admin routes require `RequireAuth` (checks Supabase session). Professor routes are stateless (just the polo `:slug` in the URL).
- `src/pages/professor/PoloLayout.tsx`: Wraps professor sub-routes. Holds the professor's session, fetches `dados` once on mount, and re-provides it to all child pages via `useOutletContext`.
- `src/pages/professor/Chamada.tsx`: The main professor flow (as described above).
- `src/pages/professor/PoloLogin.tsx`: Login screen for professor.
- `src/pages/professor/MateriaisProfessor.tsx`: Read-only list of 18 class materials (PDFs) for the current polo.

### Styling

- **Tailwind CSS v4** with `@tailwindcss/vite`.
- Color system: CSS custom properties (e.g., `var(--c-primary)`, `var(--c-green-fg)`, `var(--c-danger)`) defined in `src/index.css`. Supports light and dark themes.
- Badge, button, and form component classes defined in `src/index.css` (`.btn`, `.badge`, `.field-error`, etc.).
- `src/components/ui.tsx`: Reusable UI primitives (Field, EmptyState, Modal, Drawer, StatusBadge).

### Testing & Build

- `npm run build`: Runs TypeScript check (`tsc -b`) before Vite build. Stops if there are type errors.
- **No Jest/test runner configured.** E2E tests are manual (Playwright-based, see `tmp-test-*.mjs` scripts in prior work, but these are ad-hoc development aids, not part of the test suite).
- Browser console: `antaresResetDemo()` resets localStorage for demo data.

### .env Configuration

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

If both are missing or contain `SEU-PROJETO`, the app enters demo mode automatically.

### File Structure Highlights

```
supabase/
  schema.sql                      # Full schema (tables, RLS, functions, buckets)
  functions/polo/index.ts         # Main Edge Function for professor area

src/
  lib/
    types.ts                      # Shared types
    supabase.ts                   # Demo vs. real client selection
    poloApi.ts                    # Professor area API client
    format.ts                      # Utilities (slugs, formatting, etc.)
  mock/
    db.ts                         # In-memory DB seed + migration logic
    mockClient.ts                 # Fake Supabase client
    mockPoloApi.ts                # Mock professor API implementation
  components/
    ui.tsx                        # Form, Modal, DataTable, etc.
    AdminShell.tsx                # Admin layout wrapper
    Toast.tsx, Icons.tsx, Logo.tsx
  pages/
    admin/                        # Polos, Alunos, Professores, Cronograma, Historico, Materiais, Login, Dashboard
    professor/                    # Chamada, MateriaisProfessor, PoloLogin, PoloLayout
  index.css                       # Tailwind + custom CSS (colors, components)
  App.tsx                         # Router
  main.tsx                        # React entry
```

## Key Decisions & Rationale

1. **Mock as permanent, parallel implementation:** Not a stub—it's the source of truth for professor API behavior. Keeps the codebase testable offline.
2. **Cycles tied to photos, not class number:** Allows flexible attendance + photo workflow (save now, photos later).
3. **Professor session is server-only validated:** No password in the browser. HMAC token with version-lock ensures password change = immediate logout.
4. **Single presence button:** The payload already encodes "unmarked" as absent, so UI is simplified.
5. **Cronograma unrestricted:** Admin can plan next cycle's classes before current cycle closes.
6. **Unique constraint on (polo_id, ciclo, numero_aula):** Defends against duplicate class registration in the same cycle.

## Recent Commits

- **2026-07-10** — Lembrete de relatorio acima do lembrete opcional + sugestoes de data (0810bbf)
- **2026-07-10** — Adiciona relatorio da aula em Materiais e lembrete de envio no WhatsApp (5335930)
- **2026-07-08** — chore: update recent commits in CLAUDE.md (c9b5c08)
- **2026-07-08** — Unifica status de professor em Ativo/Inativo, remove Disponivel/Ocupado (633a6b8)
- **2026-07-07** — chore: update recent commits in CLAUDE.md (fcad72a)

(Updated automatically by git post-commit hook)


## Contribution Approach

- **New professor feature?** Edit `src/pages/professor/Chamada.tsx` + `src/mock/mockPoloApi.ts` + Edge Function in parallel. Keep both in sync.
- **New admin feature?** Add table / form in `src/pages/admin/`, use `DataTable.tsx` for lists.
- **New type?** Add to `src/lib/types.ts`.
- **Styling?** Use Tailwind classes or add to `src/index.css` if a reusable component emerges.
- **Schema change?** Update `supabase/schema.sql` (must be applied manually to live Supabase), then update types and migrations in mock as needed.

## Recent Changes (Ciclos Refactor)

- Removed `src/pages/professor/Confirmacao.tsx` (navigation no longer leaves Chamada on save).
- Changed `DadosPolo` to return `chamadas: ChamadaExistente[]` (was `aulasConcluidas: number[]`).
- Cycle advances when all 18 classes have photos (implemented in `avancarCicloSeCompleto` helper in both Edge Function and mock).
- Chamada.tsx is now fully progressive-disclosure + modal-less "attach photos" UX.
- Admin can now manually edit `ciclo_atual` in Polos table (for cycle resets / corrections).
