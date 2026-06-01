# Supabase Auth + Login + Onboarding — Design

**Status:** Draft, pending user approval
**Iteration:** `feature/auth-v1` (suggested branch)
**Related ADRs:** ADR-003 (Supabase-Anbindung). Wird durch ADR-004 ergänzt (Auth-Flow + Approach C + Strict-Confirm).
**Related Patterns:** [patterns/login.md](../../../patterns/login.md), [patterns/onboarding.md](../../../patterns/onboarding.md), neu: [patterns/reset-password.md](../../../patterns/reset-password.md)
**Related Schema:** [supabase/migrations/20260529090123_helpers_and_core.sql](../../../supabase/migrations/20260529090123_helpers_and_core.sql), [supabase/migrations/20260529091002_onboarding_rpcs.sql](../../../supabase/migrations/20260529091002_onboarding_rpcs.sql)

## Goal

Bring Supabase-Auth live: User können sich registrieren, ihre E-Mail bestätigen, einloggen, Passwort zurücksetzen, durch das 5-Step-Onboarding laufen, und ihren Partner einladen — ohne dass die App weiter mit dem Sample-Data-Fallback im Kalender arbeitet.

## Scope V1

**In Scope:**

- Email + Passwort Registrierung (mit Strict-Confirm-Email)
- Email + Passwort Login
- Reset-Password Flow (zwei Screens, Deep-Link-basiert)
- 5-Step Onboarding (Steps 2–5 als `(onboarding)` Route-Gruppe; Step 1 als `RegisterScreen` in `(auth)`)
- Partner-Invite via Share-Sheet + `elternflow://invite/<token>` Deep-Link
- Auth-State-Routing-Gate (logged-out → `/(auth)/login`, logged-in-ohne-Family → `/(onboarding)/2`, logged-in-mit-Family → `/(tabs)`)
- Supabase-Dashboard-Config dokumentiert in `supabase/SETUP.md`
- Sample-Data-Fallback im Kalender entfernen (Auth-Wall)

**Out of Scope (siehe [docs/TODO.md](../../TODO.md)):**

- Magic-Link Login (UI als disabled-State sichtbar)
- Google + Apple Sign In (UI als disabled-State sichtbar)
- Server-Side Invite-Mail via Edge Function
- Custom-SMTP-Provider (Default Supabase-SMTP für V1, ~4 Mails/h Limit)
- Web-Bundle Reset-Flow
- E2E-Maestro-Flows (eigene Iteration)
- Email-Change-Flow (Settings)
- Account-Delete (DSGVO Art. 17)
- "Onboarding-Resume nach Abbruch"-CTA auf Dashboard (steht im TODO; V1 fängt das mit dem Empty-State ab)

## Architectural Approach

**Approach C — Incremental Real-Inserts** (gegenüber Local-Draft und Server-Draft):

- Step 2 (`Familienname + Dein Name`) committed direkt via `rpc("create_family", …)` — ab da existiert die Family.
- Step 3 inserted optional eine `family_invitations`-Row und öffnet das OS Share-Sheet.
- Step 4 inserted optional eine `children`-Row.
- Step 5 ist eine **read-only Recap** — liest die echten DB-Daten und rendert "Zum Dashboard".
- **Resume-nach-Abbruch:** Wer mit `current_family_id() !== null` zurückkehrt, landet auf `/(tabs)`. Empty-States ([patterns/dashboard-empty.md](../../../patterns/dashboard-empty.md)) fangen fehlende Kinder / Partner ab. V2-TODO: explizite "Onboarding fortsetzen"-CTA.

**Begründung:** Pattern Step 5 ist eh kein Commit-Punkt, sondern reine Recap → ein lokales Draft-Modell oder eigenes Draft-Schema sind beide unnötig groß. Approach C nutzt die bereits existierenden RPCs (`create_family`, `accept_invitation`), bringt keine neue Migration mit, ist robust gegen App-Crashes.

## Routing Architecture

Drei Route-Gruppen unter `app/`:

```
isAuthenticated  →  hasParentRow  →  aktuelle Group   →  Ziel
─────────────────────────────────────────────────────────────────
false            →   —            →  ≠ (auth)         →  /(auth)/login
false            →   —            →  (auth)           →  stay
true             →  false         →  ≠ (onboarding)   →  /(onboarding)/2
true             →  false         →  (onboarding)     →  stay
true             →  true          →  (auth)           →  /(tabs)
true             →  true          →  (onboarding)     →  stay   ← User läuft durch Steps 3–5, parent existiert ab Step 2
true             →  true          →  (tabs)           →  stay
```

