# AGENTS.md — Six43: Sound

> This file follows a shared structure across all four Six43 repos. Sections marked **[SHARED]** are consistent across apps. Sections marked **[APP-SPECIFIC]** are unique to this repo.

---

## Project Overview [SHARED]

Six43 is a suite of four baseball apps built for live game use in youth baseball. The apps share a common game state and are designed to work together during a game, but each can also function independently. Each app lives in its own repository.

| App | Repo | Purpose | Status |
|-----|------|---------|--------|
| **Stats** | `six43-stats` | Live stat tracking and scorekeeping | Stable |
| **Sound** | `six43-sound` | Walk-up songs and audio cues tied to game events | Stable |
| **Lineup** | `six43-lineup` | Lineup management, batting order, and substitutions | Stable |
| **Live** | `six43-live` | YouTube Live streaming with real-time stat overlays and viewer reactions | Stable |

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

> **Note:** The block above is managed by Next.js tooling. Don't edit content between the `BEGIN`/`END` markers — it may be regenerated on future installs.

---
 
## Reference files
 
### Foundation (always read first)
`references/DESIGN-SYSTEM.md`
 
### League Info (always read second)
`references/LEAGUEINFO.md`

---

## This App [APP-SPECIFIC]

- Plays walk-up songs when a batter is announced
- Responds to game events (inning changes, home runs, strikeouts) with audio cues
- Audio playback must be bulletproof — no double-fires, no orphaned audio instances
- Web Audio API or Howler.js for reliable playback
- Needs a simple interface for managing song assignments per player
- Audio files stored in Supabase Storage (`walk-up-songs` bucket) — fetch signed URLs for playback
- This app **consumes** game state from Stats — it does not write game data
- Browser autoplay policies will block audio without prior user interaction — always gate on a user tap

---

## Tech Stack [SHARED]

| Layer | Tool | Notes |
|-------|------|-------|
| Framework | Next.js (App Router) | All apps |
| Language | TypeScript | Strict mode enabled |
| Styling | Tailwind CSS | |
| Package manager | npm | |
| Backend | Supabase | Shared instance across all four apps |
| Database | Postgres (via Supabase) | Single source of truth for game state |
| Real-time | Supabase Realtime | Postgres changes broadcast via WebSocket |
| Auth | Supabase Auth | Shared auth across apps |
| Storage | Supabase Storage | Audio files for Sound, team logos, etc. |
| Streaming | YouTube Live API | Used by Live for stream management |
| Hosting | Vercel | |

> **State management:** Using React built-in (`useState`, `useContext`) for local/shared UI state, and Supabase Realtime for cross-app game state. No external state management library currently needed.

---

## Cross-App Architecture [SHARED]

### How the apps relate

The four apps are **separate deployments** that share a single Supabase project. Game state lives in Postgres and syncs across apps in real time via Supabase Realtime.

```
┌──────────────────────────────────┐
│     Supabase (shared instance)   │
│  Postgres · Realtime · Auth ·    │
│  Storage                         │
└──┬──────────┬─────────┬────────┬─┘
   │          │         │        │
┌──▼──┐  ┌───▼───┐  ┌──▼────┐ ┌─▼───┐
│Stats│  │ Sound │  │Lineup │ │Live │
│(w/r)│  │(read) │  │(w/r)  │ │(w/r)│
└─────┘  └───────┘  └───────┘ └─────┘
                                  │
                           ┌──────▼──────┐
                           │ YouTube Live │
                           │     API      │
                           └─────────────┘
```

All four apps connect to the same Supabase project using the same anon key and project URL. Auth sessions are shared — a user logged into one app is authenticated across all four.

### Data ownership

| Data | Owner (writes) | Consumers (read) |
|------|----------------|-------------------|
| Score, inning, count | Stats | Sound, Lineup, Live |
| At-bat outcomes, pitch results | Stats | Sound, Live |
| Batting order, defensive positions | Lineup | Stats, Sound, Live |
| Roster / player profiles | Lineup | Stats, Sound, Live |
| Walk-up song assignments | Sound | — |
| Stream status, overlay config | Live | — |
| Reactions / viewer chat | Live | — |
| League config (innings, rules) | Any app (via `league_config` table) | All |

