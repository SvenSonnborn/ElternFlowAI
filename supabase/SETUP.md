# Supabase Project Setup

Reproducible checklist for the Eltern Flow Supabase project. Run through this once per environment (dev, staging, prod). Items marked **Dashboard-only** can't be set via MCP / SQL and must be clicked through in the Supabase Dashboard.

## 1. Project basics

- Region: `eu-central-1` (Frankfurt) — keep data in the EU (privacy promise in [patterns/onboarding.md](../patterns/onboarding.md) Step 2).
- Free Tier is fine for dev. Production will need Pro for backups + bigger SMTP allotment.

## 2. ENV in the app (`.env.local`)

```
EXPO_PUBLIC_SUPABASE_URL=<project URL>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key, NOT secret>
```

Never put the `secret`/legacy `service_role` key here — it bypasses RLS.

## 3. Database (`supabase/migrations/`)

All migrations are committed to the repo. Apply in order via Supabase CLI or MCP `apply_migration`.

> **Nach jedem MCP `apply_migration`: Version abgleichen.** Der MCP-Server vergibt einen **eigenen** Timestamp und ignoriert den Dateinamen — die Zeile in `supabase_migrations.schema_migrations` heißt danach z. B. `20260601230509`, obwohl die Datei `20260602100000_events_parent_id.sql` ist. Die CLI vergleicht Dateiname-Prefix gegen Remote-Version, hält die Migration deshalb für **nicht angewendet** und würde sie bei `supabase db push` erneut fahren. Da die Basis-Migrationen mit `drop table if exists … cascade` beginnen, hätte das die komplette Datenbank gelöscht.
>
> Deshalb: nach jedem `apply_migration` die lokale Datei auf die tatsächlich vergebene Version umbenennen (`list_migrations` zeigt sie) — oder die Zeile per SQL angleichen. Stand 2026-09-02 sind lokal und remote deckungsgleich (18 Migrationen). Historie der Reparaturen: 2026-07-28 der Drift der ersten 13 (8 fehlten ganz, 5 hatten abweichende Versionen); 2026-09-01 `seed_recipes` (lokal `20260814120000` → remote `20260814084006`, eine Altlast, die ADR-022 bereits als unkorrigiert vermerkt hatte) und `realtime_calendar` (lokal `20260901093000` → remote `20260901083335`, direkt beim Anwenden entstanden — der Beleg, dass dieser Abgleich kein Ritual ist); 2026-09-02 `realtime_family_broadcast` (lokal `20260901120000` → remote `20260902065203`, ebenfalls direkt beim Anwenden entstanden, lokale Datei danach umbenannt). 2026-10-26 `events_timezone` und `events_timezone_iana_widen` (lokal `20260909115403`/`20260909131523` → remote `20260909115548`/`20260909131554`), aufgefallen erst beim Aufbau der lokalen Supabase (§7), die die Dateinamen wörtlich nimmt.
>
> Prüfen lässt sich das jederzeit mit:
>
> ```sql
> select version, name from supabase_migrations.schema_migrations order by version;
> ```
>
> gegen `ls supabase/migrations/`.

## 4. Authentication — Dashboard-only settings

### Authentication → Settings → User Signups

- ✅ Enable email signups
- ✅ **Confirm email** (strict mode — required for V1 auth flow)
- ❌ Enable phone signups
- ⬜ **Leaked Password Protection** (Authentication → Policies → Password) — prüft neue Passwörter gegen HaveIBeenPwned. Der Security-Advisor meldet die Einstellung am 2026-09-01 als `WARN` (`auth_leaked_password_protection`). Reine Dashboard-Einstellung, von keiner Migration erreichbar. **Erst ab dem Pro-Plan verfügbar**; das Projekt läuft auf Free (geprüft 2026-10-26), deshalb aus. Mit dem Wechsel auf Pro einschalten. Kosten: ein zusätzlicher Roundtrip beim Registrieren, keine Änderung am Auth-Flow.