Single Gate-Komponente `AuthGate` im Root-Layout entscheidet per `<Redirect>`. Keine verstreute If-Else-Routing-Logik in Screens. **Wichtig:** AuthGate wirft NICHT aus `(onboarding)` raus, sobald `parents`-Row entsteht (Step 2 RPC) — der User durchläuft Steps 3–5 weiterhin in der Onboarding-Gruppe. Erst der explizite `router.replace("/(tabs)")` aus Step 5's "Zum Dashboard"-CTA verlässt die Gruppe.

### Route-Layer Files

| Pfad                            | Inhalt                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| `app/(auth)/_layout.tsx`        | Stack ohne Tab-Bar, ohne Voice-FAB                           |
| `app/(auth)/login.tsx`          | → re-export `LoginScreen`                                    |
| `app/(auth)/register.tsx`       | → re-export `RegisterScreen` (= Onboarding Step 1)           |
| `app/(auth)/check-email.tsx`    | → re-export `CheckEmailScreen`                               |
| `app/(auth)/reset-password.tsx` | → re-export `ResetPasswordScreen`                            |
| `app/(auth)/new-password.tsx`   | → re-export `NewPasswordScreen`                              |
| `app/(onboarding)/_layout.tsx`  | Mounts `OnboardingShell` (Top-Bar + Step-Dots + Footer-Slot) |
| `app/(onboarding)/[step].tsx`   | Dispatcher 2/3/4/5 → re-export `OnboardingStepScreen`        |
| `app/_layout.tsx`               | **modified:** mount `AuthGate` + `deepLinkHandler` init      |
| `app/(tabs)/_layout.tsx`        | **modified:** Sample-Data-Fallback-Pfade entfernen           |

### Deep-Links (`scheme: "elternflow"` in `app.json`)

- `elternflow://auth/confirm?token_hash=…&type=email` (Email-Confirm)
- `elternflow://auth/recovery?token_hash=…&type=recovery` (Reset-Password)
- `elternflow://invite/<token>` (Partner-Invite, vom User via Share-Sheet weitergegeben)

## Components

### `features/auth/` (neu)