### Real-time sync via Supabase Realtime

Apps stay in sync during a live game using **Supabase Realtime subscriptions** on Postgres changes. When Stats writes an inning change to the database, Sound and Lineup receive the update instantly via WebSocket.

**Subscription patterns by app:**

| App | Subscribes to | Why |
|-----|---------------|-----|
| Stats | `lineup_entries`, `players` | Needs current batter, defensive positions |
| Sound | `game_state`, `lineup_entries`, `players` | Triggers walk-up songs and audio cues |
| Lineup | `game_state` | Reflects current inning, score, count |
| Live | `game_state`, `lineup_entries`, `players`, `reactions` | Drives overlays and viewer interaction |

**Implementation pattern:**

```typescript
import { createBrowserClient } from '@supabase/ssr'                                       
                                                                                            
  const supabase = createBrowserClient(                                                     
    process.env.NEXT_PUBLIC_SUPABASE_URL!,                                                  
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!                                            
  )              

// Subscribe to game state changes for a specific game
const channel = supabase
  .channel('game-updates')
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'game_state', filter: `id=eq.${gameId}` },
    (payload) => {
      // Handle game state change (inning, score, count, etc.)
    }
  )
  .subscribe()

// Always clean up subscriptions on unmount
return () => { supabase.removeChannel(channel) }
```

**Key rules for Realtime:**

- Always filter subscriptions to the active game ID — don't subscribe to the whole table
- Clean up channels on component unmount or navigation — leaked subscriptions cause stale updates and memory issues
- Use Row Level Security (RLS) to ensure users only see their own team's data
- Realtime requires the table to have `REPLICA IDENTITY FULL` set for UPDATE events to include the full row

### Critical Path: Inning Transitions

Inning changes are the **highest-risk orchestration moment** — all four apps must respond correctly and in sync:

- **Stats** — flips home/away, resets count, updates inning display
- **Sound** — queues inning-change audio, prepares next batter's walk-up song
- **Lineup** — advances batting order position, surfaces defensive substitution prompts
- **Live** — updates scoreboard overlay, transitions inning indicator, may trigger an inning-change graphic

When working on inning transition logic in any app, always consider the downstream effect on the other three. If you're changing what data gets written on an inning change, check the consumers.

---

## Shared Types and Contracts [SHARED]

Since the apps live in separate repos, the **database schema is the shared contract**. Type alignment is maintained by generating TypeScript types from Supabase after each migration (see Supabase Conventions above).

Each app runs `supabase gen types` to produce a `types/database.ts` file. These generated types are the source of truth. App-specific types should extend them, not duplicate them.

### Core domain types (derived from database, kept in each repo)

These are convenience types built on top of the generated Supabase types. Keep them consistent across repos:

```typescript
import type { Database } from './database'

// Row types from generated schema
type GameStateRow = Database['public']['Tables']['game_state']['Row']
type PlayerRow = Database['public']['Tables']['players']['Row']
type LineupEntryRow = Database['public']['Tables']['lineup_entries']['Row']

// App-level convenience types
type HalfInning = 'top' | 'bottom'

type Position =
  | 'P' | 'C' | '1B' | '2B' | '3B' | 'SS'
  | 'LF' | 'CF' | 'RF' | 'DH' | 'EH' | 'BENCH'

// Game events — used for real-time subscription handlers
type GameEvent =
  | { type: 'inning:change'; inning: number; half: HalfInning }
  | { type: 'atbat:start'; batterId: string }
  | { type: 'atbat:end'; result: AtBatResult }
  | { type: 'pitch:recorded'; result: PitchResult }
  | { type: 'substitution:made'; incoming: string; outgoing: string; position: Position }
  | { type: 'score:updated'; home: number; away: number }
  | { type: 'game:start' }
  | { type: 'game:end' }
```

If the generated types from `supabase gen types` differ between repos, something is wrong — one repo has stale types. Regenerate and commit.

---

## Baseball Domain Rules [SHARED]

These come up constantly. Don't assume standard sports logic — baseball has quirks:

