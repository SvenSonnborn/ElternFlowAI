# Supabase integration

Initialer Client steht. Auth-Flow, Schema, RLS und Realtime folgen in separaten Iterationen.

## Heute

- `client.ts` — `createClient` mit AsyncStorage-Session, `react-native-url-polyfill` für RN-`URL`-Global, kein Browser-Redirect (`detectSessionInUrl: false`).
- `index.ts` — Barrel: `import { supabase } from "@/features/supabase"`.
- ENV via `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` aus `.env.local` (siehe `.env.example`). Publishable statt legacy anon — gleiche Eigenschaften (öffentlich, RLS-geschützt), neue Naming-Konvention. Der `secret`-Key gehört **nie** ins Repo und nie ins Mobile-Bundle.
- MCP via Supabases hosted HTTP-Server (`https://mcp.supabase.com/mcp?project_ref=…`), project-scoped, OAuth-authentifiziert. Konfig in `.mcp.json` (committed, ohne Secrets). Setup:

  ```bash
  claude mcp add --scope project --transport http supabase \
    "https://mcp.supabase.com/mcp?project_ref=smdwbhyniuyocdsorlgg"
  # danach in einem normalen Terminal:
  claude /mcp     # → supabase → Authenticate (OAuth)
  ```

- Hintergrund + Begründungen: [docs/decision-log.md](../../docs/decision-log.md) ADR-003.

## Noch offen

- Auth-Helper (Email/Password, OAuth) + Session-Hook.
- Schema-Migrations (families · parents · children · calendar_events · meals · recipes · homework) — Entwurf aus `sample-data/` ableiten.
- RLS-Policies — alle Tabellen, insbesondere `children` (Allergien) und `calendar_events`.
- Realtime-Subscriptions für geteilte Familien-Daten.
- TypeScript-Types via `supabase gen types typescript` (oder MCP `generate_typescript_types`).
- Edge Functions für serverseitige Logik (z.B. Meal-Plan-Vorschlag mit Allergie-Filter).
- Re-Evaluierung: SecureStore statt AsyncStorage falls sensitive Tokens dazukommen.
