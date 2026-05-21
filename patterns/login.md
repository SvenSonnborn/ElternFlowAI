# Pattern · Login & Login Failed

## Goal

- Fast for returning users (one-tap social login).
- For errors, **never blame the user** — phrase recovery first ("Versuch es noch einmal oder setze dein Passwort zurück.")

## Anatomy

### Login (default — V1 Centered)

1. Status bar
2. Logo orb cluster (~110 px) + brand name + tagline
3. Email field (with `mail` leading icon)
4. Password field (with `lock` leading icon + `eye` trailing for reveal)
5. "Eingeloggt bleiben" checkbox · "Passwort vergessen?" right
6. Primary CTA: _Anmelden_
7. Divider "ODER"
8. Google button
9. Apple button
10. Footer "Neu hier? Konto erstellen"

No tab bar on auth screens.

### Login — V2 Hero card

Top 290 px is a coloured hero panel with the orb cluster and a 2-line tagline ("Familienleben, entspannter."). Form takes the bottom half. Use as the **marketing variant** (deeplinks from landing page).

### Login Failed

Identical to V1 but:

- Above the form: red error banner with `warning` icon, headline `auth.error.title`, sub `auth.error.help`.
- Both fields show `shadow.ringDanger` instead of the normal ring.
- Below the email field: an inline tip if a likely typo is detected ("Tippfehler? Vielleicht „gmail.com"").
- Extra secondary CTA: _Magic-Link per E-Mail senden_ (ghost button below the primary).

## Validation

- Email format check on blur.
- Password: 8 char min, never reveal what's wrong server-side. On second failed attempt, surface the magic-link option more prominently.
- Rate-limit: after 5 failed attempts in 10 min, switch the primary CTA to "Magic-Link senden" and disable the password input.

## Accessibility

- Both fields wired to `autocomplete=email` and `current-password`.
- Error banner has `role="alert"`.
- Eye toggle is `aria-pressed`.
