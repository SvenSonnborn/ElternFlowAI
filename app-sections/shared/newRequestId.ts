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
 * **Grenze auf Web.** Dort reicht `expo-crypto` an `crypto.randomUUID` des
 * Browsers durch, und den gibt es nur in einem sicheren Kontext (https oder
 * localhost). Wer die Web-Vorschau über eine LAN-IP mit plain http öffnet,
 * etwa vom Handy auf den Dev-Rechner, bekommt hier einen Fehler statt einer
 * Kennung — Anlegen, Bearbeiten und Löschen von Terminen scheitern dann.
 *
 * **Warum nicht in `features/`.** Die Module dort laufen unter `bun test`, und
 * `expo-crypto` lädt ein natives Modul, das Bun nicht kennt. `features/` nimmt
 * Kennungen deshalb als Parameter entgegen; erzeugt werden sie hier, an den
 * Aufrufstellen in den Screens.
 */
export function newRequestId(): string {
  return Crypto.randomUUID();
}
