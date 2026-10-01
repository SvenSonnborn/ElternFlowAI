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
  /**
   * Latest selectable day. On web a later typed day is clamped to this one,
   * date mode only, compared per calendar day (see parseWebPickerValue).
   */
  maximumDate?: Date;
  /**
   * Commits a value. Fires on every change the user makes in the picker **and**
   * once more with `value` when "Fertig" is tapped, so a sheet that opened on a
   * placeholder (an empty birthday opens on 2018-01-01) and is confirmed
   * untouched still commits what it shows. Callers must tolerate the repeat of
   * an unchanged value.
   */
  onPick: (selected: Date) => void;
  /**
   * Closes the sheet. Pure cancel when reached through the scrim, Escape (web)
   * or back (Android) — those never call `onPick`. "Fertig" calls `onPick`
   * first, then this.
   */
  onClose: () => void;
}
