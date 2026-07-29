export { mapTaskError, MissingParentError, type TaskErrorKey } from "./errors";
export {
  useCreateTask,
  useDeleteTask,
  useToggleTaskDone,
  useUpdateTask,
  type CreateTaskVars,
  type DeleteTaskVars,
  type ToggleTaskDoneVars,
  type UpdateTaskVars,
} from "./mutations";
export { applyDelete, applyToggle, applyUpdate, type TaskChanges } from "./optimistic";
export {
  fetchFamilyTasks,
  fetchTaskTypes,
  taskKeys,
  useFamilyTasks,
  useTaskTypes,
  useTasksByChild,
  useTasksStats,
} from "./queries";
export { computeTaskStats, groupTasksByChild } from "./stats";
export type {
  TaskGroup,
  TaskInsert,
  TaskRow,
  TaskStats,
  TaskTypeRow,
  TaskUpdate,
  TaskWithType,
} from "./types";
