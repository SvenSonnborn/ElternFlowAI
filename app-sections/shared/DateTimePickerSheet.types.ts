export type DateTimePickerMode = "date" | "time";

export interface DateTimePickerSheetProps {
  /** `null` renders nothing — the caller's "no picker open" state. */
  mode: DateTimePickerMode | null;
  /** The value the picker opens on. */
  value: Date;
  /**
   * Names the field being edited. Required because the web sheet renders a
   * bare `<input>` with no visible label of its own — without this a screen
   * reader announces only "date" or "time", with no way to tell a start from
   * an end. The native branches show OS dialogs that carry their own naming,
   * so only the web implementation reads it.
   */
  accessibilityLabel: string;
  onPick: (selected: Date) => void;
  onClose: () => void;
}
