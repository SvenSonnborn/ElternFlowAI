import * as Crypto from "expo-crypto";

/**
 * Eine neue Kennung für eine Nutzer-Absicht — `requestId` beim Bearbeiten und
 * Löschen eines Termins, die `id` beim Anlegen (Spec §6). Eine Absicht bekommt
 * genau eine Kennung, wenn ihre `vars` entstehen; erneutes Senden derselben
 * `vars` trägt dieselbe, und der Server erkennt die Wiederholung daran.
 *
 * **Warum ein CSPRNG.** Die Kennung ist zugleich der Primärschlüssel eines neuen
 * Termins und der Schlüssel der Verbuchung in `apply_event_change`. Wäre sie
 * vorhersagbar, könnte jemand sie vorab belegen: Ein fremder Termin unter der
 * geplanten id ließe das Anlegen scheitern. `expo-crypto` liefert eine UUID v4
 * aus kryptografisch sicherem Zufall auf iOS, Android und Web — ein globales
 * `crypto.randomUUID` garantiert React Native nicht auf allen drei Plattformen,
 * und `Math.random` ist kein CSPRNG.
 *
 * **Ausweichweg ohne sicheren Kontext.** Auf Web reicht `Crypto.randomUUID` an
 * `crypto.randomUUID` des Browsers durch, und das gibt es nur in einem sicheren
 * Kontext (https oder localhost). Öffnet jemand die Web-Vorschau über eine
 * LAN-IP mit plain http, wirft der Aufruf — ohne Ausweichweg scheiterten dann
 * Anlegen, Bearbeiten und Löschen von Terminen. Die Kennung entsteht dann aus
 * 16 Bytes von `Crypto.getRandomValues`, das auf Web zu
 * `crypto.getRandomValues` wird und auch ohne sicheren Kontext da ist. Bewusst
 * nicht `Crypto.getRandomBytes`: Das füllt im Dev-Build ohne natives
 * Sync-Hook — also gerade in der Web-Vorschau — aus `Math.random`. Wirft auch
 * `getRandomValues`, geht der Fehler weiter, statt auf einen schwachen Zufall
 * auszuweichen.
 *
 * **Warum nicht in `features/`.** Die Module dort laufen unter `bun test`, und
 * `expo-crypto` lädt ein natives Modul, das Bun nicht kennt. `features/` nimmt
 * Kennungen deshalb als Parameter entgegen; erzeugt werden sie hier, an den
 * Aufrufstellen in den Screens.
 */
export function newRequestId(): string {
  try {
    // `unknown`, weil ein Stub (etwa der von jest-expo) still `undefined`
    // liefern kann, statt zu werfen.
    const id: unknown = Crypto.randomUUID();
    if (typeof id === "string" && id !== "") return id;
  } catch {
    // Kein `crypto.randomUUID` (Web ohne sicheren Kontext) — Ausweichweg unten.
  }
  return uuidV4FromRandomValues();
}

/**
 * Eine UUID nach RFC 4122, Version 4: 122 Zufallsbits, dazu vier Bits Version
 * und zwei Bits Variante — dieselbe Form, die `crypto.randomUUID` liefert,
 * klein geschrieben im Muster 8-4-4-4-12.
 */
function uuidV4FromRandomValues(): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4 im oberen Halbbyte von Byte 6
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variante RFC 4122: die obersten Bits von Byte 8 sind 10
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
