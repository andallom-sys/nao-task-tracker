import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, DASHBOARD_PASSWORD } from "./config.js";

const defaultAssignees = [
  "Bea Montenegro",
  "Christian Galang",
  "Margen Andallo"
];

const assigneePalette = [
  { strong: "#5f7cb6", soft: "rgba(95, 124, 182, 0.14)" },
  { strong: "#739a69", soft: "rgba(115, 154, 105, 0.16)" },
  { strong: "#c17e49", soft: "rgba(193, 126, 73, 0.16)" },
  { strong: "#8a68b5", soft: "rgba(138, 104, 181, 0.16)" },
  { strong: "#3d8b87", soft: "rgba(61, 139, 135, 0.16)" },
  { strong: "#c05757", soft: "rgba(192, 87, 87, 0.16)" },
  { strong: "#a2853f", soft: "rgba(162, 133, 63, 0.16)" }
];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  tasks: [],
  assignees: [],
  searchTerm: "",
  dragTaskId: null,
  isLoading: true,
  errorMessage: "",
  filters: {
    assignee: "",
    dueDateFrom: "",
    dueDateTo: "",
    completionDate: ""
  }
};

const board = document.querySelector("#board");
const dialog = document.querySelector("#taskDialog");
const assigneeDialog = document.querySelector("#assigneeDialog");
const passwordDialog = document.querySelector("#passwordDialog");
const passwordForm = document.querySelector("#passwordForm");
const passwordInput = document.querySelector("#dashboardPassword");
const passwordError = document.querySelector("#passwordError");
const taskForm = document.querySelector("#taskForm");
const dialogTitle = document.querySelector("#dialogTitle");
const deleteTaskButton = document.querySelector("#deleteTaskButton");
const stats = document.querySelector("#boardStats");
const searchInput = document.querySelector("#searchInput");
const template = document.querySelector("#taskCardTemplate");
const syncStatus = document.querySelector("#syncStatus");
const summaryPending = document.querySelector("#summaryPending");
const summaryInProgress = document.querySelector("#summaryInProgress");
const summaryBlocked = document.querySelector("#summaryBlocked");
const assigneeList = document.querySelector("#assigneeList");
const newAssigneeName = document.querySelector("#newAssigneeName");
const assigneeFilter = document.querySelector("#assigneeFilter");
const dueDateFromFilter = document.querySelector("#dueDateFromFilter");
const dueDateToFilter = document.querySelector("#dueDateToFilter");
const completionDateFilter = document.querySelector("#completionDateFilter");

const fields = {
  id: document.querySelector("#taskId"),
  title: document.querySelector("#taskTitle"),
  assignee: document.querySelector("#taskAssignee"),
  description: document.querySelector("#taskDescription"),
  note: document.querySelector("#taskNote"),
  status: document.querySelector("#taskStatus"),
  dueDate: document.querySelector("#taskDueDate"),
  link: document.querySelector("#taskLink")
};

document.querySelector("#newTaskButton").addEventListener("click", () => openDialog());
document.querySelector("#manageAssigneesButton").addEventListener("click", openAssigneeDialog);
document.querySelector("#closeDialogButton").addEventListener("click", closeDialog);
document.querySelector("#cancelTaskButton").addEventListener("click", closeDialog);
document.querySelector("#closeAssigneeDialogButton").addEventListener("click", closeAssigneeDialog);
document.querySelector("#addAssigneeButton").addEventListener("click", addAssignee);
document.querySelector("#clearFiltersButton").addEventListener("click", clearFilters);

searchInput.addEventListener("input", event => {
  state.searchTerm = event.target.value.trim().toLowerCase();
  renderBoard();
});

assigneeFilter.addEventListener("change", event => {
  state.filters.assignee = event.target.value;
  renderBoard();
});

dueDateFromFilter.addEventListener("change", event => {
  state.filters.dueDateFrom = event.target.value;
  renderBoard();
});

dueDateToFilter.addEventListener("change", event => {
  state.filters.dueDateTo = event.target.value;
  renderBoard();
});

