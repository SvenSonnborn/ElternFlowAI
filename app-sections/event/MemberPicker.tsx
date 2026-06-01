import { Pressable, View } from "react-native";

import { ChildAvatar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

export type MemberKind = "parent" | "child";

export interface MemberOption {
  id: string;
  name: string;
  color: string;
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
            >
              <View
                className="items-center justify-center rounded-pill"
                style={{
                  padding: 2,
                  borderWidth: 2,
                  borderColor: active ? theme.primaryStrong : "transparent",
                }}
              >
                <ChildAvatar name={member.name} color={member.color} size="md" />
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
          className="h-9 flex-row items-center rounded-pill border px-3 active:opacity-70"
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
        </Pressable>
      </View>
    </View>
  );
}