### Authentication → URL Configuration

- **Site URL:** `elternflow://`
- **Additional Redirect URLs:**
  - `elternflow://auth/confirm`
  - `elternflow://auth/recovery`
  - `http://localhost:8081/auth/confirm` (dev web-bundle smoke-test)
  - `http://localhost:8081/auth/recovery`

### Authentication → Email Templates (DE versions, EN as fallback)

Adjust three templates so the action link uses the `elternflow://` scheme:

**Confirm signup**

- Subject: `Bestätige deine E-Mail für Eltern Flow`
- Action link href: `{{ .ConfirmationURL }}` (Supabase will substitute the redirect URL configured above)

**Reset password**

- Subject: `Setze dein Eltern-Flow-Passwort zurück`
- Action link target: `elternflow://auth/recovery`

**Magic Link** + **Invite User**: leave defaults. V1 doesn't use them.

### Authentication → Rate Limits

- Sign-up: 30 / hour (default)
- Sign-in: 30 / hour (default)
- Password recovery: **5 / hour** (lower than default — prevents email abuse)

### Authentication → SMTP

**V1:** keep the built-in Supabase SMTP. Hard limit: ~4 emails per hour, sufficient for dev.

**Before production:** switch to a real SMTP provider (Resend / Mailgun / Postmark). Config block to fill in:

- Sender email: `noreply@<your-domain>`
- Sender name: `Eltern Flow`
- Host, Port, User, Pass: provider credentials

### Auth Providers (Google, Apple, etc.)

Leave **disabled** for V1. The Login screen renders these as disabled buttons. Adding them is a separate iteration (Apple Developer Cert, Google Cloud Console, deep-link callback handlers).

## 5. Verification after setup

- Sign up a test account in the app → check the inbox for the confirm email
- Click the link → app should open and route to `/(onboarding)/2`
- If the email never arrives or the link opens the wrong URL, recheck the **URL Configuration** and **Email Templates** sections above

## 6. Production-readiness backlog

