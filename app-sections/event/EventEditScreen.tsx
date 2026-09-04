import { addDays, format, max as dateMax, min as dateMin, parseISO } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DateTimePickerSheet, Field, useConflict, useToast } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import {
  applyRangePick,
  differingEventFields,
  EventConflictError,
  expandEvents,
  isDateRangeInvalid,
  isTimeRangeInvalid,
  mapEventError,
  occurrenceVersion,
  parseRecurrenceCount,
  rangeFieldLabelKey,
  toAllDayRange,
  recurrenceToRrule,
  rruleToRecurrence,
  useEvent,
  useUpdateEvent,
  type CalendarOccurrence,
  type DateRange,
  type EditScope,
  type EventConflictField,
  type RangeField,
  type RecurrenceChanges,
  type RecurrenceOption,
} from "@/features/calendar";

import { RecurrenceCountField } from "./RecurrenceCountField";
import { RecurrenceRadio } from "./RecurrenceRadio";
import { pickScope } from "./scopeDialog";
import { createSubmitLock } from "./submitLock";

/** Welcher Copy-Key welches Feld benennt — die Beschriftungen des Formulars. */
const FIELD_LABEL_KEY: Record<EventConflictField, string> = {
  title: "cal.edit.fieldTitle",
  start_at: "cal.edit.fieldStart",
  end_at: "cal.edit.fieldEnd",
  location: "cal.edit.fieldLocation",
  description: "cal.edit.fieldNotes",
};