- **Batting average** displays as `.333`, not `0.333` — leading zero is always dropped
- **ERA** displays to two decimal places: `3.00`, not `3`
- **Innings** have two halves: Top (away bats) and Bottom (home bats)
- **Batting order** wraps — after the last batter, it cycles back to the first
- **Substitutions** are permanent in standard rules (no re-entry) — but many youth leagues allow re-entry. Build for configurability.
- **Mercy rules / run limits** vary by league and age group — treat as config, not hardcoded
- **Pitch counts** may have per-game and per-week limits in youth baseball — this is a safety concern, surface warnings clearly
- **Game length** varies (4–7 innings depending on age group) — **never hardcode to 9**
- **Extra hitters (EH)** — some youth leagues allow more than 9 batters. Batting order length must be configurable.
- **Continuous batting order** — some leagues bat the entire roster. Support this as a config option.

> **Implementation:** These configurable rules are stored in the `league_config` Supabase 
  table and accessed via `src/lib/league-config.ts`. See `references/LEAGUEINFO.md` for the 
  full type definition.    

---

## Supabase Conventions [SHARED]

All four apps share a single Supabase project. Treat the database schema as a shared contract — changes to tables or columns affect all apps.

### Client setup

Each app initializes its own Supabase client. Use the **browser client** (`createBrowserClient` from `@supabase/ssr`) for client components, and the **server client** for Server Components and Route Handlers.

```typescript
// lib/supabase/client.ts — browser client
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```

### Database schema as shared contract

The Postgres schema is the API surface between apps. Treat it the way you'd treat a public API:

