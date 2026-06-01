# Pattern · Reset Password & New Password

## Goal

Recover account access without admin contact. Two screens; deep-link bridge between them; cannot reach the second screen without a valid recovery token.

## Anatomy — Screen 1: Reset Password

1. Top bar with back arrow only (no progress)
2. H2 `auth.reset.title`
3. Sub `auth.reset.sub`
4. Email field
5. Primary CTA `auth.reset.submit`
6. After submit: success banner (`auth.reset.success`) under the button — *always*, regardless of whether the email exists (enumeration protection)
7. Footer link `auth.reset.backToLogin`

## Anatomy — Screen 2: New Password

Reachable only via `elternflow://auth/recovery?token_hash=…&type=recovery`. The deep-link handler verifies the OTP and routes here. If the recovery session is missing, this screen redirects back to `/(auth)/reset-password` with a toast.

1. H2 `auth.newPassword.title`
2. Sub `auth.newPassword.sub`
3. Password field + 4-bar strength meter
4. Confirm password field
5. Primary CTA `auth.newPassword.save`
6. Success: signOut + redirect `/(auth)/login` + toast `auth.newPassword.saved`

## Validation

- Email format check on blur (Screen 1).
- Password ≥ 8 chars, score ≥ 3 (`passwordStrength.acceptable === true`).
- Confirm match — `auth.newPassword.pwMismatch` inline if mismatch.

## Why force sign-out after password change

Recovery sessions are a special transient state. Letting the user remain authenticated after a password change would grant tabs access without a fresh login — sloppy. Force a sign-out and prompt for the new password. One extra step; clean state.

## Accessibility

- Both fields wire to `autoComplete="new-password"`.
- Strength meter labels (`weak`/`fair`/`good`/`strong`) are announced as supplementary text, not as the only error message.
- Error banner has `accessibilityRole="alert"`.
