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
> Deshalb: nach jedem `apply_migration` die lokale Datei auf die tatsächlich vergebene Version umbenennen (`list_migrations` zeigt sie) — oder die Zeile per SQL angleichen. Stand 2026-09-01 sind lokal und remote deckungsgleich (17 Migrationen). Historie der Reparaturen: 2026-07-28 der Drift der ersten 13 (8 fehlten ganz, 5 hatten abweichende Versionen); 2026-09-01 `seed_recipes` (lokal `20260814120000` → remote `20260814084006`, eine Altlast, die ADR-022 bereits als unkorrigiert vermerkt hatte) und `realtime_calendar` (lokal `20260901093000` → remote `20260901083335`, direkt beim Anwenden entstanden — der Beleg, dass dieser Abgleich kein Ritual ist).
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
- ⬜ **Leaked Password Protection** (Authentication → Policies → Password) — prüft neue Passwörter gegen HaveIBeenPwned. Der Security-Advisor meldet die Einstellung am 2026-09-01 als `WARN` (`auth_leaked_password_protection`). Reine Dashboard-Einstellung, von keiner Migration erreichbar; einschalten, sobald jemand am Dashboard ist. Kosten: ein zusätzlicher Roundtrip beim Registrieren, keine Änderung am Auth-Flow.

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
