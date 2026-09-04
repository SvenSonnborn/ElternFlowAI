import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { confirmDestructive, useConflict, useUndoableDelete } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Text } from "@/design-system/ui";
import { useCurrentParent, useFamilyChildren } from "@/features/auth";
import {
  differingTaskFields,
  emptyTaskForm,
  hasTaskFormErrors,
  mapTaskError,
  TaskConflictError,
  taskToForm,
  toTaskChanges,
  useDeleteTask,
  useTask,
  useTaskTypes,
  useUpdateTask,
  validateTaskForm,
  type TaskChanges,
  type TaskConflictField,
  type TaskFormState,
} from "@/features/tasks";

import { TaskForm } from "./TaskForm";
import { useTaskFormOptions } from "./useTaskFormOptions";

/**
 * Welcher Copy-Key welches Feld benennt — die Beschriftungen, die `TaskForm`
 * ohnehin über den Feldern zeigt. Bewusst keine eigene Copy für den Dialog:
 * ein zweiter Name für dasselbe Feld wäre eine Divergenz, die niemand pflegt.
 */
const FIELD_LABEL_KEY: Record<TaskConflictField, string> = {
  title: "hw.form.fieldTitle",
  subject: "hw.form.fieldSubject",
  description: "hw.form.fieldNotes",
  due_date: "hw.form.fieldDue",
  due_time: "hw.form.fieldDueTime",
  child_id: "hw.form.fieldChild",
  type_id: "hw.form.fieldType",
};

/**
 * Beide Seiten des Vergleichs unter einem Dach: `TaskWithType` (die fremde
 * Fassung) ist auf diese Form zuweisbar, `TaskChanges` ebenfalls — dessen
 * Felder sind optional, die der Zeile nullable.
 */
type TaskFieldSource = Pick<TaskChanges, TaskConflictField>;

