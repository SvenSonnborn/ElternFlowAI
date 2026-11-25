import { fireEvent, screen } from "@testing-library/react-native";

import type { TaskFormState } from "@/features/tasks";

import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import { TaskForm } from "./TaskForm";

const types = [
  { id: "type-1", label: "Hausaufgabe", color: "#3CB371" },
  { id: "type-2", label: "Besorgung", color: "#E0A030" },
];
const childOptions = [{ id: "child-1", name: "Mia", color: "#7C9EE0", kind: "child" as const }];

const state: TaskFormState = {
  typeId: "type-1",
  childId: null,
  title: "Mathe",
  subject: "",
  dueDate: new Date(2026, 8, 14),
  dueTime: new Date(2026, 8, 14, 16, 30),
  notes: "",
};

async function renderForm(disabled?: boolean) {
  const onChange = jest.fn();
  await renderScreen(
    <TaskForm
      state={state}
      onChange={onChange}
      types={types}
      childOptions={childOptions}
      errors={{}}
      {...(disabled === undefined ? {} : { disabled })}
    />,
  );
  return onChange;
}

const dueRow = () =>
  screen.getByRole("button", { name: new RegExp(`${i18n.t("hw.form.fieldDue")},`) });
const dueTimeRow = () =>
  screen.getByRole("button", { name: new RegExp(`${i18n.t("hw.form.fieldDueTime")},`) });

describe("TaskForm", () => {
  it("disabled sperrt jede Eingabe", async () => {
    const onChange = await renderForm(true);

    await fireEvent.press(screen.getByRole("radio", { name: "Besorgung" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Mia" }));
    await fireEvent.press(screen.getByRole("button", { name: i18n.t("hw.form.clearTime") }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Mathe").props.editable).toBe(false);
    // Datum und Uhrzeit rufen `onChange` erst nach der Wahl im Sheet; gesperrt
    // ist die Zeile selbst, also den Zustand der Knöpfe prüfen.
    expect(dueRow()).toBeDisabled();
    expect(dueTimeRow()).toBeDisabled();
  });

  it("ohne disabled nimmt der Typ-Picker an", async () => {
    const onChange = await renderForm();

    await fireEvent.press(screen.getByRole("radio", { name: "Besorgung" }));

    expect(onChange).toHaveBeenCalledWith("typeId", "type-2");
    expect(dueRow()).toBeEnabled();
    expect(dueTimeRow()).toBeEnabled();
  });
});