| Datei                    | Verantwortung                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session.ts`             | `useSession()` Zustand-Store. States: `loading` / `unauthenticated` / `authenticated`. Mountet einmalig `getSession()` + `onAuthStateChange()`.       |
| `useCurrentParent.ts`    | TanStack-Query, key `["currentParent", userId]`. SELECT auf `parents` mit `auth_user_id = auth.uid()`. `enabled: session.status === "authenticated"`. |
| `mutations.ts`           | `useSignUp`, `useSignIn`, `useSignOut`, `useResetPassword`, `useUpdatePassword`                                                                       |
| `onboardingMutations.ts` | `useCreateFamily` (RPC), `useAcceptInvitation` (RPC), `useCreateChild` (INSERT), `useCreateInvitation` (INSERT)                                       |
| `AuthGate.tsx`           | `<Redirect>` basierend auf `useSession()` + `useCurrentParent()`. Rendert `<SplashScreen />` im Loading-State.                                        |
| `deepLinkHandler.ts`     | `Linking.addEventListener("url", …)` + `Linking.getInitialURL()`. Parsed die 3 URL-Typen, dispatched zu Supabase oder Routing.                        |
| `errors.ts`              | Mapping Supabase-Errorcode → i18n-Key (kein raw Server-Text in UI).                                                                                   |
| `index.ts`               | Barrel                                                                                                                                                |

### `app-sections/auth/` (neu, README-Placeholder entfernen)

| Datei                     | Spec                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `LoginScreen.tsx`         | [patterns/login.md](../../../patterns/login.md) V1 (zentriert). Social-Buttons + Magic-Link als disabled-State.                        |
| `RegisterScreen.tsx`      | Step 1: Email + Password + 4-bar Strength-Meter + Terms-Checkbox. Submit → `signUp` → `/(auth)/check-email`.                           |
| `CheckEmailScreen.tsx`    | "Wir haben dir eine Mail geschickt." Secondary "Mail erneut senden" (resend).                                                          |
| `ResetPasswordScreen.tsx` | Mail-Request. Immer Success-State (Enumeration-Schutz). Siehe [patterns/reset-password.md](../../../patterns/reset-password.md) (neu). |
| `NewPasswordScreen.tsx`   | Nur erreichbar via Recovery-Deep-Link. Submit → `updateUser({password})` → signOut + Login-Redirect + Toast.                           |

### `app-sections/onboarding/` (neu)

| Datei                    | Spec                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OnboardingShell.tsx`    | Shared-Shell aus [patterns/onboarding.md](../../../patterns/onboarding.md). Top-Bar (← / Step-Dots / Überspringen), Footer-Slot Primary+Secondary.                                                                                                                                                                                                       |
| `Step2FamilyAndName.tsx` | **Erweitert:** Familienname + Dein Name + Avatar-Color-Picker. Submit → `rpc("create_family")`. Invite-Pfad (URL-Param `?invite=<token>`): Familienname-Feld versteckt, Submit → `rpc("accept_invitation")`.                                                                                                                                             |
| `Step3InvitePartner.tsx` | Partner-Email-Feld + Share-Cards. Primary → `INSERT family_invitations RETURNING token` → `Sharing.shareAsync` mit Deep-Link. Secondary "Später einladen" → skip.                                                                                                                                                                                        |
| `Step4FirstChild.tsx`    | Big Avatar + Color-Picker · Name · Birthday (Date-Picker) · School · Allergie-Chips. Voice-CTA disabled. Submit → `INSERT children`.                                                                                                                                                                                                                     |
| `Step5Done.tsx`          | Recap-View. Liest Family + Parents + Children + pending Invitations. Wenn Partner UND Children = leer (User hat 3+4 geskippt) → Empty-Variant mit `onb.s5.empty.*` ("Du kannst Partner und Kinder jederzeit hinzufügen"). Sonst Recap-Karte. Primary "Zum Dashboard" (`router.replace("/(tabs)")`). Secondary "Weiteres Kind anlegen" (reset zu Step 4). |

### `features/i18n/` (Keys-Erweiterungen, beide Sprachen)

```
auth.action.signIn / signUp / reset / resetSubmit / signOut
auth.error.invalidCredentials / emailTaken / emailNotConfirmed
auth.error.weakPassword / network / generic / linkExpired / alreadyInFamily
auth.checkEmail.title / sub / resend / wrongEmail
auth.reset.title / sub / submit / success / backToLogin
auth.newPassword.title / sub / save / pwMismatch
auth.password.strength.{weak|fair|good|strong}
auth.terms.label                                       # mit Markdown-Links
onb.s2.parentName.label / placeholder
onb.s2.color.label / chipsAria
onb.s3.shareSubject / shareMessage / pendingPill
onb.s4.skip / voicePlaceholder
onb.s5.recap.parent / partner / partnerPending / partnerNone
onb.s5.recap.children / childrenNone / secondary
onb.s5.empty.title / sub
```

DE = canonical. EN mirrors. Copy-Decks landen im selben Commit in [docs/COPY.md](../../COPY.md).

### `features/calendar/` (Cleanup im selben Commit-Set)

- Sample-Data-Imports aus `app-sections/(tabs)/kalender/…` entfernen. Query liest direkt aus Supabase.
- [features/calendar/sample.ts](../../../features/calendar/sample.ts) bleibt für Smoke-Tests vorhanden (kein Production-Pfad).
- `cal.detail.requiresAuth`-Alert in [app-sections/event/EventDetailScreen.tsx](../../../app-sections/event/EventDetailScreen.tsx) ist obsolet → raus.

### `features/supabase/` (Erweiterung)

- `features/supabase/client.ts`: bereits funktional. Optional defensiver `exchangeCodeForSession`-Wrapper, der zu einem `Result`-Type mapped.
- `features/supabase/SETUP.md` (neu): Dashboard-Config-Checkliste, Production-Readiness-Block für Custom-SMTP.

### `docs/` + Pattern-Updates

