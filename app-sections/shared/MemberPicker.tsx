import { Pressable, View } from "react-native";

import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import { ChildAvatar } from "./ChildAvatar";

export type MemberKind = "parent" | "child";

export interface MemberOption {
  id: string;
  name: string;
  color: string;
  /** Nur Eltern setzen es; Kinder haben kein Kürzel. */
  short?: string;
  kind: MemberKind;
}

export interface SelectedMember {
  id: string;
  kind: MemberKind;
}

interface MemberPickerProps {
  label: string;
  noMemberLabel: string;
  options: MemberOption[];
  selected: SelectedMember | null;
  onSelect: (next: SelectedMember | null) => void;
}

function isSelected(member: MemberOption, sel: SelectedMember | null): boolean {
  return sel !== null && sel.kind === member.kind && sel.id === member.id;
}

export function MemberPicker({
  label,
  noMemberLabel,
  options,
  selected,
  onSelect,
}: MemberPickerProps) {
  const { theme } = useTheme();
  if (options.length === 0) return null;

  return (
    <View>
      <Text
        variant="caption"
        tone="inkSecondary"
        style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <View className="mt-1.5 flex-row flex-wrap items-center gap-3">
        {options.map((member) => {
          const active = isSelected(member, selected);
          return (
            <Pressable
              key={`${member.kind}-${member.id}`}
              accessibilityRole="button"
              accessibilityLabel={member.name}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect({ kind: member.kind, id: member.id })}
              className="items-center active:opacity-70"
              style={{ minWidth: touchTarget.min }}
            >
              <View
                className="items-center justify-center rounded-pill"
                style={{
                  padding: 2,
                  borderWidth: 2,
                  borderColor: active ? theme.primaryStrong : "transparent",
                }}
              >
                <ChildAvatar
                  name={member.name}
                  short={member.short}
                  color={member.color}
                  size="md"
                />
              </View>
              <Text variant="caption" tone="inkSecondary" className="mt-1">
                {member.name}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={noMemberLabel}
          accessibilityState={{ selected: selected === null }}
          onPress={() => onSelect(null)}
          // Die Pille ist per Design 36 px hoch, die Tippfläche darum 44;
          // `hitSlop` leistet das nicht, weil React Native es an den Grenzen
          // des Elternteils beschneidet und react-native-web es gar nicht kennt.
          // Das Maß ist eine Zahl statt `h-11`: NativeWind rechnet rem nativ mit
          // 14, `h-11` wären dort 38,5 pt.
          className="justify-center active:opacity-70"
          style={{ height: touchTarget.min }}
        >
          <View
            className="h-9 flex-row items-center rounded-pill border px-3"
            style={{
              backgroundColor: selected === null ? theme.primarySoft : theme.cardSubtle,
              borderColor: selected === null ? theme.primary : theme.line,
            }}
          >
            <Text
              variant="pill"
              style={{
                color: selected === null ? theme.primaryStrong : theme.inkSecondary,
              }}
            >
              {noMemberLabel}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