completionDateFilter.addEventListener("change", event => {
  state.filters.completionDate = event.target.value;
  renderBoard();
});

passwordForm.addEventListener("submit", event => {
  event.preventDefault();
  unlockDashboard();
});

taskForm.addEventListener("submit", async event => {
  event.preventDefault();
  await saveTask();
});

deleteTaskButton.addEventListener("click", async () => {
  const taskId = fields.id.value;
  if (!taskId) {
    return;
  }

  await deleteTask(taskId);
});

dialog.addEventListener("click", event => {
  const rect = dialog.getBoundingClientRect();
  const clickedInDialog =
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width;

  if (!clickedInDialog) {
    closeDialog();
  }
});

assigneeDialog.addEventListener("click", event => {
  const rect = assigneeDialog.getBoundingClientRect();
  const clickedInDialog =
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width;

  if (!clickedInDialog) {
    closeAssigneeDialog();
  }
});

board.querySelectorAll("[data-dropzone]").forEach(zone => {
  zone.addEventListener("dragover", event => {
    event.preventDefault();
    zone.classList.add("drag-over");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("drag-over");
  });

  zone.addEventListener("drop", async event => {
    event.preventDefault();
    zone.classList.remove("drag-over");

    if (!state.dragTaskId) {
      return;
    }

    await updateTask(state.dragTaskId, { status: zone.dataset.dropzone });
    state.dragTaskId = null;
  });
});

lockDashboardIfNeeded();

async function initializeDashboard() {
  subscribeToTasks();
  subscribeToAssignees();
  await loadAssignees();
  await loadBoard();
}

async function loadBoard() {
  state.isLoading = true;
  state.errorMessage = "";
  renderBoard();
  setSyncStatus("Connecting to shared board...", false);

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, assignee, description, note, status, due_date, completed_at, link, created_at, updated_at")
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) {
    state.errorMessage = error.message || "Could not load the shared board.";
    state.isLoading = false;
    setSyncStatus("Shared board unavailable", true);
    renderBoard();
    return;
  }

  state.tasks = data ?? [];
  state.isLoading = false;
  setSyncStatus("Shared board connected", false);
  renderBoard();
}

async function loadAssignees() {
  const { data, error } = await supabase
    .from("assignees")
    .select("id, name, color_strong, color_soft")
    .order("name", { ascending: true });

  if (error) {
    setSyncStatus(error.message || "Could not load assignees.", true);
    return;
  }

  state.assignees = data ?? [];
  renderAssigneeOptions();
  renderAssigneeFilters();
  renderAssigneeList();
}

async function saveTask() {
  const existingTask = state.tasks.find(item => item.id === fields.id.value);
  const nextStatus = fields.status.value;
  const task = {
    id: fields.id.value || crypto.randomUUID(),
    title: fields.title.value.trim(),
    assignee: fields.assignee.value.trim(),
    description: fields.description.value.trim(),
    note: fields.note.value.trim(),
    status: nextStatus,
    due_date: fields.dueDate.value || null,
    completed_at: nextStatus === "done"
      ? existingTask?.completed_at || getTodayDate()
      : null,
    link: normalizeLink(fields.link.value.trim())
  };

  if (!task.title) {
    fields.title.focus();
    return;
  }

  setSyncStatus("Saving task...", false);

  const { error } = await supabase.from("tasks").upsert(task, { onConflict: "id" });

  if (error) {
    setSyncStatus(error.message || "Could not save the task.", true);
    return;
  }

  closeDialog();
  await loadBoard();
}

async function updateTask(taskId, patch) {
  const currentTask = state.tasks.find(task => task.id === taskId);
  if (!currentTask) {
    return;
  }

  const nextStatus = patch.status ?? currentTask.status;
  const completedAt = nextStatus === "done"
    ? currentTask.completed_at || getTodayDate()
    : null;

  setSyncStatus("Updating board...", false);

  const { error } = await supabase
    .from("tasks")
    .update({
      title: currentTask.title,
      assignee: currentTask.assignee,
      description: currentTask.description,
      note: currentTask.note,
      status: nextStatus,
      due_date: patch.due_date ?? currentTask.due_date,
      completed_at: completedAt,
      link: currentTask.link
    })
    .eq("id", taskId);

  if (error) {
    setSyncStatus(error.message || "Could not update the task.", true);
    return;
  }

  await loadBoard();
}

