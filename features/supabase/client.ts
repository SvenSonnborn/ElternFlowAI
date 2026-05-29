import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import type { Database } from "./database.types";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Supabase ENV fehlt. Setze EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (siehe .env.example). NIE den secret-Key hier verwenden — der bypassed RLS.",
  );
}

// AsyncStorage greift bei `import` direkt auf `window.localStorage` zu, was
// während Expos Static-HTML-Pre-Render (Node, kein window) crasht. In SSR/Node
// liefern wir einen No-Op-Storage; sobald window verfügbar ist (Browser/Native),
// nutzt Supabase wieder die echte Persistenz.
//
// Note: AsyncStorage wird hier weiterhin statisch importiert. Ein dynamisches
// `require()` würde theoretisch die module-eval-Phase entlasten, in der Praxis
// crasht aber nicht der Import selbst, sondern erst der spätere `getItem`-Call,
// der durch den `storage`-Switch unten bereits abgefangen wird. Lazy-Import
// würde zudem Metro-Bundler-Edge-Cases einführen ohne neuen Nutzen, daher
// bewusst verworfen.
const isBrowser = typeof window !== "undefined";
const storage =
  Platform.OS === "web"
    ? isBrowser
      ? (window.localStorage as unknown as typeof AsyncStorage)
      : undefined
    : AsyncStorage;

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    storage,
    autoRefreshToken: isBrowser || Platform.OS !== "web",
    persistSession: isBrowser || Platform.OS !== "web",
    detectSessionInUrl: false,
  },
});
