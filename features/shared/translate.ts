/**
 * Structural subset of i18next's `t` — narrow enough that the `TFunction` from
 * `useTranslation()` and one from a bare `createInstance()` both satisfy it.
 *
 * Sample fixtures take this as an argument instead of reaching for i18next's
 * module-level `t`. That global resolves against whatever language the running
 * app happens to have initialised, and before `i18n.init()` it returns
 * `undefined` — not the key, not even `defaultValue` — which would hand callers
 * an `undefined` typed as `string`. Passing the caller's own `t` also means the
 * fixtures follow a language switch instead of freezing at import time.
 */
export type Translate = (key: string, params?: Record<string, string>) => string;