async function deleteTask(taskId) {
  setSyncStatus("Deleting task...", false);

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    setSyncStatus(error.message || "Could not delete the task.", true);
    return;
  }

  closeDialog();
  await loadBoard();
}

async function addAssignee() {
  const name = newAssigneeName.value.trim();
  if (!name) {
    newAssigneeName.focus();
    return;
  }

  const existing = getMergedAssignees().some(item => item.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    newAssigneeName.value = "";
    return;
  }

  const palette = pickNextAssigneePalette();
  const { error } = await supabase.from("assignees").insert({
    name,
    color_strong: palette.strong,
    color_soft: palette.soft
  });

  if (error) {
    setSyncStatus(error.message || "Could not add assignee.", true);
    return;
  }

  newAssigneeName.value = "";
  await loadAssignees();
}

async function removeAssignee(id) {
  const { error } = await supabase.from("assignees").delete().eq("id", id);
  if (error) {
    setSyncStatus(error.message || "Could not remove assignee.", true);
    return;
  }

  await loadAssignees();
}

function subscribeToTasks() {
  supabase
    .channel("public:tasks")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, async () => {
      await loadBoard();
    })
    .subscribe();
}

function subscribeToAssignees() {
  supabase
    .channel("public:assignees")
    .on("postgres_changes", { event: "*", schema: "public", table: "assignees" }, async () => {
      await loadAssignees();
    })
    .subscribe();
}

function renderBoard() {
  const columns = ["pending", "in-progress", "done", "blocked"];
  const normalizedTasks = state.tasks.map(normalizeTask);
  const visibleTasks = normalizedTasks.filter(matchesFilters).filter(matchesSearch);

  columns.forEach(status => {
    const zone = document.querySelector(`[data-dropzone="${status}"]`);
    const count = document.querySelector(`[data-count-for="${status}"]`);
    const tasks = visibleTasks.filter(task => task.status === status);
    zone.innerHTML = "";
    count.textContent = String(tasks.length);

    if (state.isLoading) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Loading shared tasks...";
      zone.appendChild(empty);
      return;
    }

    if (state.errorMessage) {
      const empty = document.createElement("div");
      empty.className = "empty-state error";
      empty.textContent = status === "pending" ? state.errorMessage : "Shared data is not available right now.";
      zone.appendChild(empty);
      return;
    }

    if (!tasks.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.searchTerm || hasActiveFilters()
        ? "No matching tasks for the current filters."
        : "Drop a task here or add a new one.";
      zone.appendChild(empty);
      return;
    }

    tasks
      .sort((a, b) => compareDueDates(a.due_date, b.due_date))
      .forEach(task => zone.appendChild(buildTaskCard(task)));
  });

  stats.textContent = `${visibleTasks.length} visible task${visibleTasks.length === 1 ? "" : "s"} across ${state.tasks.length} total`;
  summaryPending.textContent = String(normalizedTasks.filter(task => task.status === "pending").length);
  summaryInProgress.textContent = String(normalizedTasks.filter(task => task.status === "in-progress").length);
  summaryBlocked.textContent = String(normalizedTasks.filter(task => task.status === "blocked").length);
}

function buildTaskCard(task) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  const title = fragment.querySelector(".task-title");
  const assignee = fragment.querySelector(".task-assignee");
  const description = fragment.querySelector(".task-description");
  const note = fragment.querySelector(".task-note");
  const duePill = fragment.querySelector(".due-pill");
  const link = fragment.querySelector(".task-link");
  const editButton = fragment.querySelector(".edit-chip");

  const palette = getAssigneePalette(task.assignee);
  card.dataset.taskId = task.id;
  card.classList.add(`status-${task.status}`);
  card.style.setProperty("--assignee-strong", palette.strong);
  card.style.setProperty("--assignee-soft", palette.soft);
  title.textContent = task.title;
  assignee.textContent = task.assignee || "Unassigned";
  description.textContent = task.description || "No description added.";
  note.textContent = task.note || "No note added.";

  const due = formatDueDate(task.due_date);
  duePill.textContent = due.label;
  duePill.classList.toggle("overdue", due.kind === "overdue");
  duePill.classList.toggle("today", due.kind === "today");

  if (task.link) {
    link.href = task.link;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  editButton.addEventListener("click", () => openDialog(task));
  card.addEventListener("dblclick", () => openDialog(task));
  card.addEventListener("dragstart", () => {
    state.dragTaskId = task.id;
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    state.dragTaskId = null;
    card.classList.remove("dragging");
  });

  return fragment;
}

