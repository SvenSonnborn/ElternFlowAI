import { beforeEach, describe, expect, test } from "bun:test";

import { CHILD_ALL, DEFAULT_TASK_FILTER } from "./filter";
import { useTaskFilterStore } from "./filterStore";

/** Der Store ist ein Modul-Singleton — ohne Reset färben Tests aufeinander ab. */
beforeEach(() => {
  useTaskFilterStore.getState().reset();
});

function snapshot() {
  const { status, due, childId } = useTaskFilterStore.getState();
  return { status, due, childId };
}

describe("useTaskFilterStore", () => {
  test("startet auf dem Default-Filter", () => {
    expect(snapshot()).toEqual(DEFAULT_TASK_FILTER);
  });

  test("jeder Setter fasst nur seine eigene Dimension an", () => {
    useTaskFilterStore.getState().setStatus("done");
    useTaskFilterStore.getState().setDue("longTerm");

    expect(snapshot()).toEqual({ status: "done", due: "longTerm", childId: CHILD_ALL });
  });

  test("setChild nimmt sowohl eine child_id als auch die Sentinels", () => {
    useTaskFilterStore.getState().setChild("child-1");
    expect(snapshot().childId).toBe("child-1");

    useTaskFilterStore.getState().setChild("none");
    expect(snapshot().childId).toBe("none");
  });

  test("reset setzt jede Dimension zurück", () => {
    useTaskFilterStore.getState().setStatus("open");
    useTaskFilterStore.getState().setDue("overdue");
    useTaskFilterStore.getState().setChild("child-1");

    useTaskFilterStore.getState().reset();

    expect(snapshot()).toEqual(DEFAULT_TASK_FILTER);
  });
});
