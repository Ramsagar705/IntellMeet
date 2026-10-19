import { isAxiosError } from 'axios';
import { CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

type TaskStatus = 'Backlog' | 'In Progress' | 'Done';
type TaskPriority = 'Low' | 'Medium' | 'High';

interface Workspace {
  _id?: string;
  id?: string;
  name: string;
}

interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
}

interface Task {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  assignee: string;
  assigneeName: string;
  priority: TaskPriority;
  dueDate: string;
  status: TaskStatus;
  canEdit: boolean;
  canDelete: boolean;
}

interface TaskForm {
  title: string;
  description: string;
  assignee: string;
  priority: TaskPriority;
  dueDate: string;
  status: TaskStatus;
}

const columns: TaskStatus[] = ['Backlog', 'In Progress', 'Done'];
const blankForm: TaskForm = {
  title: '',
  description: '',
  assignee: '',
  priority: 'Medium',
  dueDate: '',
  status: 'Backlog',
};
const emptyTasks: Task[] = [];

const getErrorMessage = (error: unknown, fallback: string) =>
  isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || fallback : fallback;

export default function KanbanPage() {
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TaskForm>(blankForm);
  const [successMessage, setSuccessMessage] = useState('');

  const workspacesQuery = useQuery<Workspace[]>({
    queryKey: ['kanban-workspaces'],
    queryFn: async () => {
      const { data } = await api.get<Workspace[]>('/workspaces');
      return data;
    },
  });
  const workspaces = workspacesQuery.data || [];
  const activeWorkspaceId = selectedWorkspaceId || workspaces[0]?._id || workspaces[0]?.id || '';
  const activeWorkspace = workspaces.find((workspace) =>
    (workspace._id || workspace.id) === activeWorkspaceId
  );

  const membersQuery = useQuery<{ members: WorkspaceMember[] }>({
    queryKey: ['kanban-members', activeWorkspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ members: WorkspaceMember[] }>(
        `/workspaces/${activeWorkspaceId}/members`
      );
      return data;
    },
    enabled: Boolean(activeWorkspaceId),
  });

  const tasksQuery = useQuery<Task[]>({
    queryKey: ['kanban-tasks', activeWorkspaceId],
    queryFn: async () => {
      const { data } = await api.get<Task[]>('/tasks', { params: { workspace: activeWorkspaceId } });
      return data;
    },
    enabled: Boolean(activeWorkspaceId),
  });
  const tasks = tasksQuery.data ?? emptyTasks;

  const saveTask = useMutation({
    mutationFn: async (values: TaskForm) => {
      if (editingTask) {
        return api.patch(`/tasks/${editingTask.id}`, values);
      }
      return api.post('/tasks', { ...values, workspaceId: activeWorkspaceId });
    },
    onSuccess: async () => {
      setEditingTask(null);
      setIsFormOpen(false);
      setForm(blankForm);
      setSuccessMessage(editingTask ? 'Task updated.' : 'Task created.');
      await queryClient.invalidateQueries({ queryKey: ['kanban-tasks', activeWorkspaceId] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      api.patch(`/tasks/${taskId}`, { status }),
    onSuccess: async () => {
      setSuccessMessage('Task status updated.');
      await queryClient.invalidateQueries({ queryKey: ['kanban-tasks', activeWorkspaceId] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => api.delete(`/tasks/${taskId}`),
    onSuccess: async () => {
      setSuccessMessage('Task deleted.');
      await queryClient.invalidateQueries({ queryKey: ['kanban-tasks', activeWorkspaceId] });
    },
  });

  const totals = useMemo(
    () => Object.fromEntries(columns.map((status) => [
      status,
      tasks.filter((task) => task.status === status).length,
    ])) as Record<TaskStatus, number>,
    [tasks]
  );

  const openCreateForm = () => {
    setEditingTask(null);
    setForm(blankForm);
    setIsFormOpen(true);
    setSuccessMessage('');
  };

  const openEditForm = (task: Task) => {
    setEditingTask(task);
    setIsFormOpen(true);
    setForm({
      title: task.title,
      description: task.description,
      assignee: task.assignee,
      priority: task.priority,
      dueDate: task.dueDate,
      status: task.status,
    });
    setSuccessMessage('');
  };

  const moveTask = (task: Task, offset: -1 | 1) => {
    const nextStatus = columns[columns.indexOf(task.status) + offset];
    if (!nextStatus) return;
    setSuccessMessage('');
    updateStatus.mutate({ taskId: task.id, status: nextStatus });
  };

  const handleDelete = (task: Task) => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setSuccessMessage('');
    deleteTask.mutate(task.id);
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Kanban</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Task board</h1>
            <p className="mt-2 text-sm text-slate-400">Tasks are scoped to the selected workspace.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {workspaces.length > 1 ? (
              <label className="sr-only" htmlFor="kanban-workspace">Workspace</label>
            ) : null}
            {workspaces.length > 1 ? (
              <select
                id="kanban-workspace"
                value={activeWorkspaceId}
                onChange={(event) => {
                  setSelectedWorkspaceId(event.target.value);
                  setIsFormOpen(false);
                  setEditingTask(null);
                  setSuccessMessage('');
                  saveTask.reset();
                  updateStatus.reset();
                  deleteTask.reset();
                }}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-white"
                aria-label="Select workspace"
              >
                {workspaces.map((workspace) => {
                  const id = workspace._id || workspace.id || '';
                  return <option key={id} value={id}>{workspace.name}</option>;
                })}
              </select>
            ) : activeWorkspace ? (
              <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-200">
                {activeWorkspace.name}
              </div>
            ) : null}
            <button
              type="button"
              onClick={openCreateForm}
              disabled={!activeWorkspaceId || membersQuery.isError}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add Task
            </button>
          </div>
        </header>

        {workspacesQuery.isLoading ? (
          <div className="glass rounded-2xl p-5 text-slate-300" role="status">Loading workspaces...</div>
        ) : null}
        {workspacesQuery.isError ? (
          <div className="glass rounded-2xl p-5 text-rose-300" role="alert">
            {getErrorMessage(workspacesQuery.error, 'Could not load your workspaces.')}
          </div>
        ) : null}
        {!workspacesQuery.isLoading && !workspacesQuery.isError && workspaces.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-slate-300">
            Create or join a workspace to start managing tasks.
          </div>
        ) : null}

        {activeWorkspaceId ? (
          <>
            {membersQuery.isError ? (
              <div className="glass mb-4 rounded-2xl p-4 text-rose-300" role="alert">
                {getErrorMessage(membersQuery.error, 'Could not load workspace members.')}
              </div>
            ) : null}
            {tasksQuery.isError ? (
              <div className="glass mb-4 rounded-2xl p-4 text-rose-300" role="alert">
                {getErrorMessage(tasksQuery.error, 'Could not load tasks.')}
              </div>
            ) : null}
            {successMessage ? (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200" role="status">
                {successMessage}
              </div>
            ) : null}
            {[saveTask, updateStatus, deleteTask].some((mutation) => mutation.isError) ? (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                {saveTask.isError
                  ? getErrorMessage(saveTask.error, 'Could not save the task.')
                  : updateStatus.isError
                    ? getErrorMessage(updateStatus.error, 'Could not update task status.')
                    : getErrorMessage(deleteTask.error, 'Could not delete the task.')}
              </div>
            ) : null}

            <div className="mb-8 grid gap-4 md:grid-cols-3">
              {columns.map((status) => (
                <div key={status} className="glass rounded-2xl p-4">
                  <p className="text-sm text-slate-300">{status}</p>
                  <p className="mt-3 text-3xl font-bold text-white">{totals[status]}</p>
                </div>
              ))}
            </div>

            {tasksQuery.isLoading ? (
              <div className="glass rounded-2xl p-5 text-slate-300" role="status">Loading tasks...</div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-3">
                {columns.map((status) => {
                  const columnTasks = tasks.filter((task) => task.status === status);
                  return (
                    <section key={status} aria-label={`${status} tasks`} className="glass rounded-3xl p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-white">{status}</h2>
                        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                          {columnTasks.length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {columnTasks.length === 0 ? (
                          <p className="rounded-2xl border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-500">
                            No tasks here yet.
                          </p>
                        ) : columnTasks.map((task) => {
                          const currentIndex = columns.indexOf(status);
                          return (
                            <article key={task.id} className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <h3 className="font-medium text-white">{task.title}</h3>
                                <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-1 text-[10px] uppercase tracking-wide text-sky-200">
                                  {task.priority}
                                </span>
                              </div>
                              {task.description ? (
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-400">{task.description}</p>
                              ) : null}
                              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                                <span>{task.assigneeName || 'Unassigned'}</span>
                                {task.dueDate ? (
                                  <span className="inline-flex items-center gap-1">
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    {new Date(`${task.dueDate}T00:00:00`).toLocaleDateString()}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                                {task.canEdit ? (
                                  <div className="flex gap-3 text-xs">
                                    {currentIndex > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => moveTask(task, -1)}
                                        disabled={updateStatus.isPending}
                                        className="text-slate-300 hover:text-white disabled:opacity-50"
                                      >
                                        Prev
                                      </button>
                                    ) : null}
                                    {currentIndex < columns.length - 1 ? (
                                      <button
                                        type="button"
                                        onClick={() => moveTask(task, 1)}
                                        disabled={updateStatus.isPending}
                                        className="text-sky-300 hover:text-sky-200 disabled:opacity-50"
                                      >
                                        Next
                                      </button>
                                    ) : null}
                                  </div>
                                ) : <span />}
                                <div className="flex gap-3 text-xs">
                                  {task.canEdit ? (
                                    <button
                                      type="button"
                                      onClick={() => openEditForm(task)}
                                      className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Edit
                                    </button>
                                  ) : null}
                                  {task.canDelete ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(task)}
                                      disabled={deleteTask.isPending}
                                      className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 disabled:opacity-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>

      {isFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saveTask.isPending) setIsFormOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-form-title"
            className="glass my-auto w-full max-w-xl rounded-3xl p-6"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 id="task-form-title" className="text-xl font-semibold text-white">
                  {editingTask ? 'Edit task' : 'Add task'}
                </h2>
                <p className="mt-1 text-sm text-slate-400">{activeWorkspace?.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={saveTask.isPending}
                aria-label="Close task form"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {membersQuery.isLoading ? (
              <p className="mb-4 text-sm text-slate-300" role="status">Loading workspace members...</p>
            ) : null}
            {saveTask.isError ? (
              <p className="mb-4 text-sm text-rose-300" role="alert">
                {getErrorMessage(saveTask.error, 'Could not save the task.')}
              </p>
            ) : null}
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setSuccessMessage('');
                saveTask.mutate(form);
              }}
            >
              <label className="block text-sm text-slate-300">
                Title <span className="text-rose-300">*</span>
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-sky-500"
                  placeholder="What needs to be done?"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Description
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-sky-500"
                  placeholder="Add details (optional)"
                />
              </label>
              {membersQuery.isError ? (
                <p className="text-sm text-rose-300">
                  {getErrorMessage(membersQuery.error, 'Could not load members for assignment.')}
                </p>
              ) : (
                <label className="block text-sm text-slate-300">
                  Assignee
                  <select
                    value={form.assignee}
                    disabled={membersQuery.isLoading}
                    onChange={(event) => setForm({ ...form, assignee: event.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {(membersQuery.data?.members || []).map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name}{member.email ? ` (${member.email})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm text-slate-300">
                  Priority
                  <select
                    value={form.priority}
                    onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })}
                    className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                  >
                    {(['Low', 'Medium', 'High'] as const).map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-300">
                  Due date
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}
                    className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"
                  >
                    {columns.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={saveTask.isPending}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveTask.isPending || membersQuery.isLoading || membersQuery.isError || !form.title.trim()}
                  className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveTask.isPending ? 'Saving...' : editingTask ? 'Save changes' : 'Create task'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
