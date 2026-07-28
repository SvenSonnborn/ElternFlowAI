import { useTranslation } from "react-i18next";

import { Field } from "@/app-sections/shared";

interface RecurrenceCountFieldProps {
  /** Raw text, so a half-typed number survives re-renders. */
  value: string;
  onChangeText: (next: string) => void;
  error?: string;
}

/**
 * iCal COUNT for a series — "ends after N occurrences". Empty means unbounded,
 * which is what every series created before this field existed looks like.
 * Only rendered when a recurrence other than "none" is selected.
 */
export function RecurrenceCountField({ value, onChangeText, error }: RecurrenceCountFieldProps) {
  const { t } = useTranslation();
  return (
    <Field
      label={t("cal.create.fieldRecurrenceCount")}
      value={value}
      onChangeText={(text) => onChangeText(text.replace(/\D/g, ""))}
      placeholder={t("cal.create.recurrenceCountUnlimited")}
      keyboardType="number-pad"
      error={error}
    />
  );
}