- **Migrations live in one place** — pick a canonical repo (recommend Stats, since it's the primary writer) or a dedicated `six43-db` repo for migrations
- **Don't run ad-hoc schema changes** — always use Supabase migrations so all environments stay in sync
- **Column changes = cross-repo changes** — if you rename or remove a column, all four apps need updating

### Row Level Security (RLS)

RLS should be enabled on all tables. Policies should ensure:

- Users can only read/write data for teams they belong to
- Game state is readable by all participants in that game
- Song assignments (Sound) are scoped to the team that owns them
- Stream config and reactions (Live) are scoped to the game; viewer reactions may be publicly writable for the active stream

### Supabase Storage

Used for:

- **Sound** — walk-up song audio files (MP3/WAV)
- **All apps** — team logos, player photos if applicable

Organize buckets by concern: `walk-up-songs`, `team-assets`, etc.

### Generated types

> **Status:** Generated types live in `types/database.ts`. Regenerate after every         
  migration with `npx supabase gen types typescript --project-id xrtetfxvyicdqfpwnpzt >     
  types/database.ts`.

---

## Coding Conventions [SHARED]

### General rules

- **TypeScript strict mode** — no `any` unless explicitly justified with a `// eslint-disable` + comment
- **Functional components only** — no class components
- **Named exports** — default exports only for Next.js pages/layouts
- **Colocation** — keep components, hooks, and utils close to where they're used

### Naming conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Components | PascalCase | `BatterCard.tsx` |
| Hooks | camelCase, `use` prefix | `useGameState.ts` |
| Utilities | camelCase | `formatBattingAvg.ts` |
| Types/Interfaces | PascalCase, no `I` prefix | `GameState`, not `IGameState` |
| Event type strings | colon-namespaced | `inning:change` |
| Non-component files | kebab-case | `game-utils.ts` |
| Directories | kebab-case | `game-state/` |

### Project structure (per app)

```
app-name/
├── app/                  # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx
│   └── (routes)/
├── components/           # React components
│   └── [feature]/        # Grouped by feature
├── hooks/                # Custom hooks
├── lib/                  # Utilities, API clients, helpers
├── types/                # TypeScript types
├── public/               # Static assets
├── CLAUDE.md             # ← You are here
└── package.json
```

---

## Working With This Codebase [SHARED]

### Before making changes

1. Identify if the change affects **only this app** or **cross-app data contracts**
2. If it changes the shape of data written to the shared backend, check how the other three apps consume that data
3. If it changes a shared type, update the type definitions in all four repos
4. Run `tsc --noEmit` before committing to catch type regressions

### Cross-repo change checklist

If your change affects the database schema or shared game state:

- [ ] Migration created and applied via Supabase CLI
- [ ] Ran `supabase gen types` in this repo
- [ ] Ran `supabase gen types` in the other three repos (or flagged them for update)
- [ ] RLS policies still correct for the changed tables
- [ ] Realtime subscriptions in consuming apps still handle the new data shape
- [ ] Tested with realistic game data (not just happy path)
- [ ] Checked inning transition behavior if applicable

---

## What NOT to Do [SHARED]

- **Don't hardcode league rules** — innings, re-entry, pitch limits, mercy rules are all configurable
- **Don't assume 9 innings** — youth baseball varies by age group
- **Don't change shared data shapes without checking other repos** — the Supabase schema is the contract; run `supabase gen types` in all repos after any migration
- **Don't skip Realtime subscriptions** — if you're writing data another app reads, it must flow through Supabase Realtime
- **Don't use the service role key client-side** — only `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the client; service role bypasses RLS
- **Don't ignore stream delay in Live** — overlays updating 10-30 seconds before the video shows the play is a bad experience; consider buffering or manual trigger options
- **Don't expose YouTube credentials client-side** — stream keys, API keys, and OAuth secrets stay server-side
- **Don't forget offline** — especially for Stats, which is used at the field with unreliable connectivity
- **Don't fire-and-forget audio** — always track playback state and clean up
- **Don't assume standard substitution rules** — youth leagues have re-entry, continuous batting, extra hitters

---

## Testing [SHARED]

> **Status: Not yet set up.** No tests currently exist in any repo.

### Planned approach (for future reference)

When testing gets added, the priority order should be:

1. **Unit tests (highest ROI, start here)** — Vitest for pure domain logic: stat calculations, batting order math, pitch count rules, substitution validators, inning transitions. Start with one file in `six43-stats` to learn the pattern, then replicate across repos.
2. **Supabase integration tests** — Use `supabase start` for local dev and test RLS policies, schema constraints, and database functions. Highest value for catching "users seeing data they shouldn't" bugs.
3. **Cross-app sync tests** — Playwright in a dedicated `six43-e2e` repo. Test that writes in one app propagate correctly to others via Realtime. Start with the inning transition flow.
4. **Component/visual tests (lowest priority)** — Skip until there's a real design system or a component that keeps breaking.

### Rule of thumb

If a bug would only show up during a real game and require restarting something, it needs a test. Everything else can be caught by manual testing.

### What to skip

- 100% coverage goals (waste of time)
- Snapshot tests (break constantly, catch nothing useful)
- Testing Supabase or Next.js framework behavior (trust the libraries)

---

## Environment & Config

### Environment variables (all apps share the same Supabase project)

```bash
# .env.local — all apps
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>  # Server-side only, never expose to client

# .env.local — Live only
YOUTUBE_API_KEY=<youtube-api-key>             # Server-side only
YOUTUBE_CLIENT_ID=<oauth-client-id>
YOUTUBE_CLIENT_SECRET=<oauth-client-secret>   # Server-side only
```

> **IMPORTANT:** `NEXT_PUBLIC_` vars are bundled into the client. Never prefix service role keys, YouTube secrets, or stream keys with `NEXT_PUBLIC_`.

### Commands

```bash
# Install dependencies
npm install

# Dev server
npm run dev

# Type check
tsc --noEmit

# Build
npm run build

# Regenerate Supabase types after a migration
npx supabase gen types typescript --project-id <project-id> > types/database.ts
```

---

## Glossary [SHARED]

| Term | Meaning |
|------|---------|
| At-bat | A single batter's turn at the plate |
| Count | Balls and strikes on the current batter (e.g., 2-1) |
| Half-inning | Top or bottom of an inning |
| Walk-up song | Music played when a batter approaches the plate |
| Lineup card | The official batting order + defensive positions |
| Pitch count | Cumulative pitches thrown by a pitcher (safety-tracked in youth) |
| Mercy rule | Game ends early if score difference exceeds threshold |
| Re-entry | A substituted player returning to the game (allowed in some youth leagues) |
| EH (Extra Hitter) | Additional batting position beyond the standard 9 |
| Continuous batting | All rostered players bat in order, regardless of defensive position |
| Overlay | Visual element rendered on top of the live stream (scoreboard, batter info, graphics) |
| Stream delay | The ~10-30 second lag between real time and what viewers see on YouTube Live |

---

_Last updated: April 2026_
_Maintainer: Andy Layman_
