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
  emptyTaskForm,
  hasTaskFormErrors,
  taskToForm,
  toCreateVars,
  toTaskChanges,
  validateTaskForm,
  type TaskFormErrorKey,
  type TaskFormErrors,
  type TaskFormState,
} from "./form";
export { taskTypeColorFor, taskTypeLabelKey } from "./palette";
export {
  fetchFamilyTasks,
  fetchTaskTypes,
  taskKeys,
  useFamilyTasks,
  useTask,
  useTaskTypes,
  useTasksByChild,
  useTasksSections,
  useTasksStats,
} from "./queries";
export { computeTaskStats, groupTasksByChild, groupTasksByDue } from "./stats";
export type {
  TaskGroup,
  TaskInsert,
  TaskRow,
  TaskSections,
  TaskStats,
  TaskTypeRow,
  TaskUpdate,
  TaskWithType,
} from "./types";