- `docs/decision-log.md`: ADR-004 anhängen — Approach C, Strict-Confirm, Share-Sheet-Invite.
- `docs/COPY.md`: neue i18n-Keys in Tabellen aufnehmen.
- `docs/HANDOFF.md`: Auth-Section mit Pflicht-Setup-Hinweisen.
- `patterns/onboarding.md`: Step 2 Erweiterung ("Familienname + Dein Name + Avatar-Color"). "Each step writes a draft Family record server-side" wird auf "Step 2 commited direkt" patcht.
- `patterns/reset-password.md` (neu): zwei Screens, Deep-Link-Pfad, Force-Logout-Begründung.
- `CLAUDE.md`: Bullet zu Supabase aktualisieren — Auth lebt jetzt.

### `app.json`

`scheme: "elternflow"` setzen (prüfen ob schon vorhanden).

## Data Flow

### Sign-Up (Strict-Confirm)

```
RegisterScreen
  └─ useSignUp.mutate({email, password})
       └─ supabase.auth.signUp({email, password, options: {emailRedirectTo: "elternflow://auth/confirm"}})
            ├─ Success → router.replace("/(auth)/check-email?email=…")
            └─ Error → mapAuthError → inline-Banner

   ╎ User klickt Mail-Link ╎

deepLinkHandler ← elternflow://auth/confirm?token_hash=…&type=email
  └─ supabase.auth.verifyOtp({token_hash, type: "email"})
       └─ onAuthStateChange → useSession = "authenticated"
            └─ AuthGate: parent=null → Redirect /(onboarding)/2
```

### Onboarding Commit (Step 2)

```
Step2FamilyAndName.submit
  └─ useCreateFamily.mutate({p_family_name, p_parent_name, p_short, p_color})
       └─ supabase.rpc("create_family", {...})
            ├─ Success → queryClient.invalidateQueries(["currentParent"])
            │           → router.push("/(onboarding)/3")
            ├─ 23505 ("user already belongs") → Toast + router.replace("/(tabs)")
            └─ 42501 ("not authenticated") → router.replace("/(auth)/login")
```

### Partner-Invite (Step 3)

```
Step3InvitePartner.submit
  ├─ useCreateInvitation.mutate({family_id}) → returns {token}
  ├─ Sharing.shareAsync(undefined, {dialogTitle: t("onb.s3.shareSubject"), message: `${t("onb.s3.shareMessage")} elternflow://invite/${token}`})
  └─ router.push("/(onboarding)/4")
```

Partner-Seite (zweiter User klickt den Link):

```
deepLinkHandler ← elternflow://invite/<token>
  ├─ unauthenticated → AsyncStorage.setItem("pendingInvite", token) → Redirect /(auth)/login
  ├─ authenticated + no parent → Redirect /(onboarding)/2?invite=<token>
  │   └─ Step2: family-name-Feld versteckt, submit ruft rpc("accept_invitation", {p_token, ...})
  └─ authenticated + parent existiert → Toast "Du bist schon in einer Familie"
```

### Reset-Password

```
ResetPasswordScreen.submit
  └─ useResetPassword.mutate({email})
       └─ supabase.auth.resetPasswordForEmail(email, {redirectTo: "elternflow://auth/recovery"})
            └─ immer Success-Banner (Enumeration-Schutz)

   ╎ User klickt Mail-Link ╎

deepLinkHandler ← elternflow://auth/recovery?token_hash=…&type=recovery
  ├─ verifyOtp({type: "recovery"}) Success → router.replace("/(auth)/new-password")
  └─ Failure (abgelaufen) → Toast "Link abgelaufen" → Redirect /(auth)/reset-password

NewPasswordScreen.submit
  └─ useUpdatePassword.mutate({password})
       └─ supabase.auth.updateUser({password})
            └─ Success → signOut() + router.replace("/(auth)/login") + Toast "Passwort geändert"
```

## Error Handling

`features/auth/errors.ts` mapped jede Supabase-Auth-Exception auf einen i18n-Key:

| Supabase Error                                                                  | i18n Key                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Invalid login credentials`                                                     | `auth.error.invalidCredentials`                                  |
| `User already registered`                                                       | `auth.error.emailTaken`                                          |
| `Email not confirmed`                                                           | `auth.error.emailNotConfirmed`                                   |
| `Password should be at least N characters`                                      | `auth.error.weakPassword`                                        |
| Network / abort                                                                 | `auth.error.network`                                             |
| Postgres `23505` (RPC `create_family` und `accept_invitation`: user has family) | Toast `auth.error.alreadyInFamily` + `router.replace("/(tabs)")` |
| Postgres `22023` (RPC `accept_invitation`: invitation invalid/expired/used)     | `auth.error.linkExpired`                                         |
| Postgres `42501` (RPC: not authenticated)                                       | Force re-login (Redirect /(auth)/login, kein UI-Banner)          |
| ANY unknown                                                                     | `auth.error.generic` (+ `console.error` original)                |

