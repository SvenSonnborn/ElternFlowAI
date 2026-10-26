/**
 * Gemeinsamer Unterbau der Integrationstests gegen die lokale Supabase
 * (`bun run test:db`, Spec §9).
 *
 * **Warum eigene Clients statt `@/features/supabase`:** `bun.test.preload.ts`
 * setzt `EXPO_PUBLIC_SUPABASE_URL` absichtlich auf einen `.invalid`-Platzhalter,
 * weil die Shell über mise das LIVE-Projekt tragen kann. Der Modul-Client
 * erreicht in Tests deshalb nie etwas, und das soll so bleiben. Hier wird jeder
 * Client explizit aus `supabase status -o env` gebaut; `.env.local` und
 * `process.env.EXPO_PUBLIC_*` werden nie gelesen.
 *
 * Läuft die lokale Instanz nicht, scheitert der Import laut. Überspringen wäre
 * falsch: Ein grüner Lauf ohne einen einzigen Test sähe aus wie ein bestandener.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

import type { Database } from "@/features/supabase/database.types";

export type Client = SupabaseClient<Database>;

/** Feste IDs aus `supabase/seed.sql` (Kopf der Datei). */
export const SEED = {
  password: "lokal-test-1",
  emailA: "a@test.local",
  emailB: "b@test.local",
  familyId: "f1f1f1f1-0000-4000-8000-000000000001",
  parentA: "aaaaaaaa-0000-4000-8000-000000000011",
  parentB: "bbbbbbbb-0000-4000-8000-000000000011",
  foreignEvent: "e9e9e9e9-0000-4000-8000-000000000001",
  foreignTask: "a9a9a9a9-0000-4000-8000-000000000001",
  foreignFamilyId: "f2f2f2f2-0000-4000-8000-000000000001",
} as const;

const MISSING = "lokale Supabase läuft nicht — `mise exec -- supabase start`";

/** Wie `supabase` hier erreichbar ist: direkt (Shim) oder über mise. */
function statusEnv(): Record<string, string> {
  const attempts: [string, string[]][] = [
    ["supabase", ["status", "-o", "env"]],
    ["mise", ["exec", "--", "supabase", "status", "-o", "env"]],
  ];
  let stdout: string | null = null;
  for (const [cmd, args] of attempts) {
    try {
      stdout = execFileSync(cmd, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      break;
    } catch {
      // nächster Versuch
    }
  }
  if (stdout === null) throw new Error(MISSING);

  const env: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function required(env: Record<string, string>, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${MISSING} (${key} fehlt in \`supabase status -o env\`)`);
  return value;
}

const env = statusEnv();
const apiUrl = required(env, "API_URL");
const publishableKey = env.PUBLISHABLE_KEY || required(env, "ANON_KEY");
const dbUrl = required(env, "DB_URL");
const adminKey = env.SECRET_KEY || required(env, "SERVICE_ROLE_KEY");

// Schutz vor dem Ernstfall: Diese Tests schreiben und löschen Termine. Gegen alles
// außer der eigenen Maschine laufen sie nie.
const host = new URL(apiUrl).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(`Integrationstests laufen nur gegen die lokale Instanz, nicht gegen ${host}`);
}

function plainClient(key: string): Client {
  return createClient<Database>(apiUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Ein Client mit Service-Role-Rechten: umgeht RLS, nur für Vorbereitung und Aufräumen. */
export function adminClient(): Client {
  return plainClient(adminKey);
}

/** Meldet einen Nutzer mit E-Mail und Passwort an; wirft, wenn das scheitert. */
export async function signedInClient(email: string, password = SEED.password): Promise<Client> {
  const client = plainClient(publishableKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Anmeldung als ${email} scheitert: ${error.message}`);
  return client;
}

/**
 * Entfernt die Verbuchungen (`private.event_change_requests`) zu den Terminen
 * `eventIds`.
 *
 * Das Schema `private` ist nicht über die API erreichbar, auch nicht mit dem
 * Service-Role-Schlüssel — deshalb eine direkte Verbindung zur lokalen
 * Datenbank. Nötig ist das Aufräumen, weil `event_id` kein Fremdschlüssel ist:
 * Löscht man die Termine, bleiben die Zeilen stehen. Und sie stehen in der
 * Datenbank, gegen die danach auch `supabase test db` läuft — dessen Test „B
 * sieht keine fremden Verbuchungen" zählt B's sichtbare Zeilen und erwartet 0.
 */
export async function purgeBookings(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const sql = new Bun.SQL(dbUrl);
  try {
    await sql`delete from private.event_change_requests where event_id = any(${sql.array(eventIds, "uuid")})`;
  } finally {
    await sql.close();
  }
}
