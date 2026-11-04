import { Switch, type SwitchProps } from "react-native";

/**
 * Der Schalter einer Zeile, die selbst der Schalter ist. Die Zeile trägt
 * `accessibilityRole="switch"`, `aria-checked` und den Namen aus ihrem Text;
 * der RN-`Switch` darin zeigt nur den Zustand und ist keine zweite Bedienstelle.
 *
 * Auf Web rendert `Switch` ein `<input type=checkbox>` ohne Namen, das einen
 * eigenen Tab-Stopp und eine eigene Tippfläche (40×20) hätte. `inert` nimmt den
 * Teilbaum aus Tab-Reihenfolge, Zugänglichkeitsbaum und Zeigerereignissen;
 * `aria-hidden` allein ließe das Eingabefeld fokussierbar. Nativ erledigen das
 * `importantForAccessibility`, `accessibilityElementsHidden` und
 * `pointerEvents="none"` — der Tipp landet auf der Zeile.
 *
 * Kein `disabled`: das färbt den Schalter auf Web grau um.
 */
export function DecorativeSwitch(props: Omit<SwitchProps, "disabled" | "onValueChange">) {
  return (
    <Switch
      {...props}
      {...{ inert: true }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
      tabIndex={-1}
    />
  );
}
