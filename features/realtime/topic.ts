/**
 * Der Kanal ist **familienweit**, nicht kalenderspezifisch (ADR-030 Decision 2):
 * ein WebSocket-Abo und eine RLS-Policy für alle Features statt je eines pro
 * Feature. Aufgaben und Essen anzuschließen heißt später, einen Trigger zu
 * setzen und einen Mapper zu registrieren — der Topic-Name bleibt.
 */
export const FAMILY_CHANNEL_PREFIX = "family";

/**
 * Baut den Topic-Namen des privaten Familien-Kanals.
 *
 * Muss zeichengleich zum Topic aus `public.broadcast_family_change()` sein
 * (`supabase/migrations/20260902065203_realtime_family_broadcast.sql`); die
 * RLS-Policy auf `realtime.messages` vergleicht ihn wörtlich.
 */
export function familyTopic(familyId: string): string {
  return `${FAMILY_CHANNEL_PREFIX}:${familyId}`;
}