Server-Strings dürfen niemals direkt im UI landen — sie sind nicht lokalisiert und können Implementation-Details leaken.

## Supabase Dashboard Configuration

Wird nicht in Migrations gepflegt — landet in [supabase/SETUP.md](../../../supabase/SETUP.md) als Checkliste:

**Authentication → Settings → User Signups**

- ✅ Enable email signups
- ✅ Confirm email
- ❌ Phone signups

**Authentication → URL Configuration**

- Site URL: `elternflow://`
- Additional Redirect URLs: `elternflow://auth/confirm`, `elternflow://auth/recovery`, `http://localhost:8081/auth/confirm`, `http://localhost:8081/auth/recovery`

**Authentication → Email Templates** (DE-Versionen anpassen)

- Confirm signup → `{{ .ConfirmationURL }}` öffnet `elternflow://auth/confirm?token_hash=…&type=email`
- Reset password → `elternflow://auth/recovery?token_hash=…&type=recovery`
- Magic Link + Invite User: Default lassen, V1 nicht genutzt

**Authentication → Rate Limits**

- Sign-up / Sign-in: 30/h (Default)
- Password recovery: 5/h (runtersetzen)

**Authentication → SMTP** → Default Supabase-SMTP für V1. Hard-Limit ~4 Mails/h. Production-Readiness in SETUP.md dokumentiert.

**Database Hooks / Edge Functions / Auth Providers (Google/Apple/etc.)** → keine in V1.

## Testing

| Datei                                                 | Coverage                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/auth/__tests__/errors.test.ts`              | Jeder Supabase-Errorcode → korrekter i18n-Key. Unknown → `generic`.                                                                          |
| `features/auth/__tests__/deepLinkHandler.test.ts`     | confirm/recovery/invite URL-Parsing. Malformed URL → no-op. Invite-Token-Stash für unauth User.                                              |
| `features/auth/__tests__/AuthGate.test.tsx`           | 3 × State-Combo: unauth+anywhere → /login; auth+noParent+tabs → /onb/2; auth+parent+auth-or-onb → /tabs. Plus: loading-State rendert Splash. |
| `features/auth/__tests__/onboardingMutations.test.ts` | `create_family` Happy + `23505` + `42501` paths. `accept_invitation` mit ablaufendem Token.                                                  |

Manuelle Smoke-Tests (in PR-Beschreibung als Checklist):

- Cold-Start mit aktiver Session → kein UI-Flash
- Logout → TanStack-Cache leer (kein Family-Leak)
- Deep-Link aus Background → korrektes Routing
- Sign-Up → Mail-Confirm → landet auf /(onboarding)/2

Maestro-Flows sind eigene Iteration ([maestro-mobile-testing](../../../maestro)-Skill existiert) — V1 markiert sie als TODO.

## Risks & Open Decisions

1. **Default-SMTP-Limit (4 Mails/h)** bricht beim Dev-Smoke-Test mit >4 Sign-Ups/h. Mitigation: Custom-SMTP in SETUP.md als "vor Produktion" markiert. V1-Dev arbeitet mit Default.
2. **AsyncStorage-Session bei App-Reinstall** — iOS löscht AsyncStorage bei Uninstall, Android nicht immer (Backup-Service). Konsequenz: nach Reinstall könnte alte Session aktiv sein. AuthGate fängt das ab (Token expired → unauth), aber Cold-Start kann kurz Tabs zeigen. **Bewusst akzeptiert für V1.**
3. **Invite-Token vor Login geöffnet** — User ohne Account klickt `elternflow://invite/<token>`: Token wird in AsyncStorage gestashed, Login-Redirect. Nach Sign-Up/Sign-In zieht Onboarding den Token aus dem Stash. **Edge-Case:** User registriert, klickt aber denselben Invite-Link nochmal → idempotent.
4. **`accept_invitation` Race-Condition** — zwei Partner klicken denselben Token gleichzeitig → `FOR UPDATE`-Lock in der RPC fängt das ab, zweiter kriegt `22023` → UI mapped auf `auth.error.linkExpired`.
5. **Pattern vs. Reality:** "Each step writes a draft Family server-side" — Pattern wird per ADR-004 revidiert auf "Step 2 commited direkt". Patch in [patterns/onboarding.md](../../../patterns/onboarding.md) im selben Commit.
6. **`expoConfig.scheme`** muss in `app.json` gesetzt sein (`"scheme": "elternflow"`). Im Plan vorab prüfen.