- Custom SMTP provider
- Custom email-template branding (logo, colors)
- Auth attack surface review (rate limits, captcha for sign-up)
- Feature-Gruppen des MCP-Servers zuschneiden (`.mcp.json` — `branching` ist aktiviert, aber ungenutzt; CodeRabbit hat das in PR #113 angemerkt, siehe ADR-029)
- Account-deletion flow (DSGVO Art. 17)

## 7. Lokale Supabase (Docker)

Die Testumgebung für alles, was die Datenbank berührt ([ADR-044](../docs/decision-log.md)). Echte Familiendaten kommen nie hierher; „gleich wie live" heißt Schema und Konfiguration.

**Starten.** Docker Desktop muss laufen. Die CLI ist in [mise.toml](../mise.toml) gepinnt.

```bash
mise exec -- supabase start        # Stack hoch, Migrationen + seed.sql beim ersten Start
mise exec -- supabase db reset     # alles neu: Migrationen + Seed, lokale Daten weg
mise exec -- supabase status       # URLs und Schlüssel
bun run test:db                    # pgTAP (supabase/tests/database) + Integrationstests
```

API auf `http://127.0.0.1:54321`, Postgres auf Port `54322` (`postgres`/`postgres`). [config.toml](./config.toml) spiegelt die Auth- und API-Einstellungen von live; jede Abweichung steht dort als Kommentar.

**Konten aus [seed.sql](./seed.sql)** — Passwort für alle drei `lokal-test-1`, nur lokal gültig:

| Konto          | Familie      | Zweck                               |
| -------------- | ------------ | ----------------------------------- |
| `a@test.local` | Testfamilie  | erster Client                       |
| `b@test.local` | Testfamilie  | zweiter Client derselben Familie    |
| `c@test.local` | Fremdfamilie | Angreifer aus einer anderen Familie |

Die festen UUIDs (Familien, Termine, Aufgaben) stehen im Kopf von `seed.sql`; Tests verlassen sich darauf.

**Die App gegen lokal — nur als Produktions-Export, nie als Dev-Server.** Im Dev-Modus legt Expo die `.env*`-Dateien _über_ die Prozessumgebung (`expo/virtual/env` baut `{...process.env, ...dotenv}`); `.env.local` mit den Live-Werten gewinnt dort gegen jede Variable, die man beim Start setzt, und die App spräche mit live. Ein Export setzt die Werte dagegen aus der Prozessumgebung fest ein:

```bash
eval "$(mise exec -- supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
TMPDIR=/tmp/eltern-metro-lokal EXPO_PUBLIC_SUPABASE_URL="$API_URL" \
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" \
  bunx expo export --platform web --output-dir /tmp/eltern-web-lokal --clear
if grep -rqE '[a-z0-9]{20}\.supabase\.co' /tmp/eltern-web-lokal; then
  echo "ABBRUCH: Live-URL im Bundle"
else
  echo '{"private":true}' > /tmp/eltern-web-lokal/package.json
  bunx expo serve /tmp/eltern-web-lokal --port 8082
fi
```

Die Prüfung vor dem Ausliefern ist Pflicht: Sie sucht eine Projekt-URL, nicht nur `supabase.co`, weil supabase-js `*.supabase.co` als Host-Muster mitbringt. Port 8082, weil die lokalen Redirect-URLs dafür freigegeben sind; eigenes `TMPDIR`, damit der Export den Metro-Cache des Dev-Servers nicht teilt. Die `package.json` braucht `expo serve`, das von seinem Verzeichnis aus nach oben ein Projekt sucht; dynamische Routen wie `/event/<id>` liefert es beim Direktaufruf als 404, in der App navigiert man dorthin. Kein HMR, nach Code-Änderungen neu exportieren.

**Abgleich mit live.** [parity.sql](./parity.sql) ist eine einzige Abfrage ohne Seiteneffekte. Lokal über `docker exec -i supabase_db_ElternFlowAI psql -U postgres -At -F '|' < supabase/parity.sql`, live rein lesend über den MCP (`execute_sql`); danach zeilenweise vergleichen. Bei einer Abweichung gilt live: Was live hat, kommt als idempotente Nachzieh-Migration ins Repo; was live fehlt, ist ein Fehler auf live.

**Erlaubte Abweichungen:**

1. `public.broadcast_family_change()` — der Rumpf unterscheidet sich nur in Kommentaren; ohne Kommentare ist der md5 gleich. Bleibt so (ADR-030 Decision 16: ein frisches `db push` reproduziert keinen Defekt).
2. `supabase_realtime_messages_publication` — legt der Realtime-Dienst selbst an, sobald der erste Client ein privates Topic abonniert; lokal also erst nach dem ersten Abo.
3. Nicht von `parity.sql` erfasst und erwartet verschieden: Postgres-Minor, `site_url` und die zusätzlichen Redirects auf 8082, SMTP (lokal Mailpit), Schutz vor geleakten Passwörtern (§4), die Seed-Daten.

**Rollout einer Migration nach live** — erst nach Abnahme gegen die lokale Instanz:

1. Abgleich lokal gegen live auf dem Stand vor der Migration: gleich bis auf die erlaubten Abweichungen.
2. `apply_migration` über den MCP, danach die Datei auf die vergebene Version umbenennen (§3) und mit `list_migrations` gegenprüfen.
3. Abgleich erneut, jetzt mit der neuen Migration; Security-Advisor ohne neue Befunde.
4. Rauchtest live nur lesend: Funktionen und Rechte da (`has_function_privilege` für `anon` und `authenticated`), PostgREST kennt die neuen RPCs. Keine Schreibzugriffe auf Familiendaten.
5. `features/supabase/database.types.ts` über den MCP neu erzeugen, Umbenennung committen, CI grün, dann Merge.