function openDialog(task = null) {
  taskForm.reset();
  renderAssigneeOptions();

  if (task) {
    const normalizedTask = normalizeTask(task);
    dialogTitle.textContent = "Edit Task";
    deleteTaskButton.hidden = false;
    fields.id.value = normalizedTask.id;
    fields.title.value = normalizedTask.title;
    fields.assignee.value = normalizedTask.assignee || "";
    fields.description.value = normalizedTask.description;
    fields.note.value = normalizedTask.note;
    fields.status.value = normalizedTask.status;
    fields.dueDate.value = normalizedTask.due_date || "";
    fields.link.value = normalizedTask.link;
  } else {
    dialogTitle.textContent = "Add Task";
    deleteTaskButton.hidden = true;
    fields.id.value = "";
    fields.assignee.value = "";
    fields.status.value = "pending";
  }

  dialog.showModal();
  fields.title.focus();
}

function closeDialog() {
  dialog.close();
}

function openAssigneeDialog() {
  renderAssigneeList();
  assigneeDialog.showModal();
  newAssigneeName.focus();
}

function closeAssigneeDialog() {
  assigneeDialog.close();
}

function renderAssigneeOptions() {
  const currentValue = fields.assignee.value;
  const assignees = getMergedAssignees();

  fields.assignee.innerHTML = '<option value="">Unassigned</option>';

  assignees.forEach(assignee => {
    const option = document.createElement("option");
    option.value = assignee.name;
    option.textContent = assignee.name;
    fields.assignee.appendChild(option);
  });

  fields.assignee.value = assignees.some(item => item.name === currentValue) ? currentValue : "";
}

function renderAssigneeFilters() {
  const currentValue = assigneeFilter.value;
  const assignees = getMergedAssignees();

  assigneeFilter.innerHTML = '<option value="">All assignees</option>';

  assignees.forEach(assignee => {
    const option = document.createElement("option");
    option.value = assignee.name;
    option.textContent = assignee.name;
    assigneeFilter.appendChild(option);
  });

  assigneeFilter.value = assignees.some(item => item.name === currentValue) ? currentValue : "";
}

function renderAssigneeList() {
  assigneeList.innerHTML = "";

  if (!state.assignees.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No assignees yet. Add a name to build the dropdown.";
    assigneeList.appendChild(empty);
    return;
  }

  state.assignees.forEach(assignee => {
    const row = document.createElement("div");
    row.className = "assignee-row";

    const meta = document.createElement("span");
    meta.className = "assignee-meta";

    const swatch = document.createElement("span");
    swatch.className = "assignee-swatch";
    swatch.style.setProperty("--swatch-color", assignee.color_strong || getFallbackPalette(assignee.name).strong);

    const label = document.createElement("span");
    label.className = "assignee-name";
    label.textContent = assignee.name;

    meta.append(swatch, label);

    const removeButton = document.createElement("button");
    removeButton.className = "ghost-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", async () => {
      await removeAssignee(assignee.id);
    });

    row.append(meta, removeButton);
    assigneeList.appendChild(row);
  });
}

function lockDashboardIfNeeded() {
  const unlocked = window.sessionStorage.getItem("nao-dashboard-unlocked");
  if (unlocked === "true") {
    initializeDashboard();
    return;
  }

  passwordDialog.showModal();
  passwordInput.focus();
}