export function EventEditScreen() {
  const { id, occ } = useLocalSearchParams<{ id?: string; occ?: string }>();
  const { t, i18n } = useTranslation();
  const { theme, nativeVars } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";
  const dateLocale = lang === "de" ? deLocale : enLocale;

  const { data: occurrence, isLoading } = useEvent(id ?? "", occ);
  const { show } = useToast();
  const conflict = useConflict();
  const updateMutation = useUpdateEvent();
  // Siehe `submitLock.ts`: sperrt einen zweiten Tap auf „Speichern" während
  // der Schließanimation nach `router.back()`, in der der Button noch
  // bedienbar bleibt. `useRef` statt `useState`, damit die Sperre synchron
  // beim ersten Tap greift statt erst mit dem nächsten Render.
  const submitLock = useRef(createSubmitLock()).current;

  const initial = useMemo(() => {
    if (!occurrence) return null;
    // The weekday check in `rruleToRecurrence` runs against this occurrence's
    // start rather than the master's dtstart — equivalent here, because a
    // byweekday rule only ever yields occurrences on the days it names.
    const rrule = occurrence.rrule;
    return {
      title: occurrence.title,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      location: occurrence.location ?? "",
      notes: occurrence.description ?? "",
      recurrence: rruleToRecurrence(
        {
          rrule_freq: rrule.freq,
          rrule_interval: rrule.interval,
          rrule_byweekday: rrule.byweekday,
        },
        occurrence.startAt,
      ),
      countText: rrule.count == null ? "" : String(rrule.count),
      // Mitgeführt, damit sie zusammen mit dem Rest bei der Hydration
      // eingefroren werden kann — siehe `baseVersion` unten.
      version: occurrence.version,
    };
  }, [occurrence]);

  const [title, setTitle] = useState("");
  const [range, setRange] = useState<DateRange>(() => ({ startAt: new Date(), endAt: new Date() }));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceOption>("none");
  const [countText, setCountText] = useState("");
  const [picker, setPicker] = useState<RangeField | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Invariante: `baseVersion` ist die Version, aus der der Formular-State
  // entstanden ist — nicht die neueste, die `useEvent` gerade führt. Nicht
  // offensichtlich, weil die Query weiterlebt (30s `staleTime`,
  // Default-`refetchOnMount`/`-WindowFocus`/`-Reconnect` auf Web), das
  // Formular aber nur einmal hydriert (`if (initial && !hydrated)` unten):
  // Ein Refetch, der Millisekunden nach der Hydration landet — der übliche
  // Fall, nicht der seltene —, schiebt `occurrence.version` weiter, ohne
  // dass Titel/Zeiten/Ort/Notizen mitziehen. Läse `onSave` die Version
  // direkt aus der lebenden Query statt aus diesem eingefrorenen Wert,
  // träfe das CAS beim Speichern anstandslos, obwohl das Formular noch die
  // alten Eingaben trägt — der Guard erkennte dann exakt die
  // Fremdänderung nicht, gegen die er gebaut ist. Der Wiederholungsversuch
  // aus dem Dialog (`showConflict`) ist davon ausgenommen: der berechnet
  // bewusst die frische Version aus `theirs`/`err.row`.
  const [baseVersion, setBaseVersion] = useState<string | null>(null);
  // Dieselbe Invariante, derselbe Moment: `baseOccurrence` ist die Occurrence,
  // aus der der Formular-State entstanden ist — nicht die, die `useEvent`
  // gerade führt. Sie gehört neben `baseVersion`, weil beide denselben Stand
  // beschreiben und nicht auseinanderlaufen dürfen. `differingEventFields`
  // braucht sie als `base`, um eigene Änderungen (mein Formular weicht von
  // `theirs` ab, weil *ich* etwas geändert habe) von echten Konflikten
  // (`theirs` weicht von *dieser* Basis ab) zu unterscheiden — siehe
  // `conflict.ts`.
  const [baseOccurrence, setBaseOccurrence] = useState<CalendarOccurrence | null>(null);
  const { startAt, endAt } = range;

  if (initial && !hydrated) {
    setTitle(initial.title);
    setRange({ startAt: initial.startAt, endAt: initial.endAt });
    setLocation(initial.location);
    setNotes(initial.notes);
    setRecurrence(initial.recurrence ?? "none");
    setCountText(initial.countText);
    setBaseVersion(initial.version);
    setBaseOccurrence(occurrence ?? null);
    setHydrated(true);
  }

  // `null` means the stored rule is outside the five V1 options (yearly, every
  // n-th week, an arbitrary weekday set). Showing the radio would rewrite it on
  // save, so the editor stays hidden and the rule is left alone.
  const recurrenceEditable = initial?.recurrence != null;
  const recurrenceDirty =
    recurrenceEditable &&
    (recurrence !== initial.recurrence ||
      (recurrence !== "none" && countText.trim() !== initial.countText));

  // All-day is not editable here (the create form owns that switch), but it must
  // still be respected: an all-day event carries synthetic 00:00/23:59 times, so
  // editing them freely would desync `start_at`/`end_at` from `all_day`.
  const allDay = occurrence?.allDay ?? false;

  const titleError = !title.trim() ? t("cal.edit.error.titleRequired") : "";
  const dateError = isDateRangeInvalid(range) ? t("cal.edit.error.invalidDateRange") : "";
  const timeError =
    !dateError && isTimeRangeInvalid(range, allDay) ? t("cal.edit.error.invalidTimeRange") : "";
  const parsedCount = recurrence === "none" ? null : parseRecurrenceCount(countText);
  const countError = parsedCount === "invalid" ? t("cal.create.error.invalidCount") : "";
  const canSave = hydrated && !titleError && !dateError && !timeError && !countError;

  /**
   * The series rule, rebuilt from the radio. `null` when the user left the
   * recurrence untouched — the update then keeps the stored rule verbatim.
   */
  function buildRecurrenceChanges(): RecurrenceChanges | null {
    if (!recurrenceDirty || parsedCount === "invalid") return null;
    if (recurrence === "none") {
      return {
        rrule_freq: null,
        rrule_interval: 1,
        rrule_byweekday: null,
        rrule_count: null,
        rrule_until: null,
      };
    }
    const rule = recurrenceToRrule(recurrence, startAt);
    return {
      ...rule,
      rrule_count: parsedCount,
      // COUNT and UNTIL are mutually exclusive (`events_rrule_count_xor_until`).
      // A stored UNTIL — e.g. from an earlier forward-delete — survives only as
      // long as no count replaces it.
      rrule_until: parsedCount == null ? (occurrence?.rrule.until ?? null) : null,
    };
  }

  /**
   * Ein Feldwert, wie er im Vergleich lesbar ist. `—` für „nicht gesetzt".
   *
   * `source` deckt sowohl eine fremde `CalendarOccurrence` als auch das aus
   * `vars.changes` gebaute Objekt der eigenen Eingabe ab — beide tragen
   * dieselben fünf Felder, nur unter anderen Typen (`Date` vs. ISO-String für
   * die Zeiten kommt hier schon aufgelöst als `Date` an).
   */
  function formatField(
    field: EventConflictField,
    source: {
      title: string;
      startAt: Date;
      endAt: Date;
      location: string | null;
      description: string | null;
    },
  ): string {
    switch (field) {
      case "title":
        return source.title || "—";
      case "start_at":
        return format(source.startAt, "E, d. MMM yyyy, HH:mm", { locale: dateLocale });
      case "end_at":
        return format(source.endAt, "E, d. MMM yyyy, HH:mm", { locale: dateLocale });
      case "location":
        return source.location?.trim() || "—";
      case "description":
        return source.description?.trim() || "—";
    }
  }

  /**
   * Schickt die Mutation und meldet einen Fehlschlag selbst.
   *
   * Bewusst `mutateAsync` mit eigenem `catch` statt eines Per-Call-`onError`:
   * Das Sheet ist unmontiert, bevor der Server antwortet, und TanStack Query
   * ruft Per-Call-Callbacks dann nicht mehr — festgehalten in
   * `features/tasks/mutateAsyncSurvivesUnmount.test.ts`. Genau deshalb geht der
   * Konflikt-Fall in den Store und nicht in lokalen State: Dieser `catch` ist
   * eine Closure und überlebt den Unmount, ein `useState` nicht (ADR-031).
   *
   * Die Retry-Aktion schickt dieselben `vars` erneut, damit der Rollback dem
   * Nutzer nicht die Eingaben nimmt.
   *
   * Eine Funktionsdeklaration statt `useCallback`, damit sie sich in der
   * Retry-Aktion selbst aufrufen kann — und weil der Screen seine übrigen
   * Handler (`onSave`) genauso deklariert.
   */
  function save(vars: Parameters<typeof updateMutation.mutateAsync>[0]) {
    updateMutation.mutateAsync(vars).catch((err: unknown) => {
      if (err instanceof EventConflictError) {
        showConflict(err, vars);
        return;
      }
      show({
        title: t("cal.edit.error.saveFailed"),
        message: t(mapEventError(err)),
        variant: "error",
        position: "bottom",
        action: {
          label: t("action.retry"),
          onPress: () => {
            save(vars);
          },
        },
      });
    });
  }

  /**
   * Öffnet den Vergleich — oder speichert stillschweigend durch.
   *
   * Weicht inhaltlich nichts ab, gibt es nichts zu entscheiden: Jemand hat
   * dasselbe geändert, oder etwas, das dieser Nutzer gar nicht angefasst hat.
   * Ein Dialog wäre dann nur im Weg (ADR-031). Der Wiederholungsversuch nimmt
   * die **frische** Version als Basis — kein `force`-Flag, kein Bypass: Er kann
   * erneut kollidieren, wenn ein Dritter dazwischenschreibt.
   *
   * Läuft synchron im `.catch()` von `save()` — ein Wurf hier (z. B.
   * `expandEvents` an einer kaputten RRULE-Zeile, oder `format` an einem
   * ungültigen `Date`) ließe die daraus entstehende Promise unbehandelt: Es
   * gibt weder einen `unhandledrejection`-Handler noch eine ErrorBoundary,
   * und das Sheet ist längst zu. Der Nutzer sähe dann **weder Dialog noch
   * Toast** — schlimmer als jeder andere Fehlerfall in diesem Screen, weil
   * selbst der Retry-Toast ausbliebe. Der `try`/`catch` fängt das mit
   * demselben Fehler-Toast auf, den `save()` sonst zeigt.
   */
  function showConflict(
    err: EventConflictError,
    vars: Parameters<typeof updateMutation.mutateAsync>[0],
  ) {
    try {
      // Kein `row` heißt: der Compare-and-Swap hat den Konflikt erkannt, ohne
      // die fremde Fassung zu kennen. Dann steht der Dialog ohne
      // Vergleichszeilen und ohne frische Version — siehe `docs/TODO.md`.
      const row = err.row;
      let theirs: CalendarOccurrence | null = null;
      if (row) {
        // Fenster wie `useEvent` (`features/calendar/hooks.ts`): an der Zeile
        // selbst verankert und um das angeforderte Datum geweitet — nicht an
        // den geänderten Eingabewerten aus `vars.changes`. Sonst fiele jede
        // Verschiebung des Termins um mehr als seine eigene Dauer (ein
        // anderer Tag, mehrere Stunden) aus dem Fenster, und `theirs` würde
        // `null`, obwohl die fremde Fassung bekannt ist — ausgerechnet beim
        // häufigsten echten Konfliktfall („wir haben beide verschoben").
        // Dieselbe Begründung wie dort: eine weit in der Zukunft liegende
        // Occurrence (>1 Jahr) würde sonst abgeschnitten.
        const rowStart = new Date(row.start_at);
        const requested = parseISO(vars.occurrenceDate);
        const windowStart = dateMin([addDays(rowStart, -1), requested]);
        const windowEnd = dateMax([addDays(rowStart, 366), requested]);
        theirs =
          expandEvents([row], windowStart, windowEnd, theme).find(
            (o) => o.occurrenceDate === vars.occurrenceDate,
          ) ?? null;
      }

      // Fehlt `baseOccurrence` (theoretisch: der Konflikt trifft vor der
      // Hydration ein), bleibt `fields` leer — aber der Guard darunter prüft
      // `baseOccurrence` zusätzlich zu `fields.length === 0`, damit eine
      // fehlende Basis nicht denselben Weg nimmt wie ein echtes „niemand hat
      // etwas geändert". Ohne Basis lässt sich das gar nicht feststellen, also
      // muss der Dialog erscheinen — ohne Zeilen, aber sichtbar. Genau die
      // Überlegung, die den `row === null`-Fall (`theirs === null`) schon
      // heute in den Dialog statt ins Durchspeichern schickt.
      const fields =
        theirs && baseOccurrence ? differingEventFields(theirs, vars.changes, baseOccurrence) : [];
      if (theirs && baseOccurrence && fields.length === 0) {
        save({ ...vars, baseVersion: theirs.version });
        return;
      }

      const mineSource = {
        title: vars.changes.title,
        startAt: new Date(vars.changes.start_at),
        endAt: new Date(vars.changes.end_at),
        location: vars.changes.location,
        description: vars.changes.description,
      };

      conflict.show({
        title: t("conflict.title"),
        body: t("conflict.body.event"),
        rows:
          theirs === null
            ? []
            : fields.map((field) => ({
                label: t(FIELD_LABEL_KEY[field]),
                theirs: `${t("conflict.theirs")}: ${formatField(field, theirs)}`,
                mine: `${t("conflict.mine")}: ${formatField(field, mineSource)}`,
              })),
        keepMineLabel: t("conflict.keepMine"),
        keepTheirsLabel: t("conflict.keepTheirs"),
        onKeepMine: () => {
          save({
            ...vars,
            // `theirs` fehlt entweder, weil die fremde Fassung außerhalb des
            // Fensters lag, oder weil der CAS-Fall (`row === null`) sie gar
            // nicht kennt. Im ersten Fall ist `row` trotzdem da — die frische
            // Version lässt sich dann direkt berechnen, ohne erneut zu
            // expandieren. **Nur** wenn auch `row` fehlt, bleibt die alte
            // `vars.baseVersion` übrig: Es gibt nichts Frischeres, dieser
            // Versuch kollidiert dann erneut, bis der nächste Refetch durch
            // ist (siehe `docs/TODO.md`) — anders als vorher fällt der
            // Normalfall (Fenster hätte `theirs` sonst gefunden, `row`
            // bekannt) aber nicht mehr auf denselben toten Wert zurück.
            baseVersion:
              theirs?.version ??
              (row ? occurrenceVersion(row, vars.occurrenceDate) : vars.baseVersion),
          });
        },
      });
    } catch (renderErr) {
      show({
        title: t("cal.edit.error.saveFailed"),
        message: t(mapEventError(renderErr)),
        variant: "error",
        position: "bottom",
        action: {
          label: t("action.retry"),
          onPress: () => {
            save(vars);
          },
        },
      });
    }
  }

  // Kein Verlauf bei einem Kaltstart-Deep-Link direkt auf `/event/edit/[id]` —
  // `router.back()` allein täte dann nichts und das Sheet bliebe hängen.
  // Dasselbe Muster wie `goBackOrToTasks` in `TaskEditScreen.tsx`, mit dem
  // Kalender-Tab statt dem Aufgaben-Tab als Ziel.
  function goBackOrToKalender() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/kalender");
  }

  async function onSave() {
    if (!occurrence || !canSave || baseVersion == null) return;
    // `updateMutation.isPending` kommt hier zu spät (siehe `submitLock.ts`):
    // Ein zweiter Tap während der Schließanimation hat real einen zweiten,
    // identischen Termin angelegt (dort beim Anlegen — hier dasselbe Loch
    // beim Bearbeiten). `tryLock()` prüft synchron, ob bereits ein Speichern
    // läuft, und bricht in diesem Fall folgenlos ab.
    if (!submitLock.tryLock()) return;
    const isRecurring = occurrence.isRecurring;
    const recurrenceChanges = buildRecurrenceChanges();
    let scope: EditScope = "all";
    // A rule change redefines the series, so there is nothing to scope: asking
    // "just this one?" about a new repeat pattern has no coherent answer.
    if (isRecurring && !recurrenceChanges) {
      const labels = {
        title: t("cal.scope.title"),
        this: t("cal.scope.this"),
        forward: t("cal.scope.forward"),
        all: t("cal.scope.all"),
        cancel: t("action.cancel"),
      };
      const chosen = await pickScope(labels);
      if (!chosen) {
        // Abbruch **vor** dem eigentlichen Speichern: anders als beim
        // Fehler-Retry im Toast (der das Sheet nie wieder erreicht) kann der
        // Nutzer hier sofort erneut auf „Speichern" tippen, die Sperre muss
        // also wieder frei sein.
        submitLock.unlock();
        return;
      }
      scope = chosen;
    }
    // Re-snap rather than trust the state: the date pickers can move an all-day
    // event across days, and its times must stay 00:00 → 23:59.
    const final = allDay ? toAllDayRange(range) : range;
    const vars = {
      scope,
      eventId: occurrence.eventId,
      occurrenceDate: occurrence.occurrenceDate,
      isRecurring,
      changes: {
        title: title.trim(),
        start_at: final.startAt.toISOString(),
        end_at: final.endAt.toISOString(),
        location: location.trim() || null,
        description: notes.trim() || null,
      },
      recurrence: recurrenceChanges,
      baseVersion,
    };
    // Sofort schließen: Die Änderung steht dank `onMutate` schon im Kalender.
    goBackOrToKalender();
    void save(vars);
  }

  // The sheet is range-agnostic now: which end of the range is being edited is
  // calendar knowledge and stays here.
  const pickerMode = picker === null ? null : picker.endsWith("Date") ? "date" : "time";
  const pickerValue = picker === "endDate" || picker === "endTime" ? endAt : startAt;

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen
        options={{
          contentStyle: { flex: 1, backgroundColor: theme.card },
        }}
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-24 w-full rounded-2xl" style={{ backgroundColor: theme.cardSubtle }} />
        </View>
      ) : !occurrence ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="listTitle" tone="danger">
            {t("cal.edit.title")}
          </Text>
          <View className="mt-4">
            <Button label={t("cal.detail.close")} variant="soft" onPress={goBackOrToKalender} />
          </View>
        </View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1, backgroundColor: theme.card }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 4,
              paddingBottom: 24,
              gap: 14,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-row items-center justify-between pb-3 pt-4">
              <Text variant="h2">{t("cal.edit.title")}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("action.cancel")}
                onPress={goBackOrToKalender}
                className="px-2 py-1 active:opacity-70"
                hitSlop={12}
              >
                <Text variant="bodyEmph" tone="inkSecondary">
                  {t("action.cancel")}
                </Text>
              </Pressable>
            </View>

            <Field
              label={t("cal.edit.fieldTitle")}
              value={title}
              onChangeText={setTitle}
              error={titleError}
            />

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field
                  label={t("cal.edit.fieldStartDate")}
                  iconName="calendar"
                  value={format(startAt, "E, d. MMM yyyy", { locale: dateLocale })}
                  onPress={() => setPicker("startDate")}
                />
              </View>
              <View className="flex-1">
                <Field
                  label={t("cal.edit.fieldEndDate")}
                  iconName="calendar"
                  value={format(endAt, "E, d. MMM yyyy", { locale: dateLocale })}
                  onPress={() => setPicker("endDate")}
                  error={dateError}
                />
              </View>
            </View>

            <View
              className="flex-row gap-3"
              pointerEvents={allDay ? "none" : "auto"}
              style={{ opacity: allDay ? 0.4 : 1 }}
            >
              <View className="flex-1">
                <Field
                  label={t("cal.edit.fieldStart")}
                  iconName="clock"
                  value={allDay ? "—" : format(startAt, "HH:mm")}
                  onPress={allDay ? undefined : () => setPicker("startTime")}
                />
              </View>
              <View className="flex-1">
                <Field
                  label={t("cal.edit.fieldEnd")}
                  iconName="clock"
                  value={allDay ? "—" : format(endAt, "HH:mm")}
                  onPress={allDay ? undefined : () => setPicker("endTime")}
                  error={allDay ? undefined : timeError}
                />
              </View>
            </View>

            <Field
              label={t("cal.edit.fieldLocation")}
              iconName="map-pin"
              value={location}
              onChangeText={setLocation}
              placeholder="—"
            />

            <Field
              label={t("cal.edit.fieldNotes")}
              value={notes}
              onChangeText={setNotes}
              type="multiline"
              placeholder="—"
            />

            {recurrenceEditable ? (
              <>
                <RecurrenceRadio
                  label={t("cal.create.fieldRecurrence")}
                  value={recurrence}
                  onChange={setRecurrence}
                />

                {recurrence !== "none" ? (
                  <RecurrenceCountField
                    value={countText}
                    onChangeText={setCountText}
                    error={countError}
                  />
                ) : null}

                {recurrenceDirty ? (
                  <View className="rounded-xl bg-warning-soft px-3 py-2">
                    <Text variant="caption" tone="accentStrong">
                      {t("cal.edit.recurrenceAppliesToAll")}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}

            <View
              style={{
                marginTop: 12,
                paddingTop: 18,
                borderTopWidth: 1,
                borderTopColor: theme.line,
              }}
            >
              <Button
                block
                label={t("cal.edit.save")}
                tone="primary"
                disabled={!canSave}
                onPress={() => void onSave()}
              />
            </View>
          </ScrollView>

          <DateTimePickerSheet
            mode={pickerMode}
            value={pickerValue}
            accessibilityLabel={picker ? t(rangeFieldLabelKey(picker)) : ""}
            onPick={(selected) => {
              if (picker) setRange((prev) => applyRangePick(prev, picker, selected));
            }}
            onClose={() => setPicker(null)}
          />
        </>
      )}
    </SafeAreaView>
  );
}
