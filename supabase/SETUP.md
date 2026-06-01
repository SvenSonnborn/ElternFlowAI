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

## 4. Authentication — Dashboard-only settings

### Authentication → Settings → User Signups

- ✅ Enable email signups
- ✅ **Confirm email** (strict mode — required for V1 auth flow)
- ❌ Enable phone signups

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
- Account-deletion flow (DSGVO Art. 17)