function unlockDashboard() {
  if (passwordInput.value !== DASHBOARD_PASSWORD) {
    passwordError.hidden = false;
    passwordInput.select();
    return;
  }

  passwordError.hidden = true;
  window.sessionStorage.setItem("nao-dashboard-unlocked", "true");
  passwordDialog.close();
  initializeDashboard();
}

function clearFilters() {
  state.filters.assignee = "";
  state.filters.dueDateFrom = "";
  state.filters.dueDateTo = "";
  state.filters.completionDate = "";
  assigneeFilter.value = "";
  dueDateFromFilter.value = "";
  dueDateToFilter.value = "";
  completionDateFilter.value = "";
  renderBoard();
}

function getMergedAssignees() {
  const map = new Map();

  defaultAssignees.forEach((name, index) => {
    const palette = assigneePalette[index % assigneePalette.length];
    map.set(name.toLowerCase(), {
      id: `default-${index}`,
      name,
      color_strong: palette.strong,
      color_soft: palette.soft
    });
  });

  state.assignees.forEach(assignee => {
    map.set(assignee.name.toLowerCase(), assignee);
  });

  return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function pickNextAssigneePalette() {
  const used = new Set(state.assignees.map(item => item.color_strong));
  const available = assigneePalette.find(item => !used.has(item.strong));
  return available || assigneePalette[state.assignees.length % assigneePalette.length];
}

function getAssigneePalette(name) {
  const match = getMergedAssignees().find(item => item.name.toLowerCase() === (name || "").toLowerCase());
  if (match?.color_strong && match?.color_soft) {
    return {
      strong: match.color_strong,
      soft: match.color_soft
    };
  }

  return getFallbackPalette(name);
}

function getFallbackPalette(name) {
  const value = (name || "unassigned").trim().toLowerCase();
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return assigneePalette[Math.abs(hash) % assigneePalette.length];
}

function setSyncStatus(message, isError) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("error", Boolean(isError));
}

function normalizeLink(link) {
  if (!link) {
    return "";
  }

  if (/^https?:\/\//i.test(link)) {
    return link;
  }

  return `https://${link}`;
}

function matchesSearch(task) {
  if (!state.searchTerm) {
    return true;
  }

  const haystack = [task.title, task.description, task.note, task.link, task.due_date, task.completed_at, task.assignee]
    .join(" ")
    .toLowerCase();

  return haystack.includes(state.searchTerm);
}

function matchesFilters(task) {
  if (state.filters.assignee && task.assignee !== state.filters.assignee) {
    return false;
  }

  if (state.filters.dueDateFrom) {
    if (!task.due_date || task.due_date < state.filters.dueDateFrom) {
      return false;
    }
  }

  if (state.filters.dueDateTo) {
    if (!task.due_date || task.due_date > state.filters.dueDateTo) {
      return false;
    }
  }

  if (state.filters.completionDate && task.completed_at !== state.filters.completionDate) {
    return false;
  }

  return true;
}

function hasActiveFilters() {
  return Boolean(
    state.filters.assignee ||
    state.filters.dueDateFrom ||
    state.filters.dueDateTo ||
    state.filters.completionDate
  );
}

function compareDueDates(left, right) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return new Date(left) - new Date(right);
}

function formatDueDate(dueDate) {
  if (!dueDate) {
    return { label: "No due date", kind: "none" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dueDate}T00:00:00`);
  const deltaDays = Math.round((due - today) / 86400000);
  const formatted = due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  if (deltaDays < 0) {
    return { label: `Overdue: ${formatted}`, kind: "overdue" };
  }

  if (deltaDays === 0) {
    return { label: `Due today: ${formatted}`, kind: "today" };
  }

  return { label: `Due ${formatted}`, kind: "upcoming" };
}

function normalizeTask(task) {
  let status = task.status;
  if (status === "todo") {
    status = "pending";
  } else if (status === "needs-attention") {
    status = "in-progress";
  }

  return {
    ...task,
    assignee: task.assignee || "",
    status,
    due_date: task.due_date ? String(task.due_date).slice(0, 10) : "",
    completed_at: task.completed_at ? String(task.completed_at).slice(0, 10) : ""
  };
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}