## Implementation Order (für Plan-Phase)

Grobe Reihenfolge — Details in `writing-plans`:

1. **`supabase/SETUP.md` zuerst** (Dashboard-Config dokumentieren), + User klickt es im Supabase-Dashboard durch. Ohne Strict-Confirm-Setting + Redirect-URLs sind Sign-Up-Smoke-Tests blockiert.
2. **`app.json`** Linking-Schema verifizieren (`scheme: "elternflow"`).
3. **`features/auth/` Foundation:** `session.ts`, `useCurrentParent.ts`, `errors.ts`, `mutations.ts`, plus Tests.
4. **`AuthGate.tsx` + `deepLinkHandler.ts`** (mit Tests für 3 Routing-Combos + URL-Parsing).
5. **`app/(auth)/_layout.tsx` + `LoginScreen` + `RegisterScreen` + `CheckEmailScreen`** — erste manuelle Smoke-Test-Möglichkeit (Sign-Up → Confirm-Mail → Deep-Link).
6. **`app/(onboarding)/_layout.tsx` + `OnboardingShell` + `Step2FamilyAndName`** mit `useCreateFamily` und `useAcceptInvitation` (invite-Pfad).
7. **`Step3InvitePartner`** + Share-Sheet + `useCreateInvitation`.
8. **`Step4FirstChild`** + `useCreateChild`.
9. **`Step5Done`** (read-only Recap mit Empty-Variant).
10. **`ResetPasswordScreen` + `NewPasswordScreen`** + Recovery-Flow + neuer `patterns/reset-password.md`.
11. **Calendar-Cleanup:** Sample-Data-Fallback entfernen (`features/calendar/sample.ts` Imports raus, `cal.detail.requiresAuth` aus EventDetailScreen).
12. **Doc-Updates im selben Commit:** ADR-004, COPY.md, onboarding.md Patch, CLAUDE.md.
13. **Verification:** `bun typecheck`, `bun lint`, `bun test`, manueller Smoke-Test (Sign-Up → Confirm → Onboarding-Vollwanderung → Dashboard; Reset-Password-Vollwanderung; Partner-Invite zwischen zwei Test-Accounts).

## Acceptance Criteria

- [ ] Logged-out User kann nicht in `(tabs)` oder `(onboarding)` — wird zu `/(auth)/login` umgeleitet
- [ ] Logged-in User ohne `parents`-Row und außerhalb von `(onboarding)` wird zu `/(onboarding)/2` umgeleitet
- [ ] Logged-in User mit `parents`-Row, der in `(auth)` landet (Deep-Link, Stale-Tab) → Redirect `/(tabs)`
- [ ] Logged-in User mit `parents`-Row im `(onboarding)` (Mid-Flow nach Step 2) → bleibt, kein Auto-Redirect
- [ ] Sign-Up → Confirm-Mail → Klick → App öffnet auf `/(onboarding)/2`
- [ ] Step 2 ruft `create_family` mit korrekten Args; Family + Parent landen in DB
- [ ] Step 3 erzeugt `family_invitations`-Row + öffnet OS-Share-Sheet
- [ ] Partner-Klick auf Invite-Link → `/(onboarding)/2` mit invite-Pfad → `accept_invitation` succeeds, beide Parents sehen sich
- [ ] Reset-Password → Mail → Deep-Link → `NewPasswordScreen` → signOut + Login mit neuem PW funktioniert
- [ ] Sample-Data-Fallback ist nicht mehr im App-Code-Pfad (Kalender lädt nur aus Supabase)
- [ ] `bun typecheck` + `bun lint` + `bun test` grün
- [ ] [supabase/SETUP.md](../../../supabase/SETUP.md) ist vollständig und reproduzierbar