export function TaskEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const taskId = id ?? "";
  const { t } = useTranslation();
  const { theme, nativeVars } = useTheme();

  const { data: task, isLoading, error: loadError, refetch } = useTask(taskId);
  const types = useTaskTypes();
  const { data: parent } = useCurrentParent();
  const { data: children } = useFamilyChildren(parent?.family_id);
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const undoableDelete = useUndoableDelete();
  const conflict = useConflict();

  const [state, setState] = useState<TaskFormState>(() => emptyTaskForm(new Date()));
  const [hydrated, setHydrated] = useState(false);

  if (task && !hydrated) {
    setState(taskToForm(task));
    setHydrated(true);
  }

  // Written as a copy-then-assign rather than `{ ...prev, [key]: value }`:
  // a computed key with a generic type widens the spread's inferred type and
  // TypeScript stops seeing it as a TaskFormState.
  function handleChange<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setState((prev) => {
      const next: TaskFormState = { ...prev };
      next[key] = value;
      return next;
    });
  }

  const { typeItems, childOptions } = useTaskFormOptions(types.data, children);

  const errors = validateTaskForm(state);
  const canSave = hydrated && !hasTaskFormErrors(errors) && !updateMutation.isPending;

  // No history to fall back to on a cold-start deep link straight to
  // `/task/edit/[id]` — `router.back()` alone would strand the sheet with no
  // way out.
  function goBackOrToTasks() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/aufgaben");
  }

  function onSave() {
    const changes = toTaskChanges(state);
    if (!changes || !taskId || !task || updateMutation.isPending) return;
    submit({ taskId, changes, baseVersion: task.updated_at });
  }

  /**
   * Der eine Schreibpfad — auch der Wiederholungsversuch aus dem Dialog läuft
   * hierdurch, damit er dieselbe Behandlung bekommt und erneut kollidieren
   * kann.
   *
   * `mutate` mit Per-Call-Callbacks statt `mutateAsync` mit eigenem `catch`:
   * Anders als das Kalender-Sheet bleibt dieser Screen bis zum Erfolg montiert,
   * TanStack ruft die Callbacks also. Alles außer dem Konflikt meldet weiterhin
   * die Inline-Zeile unter dem Formular (`updateMutation.error`) — ein Toast
   * wäre ein zweiter Kanal für dieselbe Sache.
   */
  function submit(vars: Parameters<typeof updateMutation.mutate>[0]) {
    updateMutation.mutate(vars, {
      onSuccess: goBackOrToTasks,
      onError: (err: unknown) => {
        if (err instanceof TaskConflictError) showConflict(err, vars);
      },
    });
  }

  /**
   * Öffnet den Vergleich — oder speichert stillschweigend durch.
   *
   * Weicht inhaltlich nichts ab, gibt es nichts zu entscheiden: Jemand hat
   * dasselbe geändert, oder ein Feld, das dieser Nutzer gar nicht angefasst
   * hat. Ein Dialog wäre dann nur im Weg (ADR-031).
   *
   * Der Wiederholungsversuch nimmt die **frische** Version der fremden Fassung
   * als Basis — kein `force`-Flag, kein Bypass.
   *
   * Umschließt den Rumpf mit `try`/`catch` (Lehre aus Task 8): Ein Wurf hier
   * — etwa `differingTaskFields` an einer unerwarteten Zeile oder `t()` an
   * einem fehlenden Key — liefe sonst als unbehandelte Ablehnung durch
   * TanStacks eigenen `try`/`catch` um den Per-Call-`onError`-Aufruf
   * (`MutationObserver#notify`, `Promise.reject(e)` ohne `.catch()`). Anders
   * als im Kalender-Sheet braucht der `catch`-Zweig hier **keinen** Fallback-
   * Toast: `updateMutation.error` trägt zu diesem Zeitpunkt schon den
   * `TaskConflictError`, der `showConflict` überhaupt erst aufgerufen hat —
   * TanStack setzt den Fehlerstatus, bevor es den Per-Call-`onError` ruft —,
   * die Inline-Zeile unter dem Formular zeigt ihn also bereits. Nicht
   * navigieren genügt.
   */
  function showConflict(err: TaskConflictError, vars: Parameters<typeof updateMutation.mutate>[0]) {
    try {
      const theirs = err.row;
      const fields = differingTaskFields(theirs, vars.changes);
      if (fields.length === 0) {
        submit({ ...vars, baseVersion: theirs.updated_at });
        return;
      }

      conflict.show({
        title: t("conflict.title"),
        body: t("conflict.body.task"),
        rows: fields.map((field) => ({
          label: t(FIELD_LABEL_KEY[field]),
          theirs: `${t("conflict.theirs")}: ${formatTaskField(field, theirs)}`,
          mine: `${t("conflict.mine")}: ${formatTaskField(field, vars.changes)}`,
        })),
        keepMineLabel: t("conflict.keepMine"),
        keepTheirsLabel: t("conflict.keepTheirs"),
        onKeepMine: () => {
          submit({ ...vars, baseVersion: theirs.updated_at });
        },
      });

      // Verlässt den Screen bewusst schon hier, nicht erst wenn der Nutzer
      // eine Wahl trifft: `onSettled` hat `task.updated_at` längst auf den
      // neuen Serverstand gesetzt, das Formular hydriert aber nur einmal
      // (`if (task && !hydrated)`) und trägt weiterhin die veralteten
      // Eingaben. Bliebe der Screen offen, würde ein zweiter Tap auf
      // „Speichern" mit frischer `baseVersion` anstandslos durchgehen — das
      // CAS träfe, und `toTaskChanges`s voller Feldsatz überschriebe die
      // fremde Änderung vollständig und lautlos, genau das Überschreiben,
      // gegen das dieses Feature gebaut ist, nur einen Klick später. Der
      // Dialog lebt im Root-Layout (`ConflictDialogHost`) und überlebt den
      // Screenwechsel: „Deine Fassung speichern" schickt aus der Closure von
      // `onKeepMine` weiter, „Andere Fassung behalten" schließt nur noch den
      // Dialog (`ConflictDialogHost.onKeepTheirs` kennt diesen Screen gar
      // nicht mehr).
      //
      // Nebenwirkung, geprüft: Der Wiederholungsversuch aus `onKeepMine`
      // läuft damit nach dem Unmount. `submit`s Per-Call-`onSuccess` und
      // `onError` feuern dann nicht mehr (siehe
      // `mutateAsyncSurvivesUnmount.test.ts`) — ein erneuter Erfolg navigiert
      // also kein zweites Mal (unproblematisch, der Screen ist schon zu und
      // die Liste aktualisiert sich ohnehin über `useUpdateTask`s
      // Hook-Level-`onSettled`), aber eine dritte Kollision genau in diesem
      // Fenster öffnet keinen zweiten Dialog mehr und bleibt ohne
      // Fehlermeldung. Selten (verlangt eine dritte Schreiboperation
      // zwischen Dialog und Retry) — siehe `docs/TODO.md`.
      goBackOrToTasks();
    } catch {
      // Nicht navigieren, nichts weiter tun: Die Inline-Zeile unter dem
      // Formular zeigt bereits den `TaskConflictError`, der diesen Aufruf
      // ausgelöst hat (siehe Docstring oben) — ein zweiter Kanal wie im
      // Kalender-Sheet (dort ein Fallback-Toast) bräuchte einen Toast, den
      // dieser Screen bewusst nicht hat.
    }
  }

  /**
   * Ein Feldwert, wie er im Vergleich lesbar ist.
   *
   * Kind und Aufgabentyp sind Fremdschlüssel — verglichen wird auf der Id
   * (`differingTaskFields`), angezeigt der Name aus den Listen, die die
   * Formular-Picker ohnehin schon halten. `due_date` bleibt als `YYYY-MM-DD`
   * stehen: unmissverständlich, und dieser Screen zieht sonst kein date-fns
   * herein.
   */
  function formatTaskField(field: TaskConflictField, source: TaskFieldSource): string {
    switch (field) {
      case "child_id":
        return (
          childOptions.find((option) => option.id === source.child_id)?.name ?? t("hw.form.noChild")
        );
      case "type_id":
        return typeItems.find((item) => item.id === source.type_id)?.label ?? "—";
      case "due_time":
        return source.due_time?.slice(0, 5) || "—";
      case "due_date":
        return source.due_date || "—";
      case "title":
        return source.title?.trim() || "—";
      case "subject":
        return source.subject?.trim() || "—";
      case "description":
        return source.description?.trim() || "—";
    }
  }

  async function onDelete() {
    if (!taskId || !task) return;
    const confirmed = await confirmDestructive({
      title: t("hw.delete.confirmTitle"),
      body: t("hw.delete.confirmBody"),
      confirm: t("hw.delete.confirmOk"),
      cancel: t("action.cancel"),
    });
    if (!confirmed) return;
    // Erst planen, dann navigieren: der Toast überlebt den Screenwechsel, weil
    // der Store auf Modulebene liegt. Der Screen ist weg, bevor die Mutation
    // feuert — deshalb `mutateAsync` ohne Per-Call-Callbacks.
    undoableDelete({
      kind: "task",
      target: { taskId },
      title: t("hw.delete.undoTitle"),
      message: task.title,
      run: () => deleteMutation.mutateAsync({ taskId }),
      errorTitle: t("hw.delete.error"),
      formatError: (err) => t(mapTaskError(err)),
    });
    goBackOrToTasks();
  }

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.card }, nativeVars]}
      className="flex-1 bg-card"
    >
      <Stack.Screen options={{ contentStyle: { flex: 1, backgroundColor: theme.card } }} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-24 w-full rounded-2xl" style={{ backgroundColor: theme.cardSubtle }} />
        </View>
      ) : loadError && !task && !hydrated ? (
        // A failed `useFamilyTasks` load and a genuinely-missing task both
        // resolve `task` to `undefined` here — without this branch a cold-start
        // deep link while offline would render "task not found" instead of
        // "couldn't load", with no way back in but a retry.
        <View className="flex-1 items-center justify-center px-6">
          <Card className="w-full items-start gap-2">
            <Text variant="bodyEmph">{t("hw.loadError")}</Text>
            <Text variant="caption" tone="inkSecondary">
              {t(mapTaskError(loadError))}
            </Text>
            {/* Default size (md, h-11) on purpose — `sm` is h-9 and would fall
                below the 44×44 touch target. */}
            <Button label={t("action.retry")} variant="soft" onPress={refetch} />
          </Card>
        </View>
      ) : !task && !hydrated ? (
        // `!task` alone would also fire mid-delete: the mutation's onMutate
        // optimistically removes the row from the same cache `useTask` reads,
        // well before `onSuccess` navigates away. `hydrated` (set once real
        // data has populated `state`) tells the two apart — a task that was
        // never there keeps `hydrated` false, one being deleted does not.
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="listTitle" tone="danger">
            {t("hw.notFound")}
          </Text>
          <View className="mt-4">
            {/* The state this button appears in is reached by deep link more
                often than by navigation, and a cold start has no history —
                `router.back()` alone would leave the user stuck here. */}
            <Button label={t("action.back")} variant="soft" onPress={goBackOrToTasks} />
          </View>
        </View>
      ) : (
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
            <Text variant="h2">{t("hw.edit.title")}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("action.cancel")}
              onPress={goBackOrToTasks}
              className="px-2 py-1 active:opacity-70"
              hitSlop={12}
            >
              <Text variant="bodyEmph" tone="inkSecondary">
                {t("action.cancel")}
              </Text>
            </Pressable>
          </View>

          <TaskForm
            state={state}
            onChange={handleChange}
            types={typeItems}
            childOptions={childOptions}
            errors={{
              title: errors.title ? t(errors.title) : undefined,
              typeId: errors.typeId ? t(errors.typeId) : undefined,
              dueDate: errors.dueDate ? t(errors.dueDate) : undefined,
            }}
          />

          {updateMutation.error ? (
            <Text variant="caption" tone="danger">
              {t(mapTaskError(updateMutation.error))}
            </Text>
          ) : null}

          <View
            style={{ marginTop: 12, paddingTop: 18, borderTopWidth: 1, borderTopColor: theme.line }}
          >
            <Button
              block
              label={updateMutation.isPending ? t("hw.edit.saving") : t("hw.edit.save")}
              tone="primary"
              disabled={!canSave}
              onPress={onSave}
            />
            <View className="mt-3">
              <Button
                block
                variant="soft"
                tone="danger"
                label={t("hw.delete.confirmOk")}
                disabled={updateMutation.isPending}
                onPress={() => void onDelete()}
              />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
