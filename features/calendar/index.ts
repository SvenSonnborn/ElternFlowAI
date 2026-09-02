export {
  applyOptimisticChanges,
  canApplyOptimistically,
  isOptimisticEventId,
  patchesOccurrence,
  useOptimisticEvents,
  useOptimisticEventsStore,
  visibleOccurrences,
  withOptimistic,
  OPTIMISTIC_EVENT_ID_PREFIX,
  OPTIMISTIC_TIMEOUT_MS,
  type OptimisticCreate,
  type OptimisticEvent,
  type OptimisticUpdate,
} from "./optimisticEvents";
export { EventNotFoundError, mapEventError, type CalendarErrorKey } from "./errors";
export { setCalendarLocale } from "./locale";
export { useFamilyEvents, useEvent, useEventTypes, useMarkedDates } from "./hooks";
export { buildCalendarTheme } from "./calendarTheme";
export { eventColorFor, eventIconFor, typeLabelsForSlug } from "./palette";
export {
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  recurrenceToRrule,
  rruleToRecurrence,
  parseRecurrenceCount,
  type CreateEventVars,
  type RecurrenceOption,
  type RruleFields,
} from "./mutations";
export {
  applyRangePick,
  isDateRangeInvalid,
  isMultiDay,
  isTimeRangeInvalid,
  rangeFieldLabelKey,
  toAllDayRange,
  type DateRange,
  type RangeField,
} from "./dateRange";
export {
  useEventReminders,
  useToggleReminder,
  REMINDER_OFFSET_1H,
  REMINDER_OFFSET_24H,
  type ToggleReminderVars,
} from "./reminders";
export {
  applyDeleteScope,
  applyEditScope,
  createSupabaseEventOps,
  type EditScope,
  type EventChanges,
  type EventOps,
  type RecurrenceChanges,
} from "./recurrence";
export { toDaySegments, toDayMarkings, type DaySegment } from "./spans";
export { segmentsForDay, segmentTimeLabel } from "./day";
export type { CalendarOccurrence, MarkedDates, MarkedDot, OccurrenceRrule, SpanBar } from "./types";
export {
  hidesOccurrence,
  usePendingEventDeletes,
  withoutPendingDeletes,
  type PendingEventDelete,
} from "./pendingDeletes";
export { calendarInvalidationKeys } from "./realtimeKeys";
export { undoDeleteMessage } from "./undoDeleteMessage";
