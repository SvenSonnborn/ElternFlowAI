import { Text } from "react-native";

import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import type { EventWithRelations } from "./expand";

import { useEvent } from "./hooks";
import { calendarKeys } from "./queries";

/** Wöchentliche Serie ab Do 01.10.2026 19:00 Berlin; Einzeltermin über `rrule_freq: null`. */
function row(overrides: Partial<EventWithRelations> = {}): EventWithRelations {
  return {
    id: "e1",
    family_id: "f1",
    type_id: "t1",
    child_id: null,
    parent_id: null,
    title: "Elternabend",
    description: null,
    location: null,
    start_at: "2026-10-01T17:00:00.000Z",
    end_at: "2026-10-01T18:30:00.000Z",
    all_day: false,
    timezone: "Europe/Berlin",
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-10-01T08:00:00.000Z",
    event_types: null,
    event_exceptions: [],
    ...overrides,
  };
}

function Probe({ occ }: { occ?: string }) {
  const { data } = useEvent("e1", occ);
  return <Text>{data ? data.occurrenceKey : "keine"}</Text>;
}

async function renderProbe(event: EventWithRelations, occ?: string) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(calendarKeys.one("e1"), event);
  return renderScreen(<Probe occ={occ} />, { queryClient });
}

describe("useEvent", () => {
  it("Serie, unbekannter occ: keine Occurrence statt der ersten", async () => {
    const view = await renderProbe(row(), "2026-10-02");
    expect(view.getByText("keine")).toBeTruthy();
  });

  it("Serie, gültiger occ: genau diese Occurrence", async () => {
    const view = await renderProbe(row(), "2026-10-08");
    expect(view.getByText("2026-10-08")).toBeTruthy();
  });

  it("Einzeltermin, veralteter occ: seine Occurrence", async () => {
    const view = await renderProbe(row({ rrule_freq: null }), "2026-09-01");
    expect(view.getByText("2026-10-01")).toBeTruthy();
  });
});
