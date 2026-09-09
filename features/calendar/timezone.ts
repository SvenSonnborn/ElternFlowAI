/**
 * Umrechnung zwischen **Instant** (einem Zeitpunkt) und **Wandzeit** (dem, was
 * eine Uhr in einer bestimmten Zone zeigt).
 *
 * Die Wandzeit wird als „floating" `Date` dargestellt: ihre Komponenten stehen
 * in den **UTC**-Feldern. `2026-07-01T12:00:00.000Z` heißt hier also „12:00
 * Wandzeit", nicht „12:00 UTC". Das klingt schief, ist aber genau die Form, in
 * der `rrule` rechnen soll: die Bibliothek liest `dtstart` mit UTC-Gettern und
 * rechnet absolut — auf Wandzeit angewandt ist das DST-frei, und „18:00" bleibt
 * über eine Umstellung hinweg stehen (ADR-033).
 *
 * Warum nicht `rrule`s `tzid`: `rrule@2.8.1` rechnet in `dateInTimeZone`
 * `targetOffset − localOffset` und ist damit nur korrekt, wenn die
 * Prozess-Zeitzone UTC ist. Eine React-Native-App läuft in der Gerätezone, dort
 * ist die Option ein No-op. Nachgemessen in Spec §1.1.
 */

/**
 * Ein `Intl.DateTimeFormat` je Zone. Die Konstruktion ist der teure Teil, das
 * Formatieren nicht — und `expandEvents` ruft das pro Occurrence auf.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  FORMATTERS.set(timeZone, created);
  return created;
}

/**
 * Der Offset der Zone **zu diesem Zeitpunkt**, in Millisekunden, als
 * `Wandzeit-als-UTC − Instant`. Berlin im Sommer ergibt `+2 h`.
 *
 * Zwei Eigenheiten, die beide einen Test haben:
 *
 * - `hour12: false` liefert in manchen ICU-Versionen `24` statt `00` für
 *   Mitternacht; `% 24` fängt das ab.
 * - `formatToParts` kennt keine Millisekunden. Der Instant wird deshalb auf
 *   volle Sekunden abgeschnitten, bevor er abgezogen wird — sonst trüge der
 *   Offset die Millisekunden des Eingabewerts.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const at = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour") % 24,
    at("minute"),
    at("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instant → Wandzeit in `timeZone`, als floating `Date`. */
export function instantToFloating(instant: Date, timeZone: string): Date {
  return new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
}

/** Sicher außerhalb jedes Umstellungsfensters — keine Zone schaltet zweimal in 26 Stunden. */
const PROBE_MS = 26 * 3600_000;

/**
 * Wandzeit → Instant.
 *
 * An zwei Stunden im Jahr ist das nicht eindeutig, und beide Fälle brauchen
 * eine bewusste Antwort:
 *
 * - **Doppelte Stunde** (Berlin, 25.10., 02:30 gibt es zweimal): genommen wird
 *   der **frühere** Zeitpunkt, noch in der Sommerzeit. Ein Termin, der vor der
 *   Umstellung angelegt wurde, war in deren Regime gemeint.
 * - **Sprung-Lücke** (Berlin, 29.03., 02:30 existiert nicht): genommen wird der
 *   **spätere** Zeitpunkt, also 03:30 — dieselbe Richtung, die auch
 *   `new Date(y, m, d, 2, 30)` in der lokalen Zone wählt.
 *
 * Deshalb **zwei Sonden weit vor und weit nach** der gesuchten Wandzeit statt
 * eines Zweipasses am Wert selbst: Ein Zweipass konvergiert in der doppelten
 * Stunde auf den zweiten Zeitpunkt, weil beide Zwischenschritte hinter der
 * Umstellung landen — nachgemessen, er liefert dort 02:30 CET statt 02:30 CEST.
 */
export function floatingToInstant(floating: Date, timeZone: string): Date {
  const wall = floating.getTime();
  const offsetBefore = zoneOffsetMs(new Date(wall - PROBE_MS), timeZone);
  const offsetAfter = zoneOffsetMs(new Date(wall + PROBE_MS), timeZone);
  if (offsetBefore === offsetAfter) return new Date(wall - offsetBefore);

  const candidates = [wall - offsetBefore, wall - offsetAfter];
  const valid = candidates.filter(
    (candidate) => instantToFloating(new Date(candidate), timeZone).getTime() === wall,
  );
  // Beide gültig → doppelte Stunde, der frühere gewinnt.
  // Keiner gültig → Lücke, die spätere Wandzeit gewinnt (der spätere Instant).
  if (valid.length === 2) return new Date(Math.min(...valid));
  if (valid.length === 1) return new Date(valid[0]);
  return new Date(Math.max(...candidates));
}
