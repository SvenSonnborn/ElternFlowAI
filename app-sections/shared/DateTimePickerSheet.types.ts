export type DateTimePickerMode = "date" | "time";

export interface DateTimePickerSheetProps {
  /** `null` renders nothing — the caller's "no picker open" state. */
  mode: DateTimePickerMode | null;
  /** The value the picker opens on. */
  value: Date;
  onPick: (selected: Date) => void;
  onClose: () => void;
}
