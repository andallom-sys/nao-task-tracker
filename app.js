import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const sampleTasks = [
  {
    id: crypto.randomUUID(),
    title: "Finalize Q2 Operations Review",
    assignee: "Margen",
    description: "Pull the deck together and confirm which leaders are presenting.",
    note: "Need finance numbers before the final version goes out.",
    status: "pending",
    due_date: "",
    link: "https://naomedical.com"
  },
  {
    id: crypto.randomUUID(),
    title: "Open LIC staffing requisition",
    assignee: "Bea",
    description: "Post the role and collect approvals from HR and clinic leadership.",
    note: "Candidate pipeline should be reviewed this week.",
    status: "needs-attention",
    due_date: getRelativeDate(2),
    link: ""
  },
  {
    id: crypto.randomUUID(),
    title: "Close patient feedback follow-up",
    assignee: "Margen",
    description: "Confirm outreach is completed for all detractor responses from last week.",
    note: "Escalations have already been shared with patient relations.",
    status: "done",
    due_date: getRelativeDate(-1),
    link: ""
  }
];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  tasks: [],
  searchTerm: "",
  dragTaskId: null,
  isLoading: true,
  errorMessage: ""
};

const board = document.querySelector("#board");
const dialog = document.querySelector("#taskDialog");
const taskForm = document.querySelector("#taskForm");
const dialogTitle = document.querySelector("#dialogTitle");
const deleteTaskButton = document.querySelector("#deleteTaskButton");
const stats = document.querySelector("#boardStats");
const searchInput = document.querySelector("#searchInput");
const template = document.querySelector("#taskCardTemplate");
const syncStatus = document.querySelector("#syncStatus");
const summaryPending = document.querySelector("#summaryPending");
const summaryDone = document.querySelector("#summaryDone");
const summaryAttention = document.querySelector("#summaryAttention");

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
document.querySelector("#closeDialogButton").addEventListener("click", closeDialog);
document.querySelector("#cancelTaskButton").addEventListener("click", closeDialog);
document.querySelector("#resetBoardButton").addEventListener("click", seedSampleData);

searchInput.addEventListener("input", event => {
  state.searchTerm = event.target.value.trim().toLowerCase();
  renderBoard();
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

subscribeToTasks();
await loadBoard();

async function loadBoard() {
  state.isLoading = true;
  state.errorMessage = "";
  renderBoard();
  setSyncStatus("Connecting to shared board...", false);

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, assignee, description, note, status, due_date, link, created_at, updated_at")
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

async function saveTask() {
  const task = {
    id: fields.id.value || crypto.randomUUID(),
    title: fields.title.value.trim(),
    assignee: fields.assignee.value.trim(),
    description: fields.description.value.trim(),
    note: fields.note.value.trim(),
    status: fields.status.value,
    due_date: fields.dueDate.value,
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

  setSyncStatus("Updating board...", false);

  const { error } = await supabase
    .from("tasks")
    .update({
      title: currentTask.title,
      assignee: currentTask.assignee,
      description: currentTask.description,
      note: currentTask.note,
      status: patch.status ?? currentTask.status,
      due_date: patch.due_date ?? currentTask.due_date,
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

async function seedSampleData() {
  setSyncStatus("Resetting shared sample data...", false);

  const { error: deleteError } = await supabase.from("tasks").delete().neq("id", "");
  if (deleteError) {
    setSyncStatus(deleteError.message || "Could not reset the board.", true);
    return;
  }

  const { error: insertError } = await supabase.from("tasks").insert(sampleTasks);
  if (insertError) {
    setSyncStatus(insertError.message || "Could not reset the board.", true);
    return;
  }

  await loadBoard();
}

function subscribeToTasks() {
  supabase
    .channel("public:tasks")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, async () => {
      await loadBoard();
    })
    .subscribe();
}

function renderBoard() {
  const columns = ["pending", "needs-attention", "done"];
  const normalizedTasks = state.tasks.map(normalizeTask);
  const visibleTasks = normalizedTasks.filter(matchesSearch);

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
      empty.textContent = status === "todo" ? state.errorMessage : "Shared data is not available right now.";
      zone.appendChild(empty);
      return;
    }

    if (!tasks.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.searchTerm ? "No matching tasks in this column." : "Drop a task here or add a new one.";
      zone.appendChild(empty);
      return;
    }

    tasks
      .sort((a, b) => compareDueDates(a.due_date, b.due_date))
      .forEach(task => zone.appendChild(buildTaskCard(task)));
  });

  stats.textContent = `${visibleTasks.length} visible task${visibleTasks.length === 1 ? "" : "s"} across ${state.tasks.length} total`;
  summaryPending.textContent = String(normalizedTasks.filter(task => task.status === "pending").length);
  summaryDone.textContent = String(normalizedTasks.filter(task => task.status === "done").length);
  summaryAttention.textContent = String(normalizedTasks.filter(task => task.status === "needs-attention").length);
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

  card.dataset.taskId = task.id;
  card.classList.add(`status-${task.status}`);
  applyAssigneeTheme(card, task.assignee);
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

  if (task) {
    dialogTitle.textContent = "Edit Task";
    deleteTaskButton.hidden = false;
    fields.id.value = task.id;
    fields.title.value = task.title;
    fields.assignee.value = task.assignee || "";
    fields.description.value = task.description;
    fields.note.value = task.note;
    fields.status.value = task.status;
    fields.dueDate.value = task.due_date || "";
    fields.link.value = task.link;
  } else {
    dialogTitle.textContent = "Add Task";
    deleteTaskButton.hidden = true;
    fields.id.value = "";
    fields.status.value = "pending";
  }

  dialog.showModal();
  fields.title.focus();
}

function closeDialog() {
  dialog.close();
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

  const haystack = [task.title, task.description, task.note, task.link, task.due_date]
    .concat(task.assignee || "")
    .join(" ")
    .toLowerCase();

  return haystack.includes(state.searchTerm);
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

function getRelativeDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function normalizeTask(task) {
  const normalizedStatus = task.status === "todo"
    ? "pending"
    : task.status === "in-progress"
      ? "needs-attention"
      : task.status;

  return {
    ...task,
    assignee: task.assignee || "",
    status: normalizedStatus
  };
}

function applyAssigneeTheme(card, assignee) {
  const themes = [
    ["#5f7cb6", "rgba(95, 124, 182, 0.14)"],
    ["#739a69", "rgba(115, 154, 105, 0.16)"],
    ["#c17e49", "rgba(193, 126, 73, 0.16)"],
    ["#8a68b5", "rgba(138, 104, 181, 0.16)"],
    ["#3d8b87", "rgba(61, 139, 135, 0.16)"]
  ];

  const name = (assignee || "unassigned").trim().toLowerCase();
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(index);
    hash |= 0;
  }

  const [strong, soft] = themes[Math.abs(hash) % themes.length];
  card.style.setProperty("--assignee-strong", strong);
  card.style.setProperty("--assignee-soft", soft);
}
