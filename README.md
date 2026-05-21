# Eltern Flow AI

KI-gestützter Familien-Organizer für Eltern: gemeinsamer Kalender, Essensplaner
mit Allergie-Berücksichtigung, Sprachassistent, Kinderprofile und Hausaufgaben –
alles an einem Ort.

> **Sprache:** Die App ist primär auf Deutsch. Eine englische Übersetzung ist
> vorhanden und über den Sprachumschalter wählbar.

## Quickstart

```bash
bun install
bun start          # Metro dev server
bun run ios        # iOS Simulator
bun run android    # Android Emulator
bun run web        # Web (schnelles Smoke-Testing)
```

Weitere Skripte:

```bash
bun run typecheck  # tsc --noEmit
bun lint           # ESLint
bun lint:fix       # ESLint --fix
bun format         # Prettier write
bun format:check   # Prettier check
bun test           # Jest (jest-expo)
```

## Wo finde ich was?

- **Bildschirme:** [app-sections/](app-sections/)
- **UI-Komponenten:** [design-system/components/](design-system/components/)
- **Themes & Tokens:** [design-system/](design-system/)
- **Übersetzungen:** [features/i18n/locales/](features/i18n/locales/)
- **Architektur-Doku:** [docs/architecture.md](docs/architecture.md)
- **Entscheidungslog:** [docs/decision-log.md](docs/decision-log.md)
- **Ordnerregeln:** [eltern-flow-ai-project-structure.md](eltern-flow-ai-project-structure.md)
- **Mitwirkungsregeln für Claude:** [CLAUDE.md](CLAUDE.md)

## Aktueller Stand

Dies ist das initiale Scaffold. Enthalten:

- Expo Router mit 5 Tabs (Dashboard, Kalender, Essensplanung, Hausaufgaben,
  Familie)
- Schwebender Sprachassistent-Button (Platzhalter)
- 3 schaltbare Themes (warmLight, softDark, pastelBlue)
- i18n DE/EN
- NativeWind v4 + Tailwind
- Zustand + TanStack Query (verkabelt, noch keine Daten)

Noch **nicht** enthalten: Supabase, Auth, Edamam, Stripe, echtes Voice/LLM,
Push-Benachrichtigungen, Onboarding-Flow. Siehe Decision-Log für die Roadmap.
