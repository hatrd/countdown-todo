import {
  createTauriInvoke,
  formatErrorMessage,
  invokeEnvelopeWith,
} from "./src/invoke-bridge.mjs";

const state = {
  timers: [],
  selectedTimerId: null,
  marks: [],
  todos: [],
  insertedTodoIds: new Set(),
  compactInsertedTodoIds: new Set(),
  compactMode: false,
  compactPrecision: "minute", // "minute" or "second"
};

const COMPACT_MODE_KEY = "countdown_todo_compact_mode";
const COMPACT_PRECISION_KEY = "countdown_todo_compact_precision";

const $ = (id) => document.getElementById(id);

const timerListNode = $("timer-list");
const selectedTimerNode = $("selected-timer");
const markListNode = $("mark-list");
const todoListNode = $("todo-list");
const compactTodoSelect = $("compact-todo-select");
const compactTimerSelect = $("compact-timer-select");
const compactRemaining = $("compact-remaining");
const toggleCompactButton = $("toggle-compact");
const toastNode = $("toast");

let toastTimer = null;

function showToast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove("show"), 2200);
}

function nowMinute() {
  return Math.floor(Date.now() / 60000);
}

function formatMinute(minute) {
  if (minute === null || minute === undefined || Number.isNaN(minute)) {
    return "-";
  }
  return new Date(minute * 60000).toLocaleString();
}

function formatTime(minute) {
  if (minute === null || minute === undefined || Number.isNaN(minute)) {
    return "-";
  }
  const d = new Date(minute * 60000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDate(minute) {
  if (minute === null || minute === undefined || Number.isNaN(minute)) {
    return "";
  }
  const d = new Date(minute * 60000);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

function formatDuration(totalMinutes) {
  const abs = Math.abs(totalMinutes);
  if (abs < 60) {
    return `${abs}分钟`;
  }
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (minutes === 0) {
    return `${hours}小时`;
  }
  return `${hours}小时${minutes}分`;
}

function formatCountdown(totalMinutes) {
  const abs = Math.abs(totalMinutes);
  if (abs >= 1440) {
    const days = Math.floor(abs / 1440);
    const hours = Math.floor((abs % 1440) / 60);
    return `${days}天${hours > 0 ? hours + "时" : ""}`;
  }
  if (abs >= 60) {
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }
  return `${abs}分`;
}

const PRECISION_CYCLE = ["hour", "minute", "second"];
const PRECISION_LABELS = { hour: "小时", minute: "分钟", second: "秒" };

function formatCompactCountdown(targetMinute, precision) {
  if (precision === "hour") {
    const totalMinutes = Math.abs(targetMinute - nowMinute());
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    if (days > 0) {
      return `${days}天${hours > 0 ? hours + "时" : ""}`;
    }
    return `${hours}时`;
  }

  if (precision === "minute") {
    const totalMinutes = Math.abs(targetMinute - nowMinute());
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const mins = totalMinutes % 60;
    if (days > 0) {
      return `${days}天${hours}时${mins > 0 ? mins + "分" : ""}`;
    }
    if (hours > 0) {
      return `${hours}时${String(mins).padStart(2, "0")}分`;
    }
    return `${mins}分`;
  }

  // precision === "second"
  const diffMs = Math.abs(targetMinute * 60000 - Date.now());
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (days > 0) {
    return `${days}天${hours}时${String(mins).padStart(2, "0")}分${String(secs).padStart(2, "0")}秒`;
  }
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function compactRemainingLabel(targetMinute, precision) {
  const isOverdue = targetMinute * 60000 - Date.now() < 0;
  const text = formatCompactCountdown(targetMinute, precision);
  return isOverdue ? `超时 ${text}` : text;
}

function urgencyClass(remaining) {
  if (remaining < 0) return "urgency-overdue";
  if (remaining <= 10) return "urgency-danger";
  if (remaining <= 30) return "urgency-warning";
  if (remaining <= 120) return "urgency-normal";
  return "urgency-relaxed";
}

function remainingLabel(remaining) {
  if (remaining < 0) {
    return `超时 ${formatCountdown(remaining)}`;
  }
  return formatCountdown(remaining);
}

function parseDateMinute(dateString) {
  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return Math.floor(timestamp / 60000);
}

function selectedTimer() {
  return state.timers.find((timer) => timer.id === state.selectedTimerId) || null;
}

const tauriInvoke = createTauriInvoke(() => window.__TAURI__);

function tauriWindowApi() {
  const tauri = window.__TAURI__;
  if (!tauri) {
    return null;
  }
  return {
    appWindow: tauri.window?.appWindow || tauri.webviewWindow?.getCurrent?.(),
    LogicalSize: tauri.window?.LogicalSize || tauri.webviewWindow?.LogicalSize,
  };
}

async function applyCompactWindowStyle(compactMode) {
  const api = tauriWindowApi();
  if (!api?.appWindow || !api?.LogicalSize) {
    return;
  }

  try {
    if (compactMode) {
      await api.appWindow.setSize(new api.LogicalSize(470, 360));
      if (api.appWindow.setAlwaysOnTop) {
        await api.appWindow.setAlwaysOnTop(true);
      }
    } else {
      await api.appWindow.setSize(new api.LogicalSize(1320, 860));
      if (api.appWindow.setAlwaysOnTop) {
        await api.appWindow.setAlwaysOnTop(false);
      }
    }
  } catch (_error) {
    // ignore window resize failures across runtime variants
  }
}

function setCompactMode(enabled, persist = true) {
  state.compactMode = enabled;
  document.body.classList.toggle("compact-mode", enabled);
  toggleCompactButton.textContent = enabled ? "退出便签" : "便签模式";
  if (persist) {
    localStorage.setItem(COMPACT_MODE_KEY, enabled ? "1" : "0");
  }
  void applyCompactWindowStyle(enabled);
  renderCompactBar();
}

async function invokeEnvelope(command, payload = {}) {
  try {
    return await invokeEnvelopeWith(tauriInvoke, command, payload);
  } catch (error) {
    const message = formatErrorMessage(error);
    showToast(message);
    throw error;
  }
}

async function createMark(description, todoIds = []) {
  if (!state.selectedTimerId) {
    showToast("请先选择一个倒计时");
    return;
  }

  await invokeEnvelope("mark_create", {
    timer_id: state.selectedTimerId,
    marked_at_minute: nowMinute(),
    description,
    todo_ids: todoIds,
  });
}

async function createTodo(title) {
  if (!state.selectedTimerId) {
    showToast("请先选择一个倒计时");
    return;
  }

  if (!title.trim()) {
    showToast("请输入待办内容");
    return;
  }

  await invokeEnvelope("todo_create", {
    timer_id: state.selectedTimerId,
    title,
    now_minute: nowMinute(),
  });
}

async function deleteTodo(todoId) {
  await invokeEnvelope("todo_delete", {
    todo_id: todoId,
  });
}

function insertOpenTodosToDescription(textarea, todoIdSet) {
  const openTodos = state.todos.filter((todo) => todo.status !== "done");
  if (openTodos.length === 0) {
    showToast("暂无进行中的待办");
    return;
  }

  const prefix = textarea.value.trim().length > 0 ? "\n" : "";
  const lines = openTodos.map((todo) => `- ${todo.title}`).join("\n");
  textarea.value += `${prefix}${lines}`;

  for (const todo of openTodos) {
    todoIdSet.add(todo.id);
  }

  showToast(`已插入 ${openTodos.length} 条待办`);
}

function renderTimers() {
  timerListNode.innerHTML = "";

  for (const timer of state.timers) {
    const remaining = timer.target_at_minute - nowMinute();
    const urgency = urgencyClass(remaining);
    const isActive = timer.id === state.selectedTimerId;

    const li = document.createElement("li");
    li.className = `timer-card ${urgency} ${isActive ? "active" : ""}`;

    // Click the card to select
    li.onclick = async (e) => {
      if (e.target.tagName === "BUTTON") return;
      state.selectedTimerId = timer.id;
      state.insertedTodoIds.clear();
      state.compactInsertedTodoIds.clear();
      await refreshMarksAndTodos();
      renderAll();
    };

    const nameEl = document.createElement("div");
    nameEl.className = "timer-name";
    nameEl.textContent = timer.name;

    const countdownEl = document.createElement("div");
    countdownEl.className = "timer-countdown";
    countdownEl.textContent = remainingLabel(remaining);

    const deadlineEl = document.createElement("div");
    deadlineEl.className = "timer-deadline";
    deadlineEl.textContent = `${formatDate(timer.target_at_minute)} ${formatTime(timer.target_at_minute)}`;

    // Progress bar
    const progressEl = document.createElement("div");
    progressEl.className = "timer-progress";
    const progressFill = document.createElement("div");
    progressFill.className = "timer-progress-fill";
    const totalSpan = timer.target_at_minute - timer.created_at_minute;
    const elapsed = nowMinute() - timer.created_at_minute;
    const pct = totalSpan > 0 ? Math.min(100, Math.max(0, (elapsed / totalSpan) * 100)) : 100;
    progressFill.style.width = `${pct}%`;
    progressEl.append(progressFill);

    const actions = document.createElement("div");
    actions.className = "timer-actions";

    const editButton = document.createElement("button");
    editButton.className = "btn-ghost btn-sm";
    editButton.textContent = "编辑";
    editButton.onclick = async () => {
      const nextName = prompt("名称", timer.name);
      if (!nextName) return;
      const nextTarget = prompt(
        "截止时间（格式：2026-02-22T18:30）",
        new Date(timer.target_at_minute * 60000).toISOString().slice(0, 16),
      );
      if (!nextTarget) return;
      const nextMinute = parseDateMinute(nextTarget);
      if (nextMinute === null) {
        showToast("时间格式无效");
        return;
      }
      await invokeEnvelope("timer_update", {
        timer_id: timer.id,
        name: nextName,
        target_at_minute: nextMinute,
        now_minute: nowMinute(),
      });
      await refreshTimers();
      renderAll();
    };

    const archiveButton = document.createElement("button");
    archiveButton.className = "btn-ghost btn-sm";
    archiveButton.textContent = "归档";
    archiveButton.onclick = async () => {
      await invokeEnvelope("timer_archive", {
        timer_id: timer.id,
        now_minute: nowMinute(),
      });
      if (state.selectedTimerId === timer.id) {
        state.selectedTimerId = null;
        state.marks = [];
        state.todos = [];
        state.insertedTodoIds.clear();
        state.compactInsertedTodoIds.clear();
      }
      await refreshTimers();
      renderAll();
    };

    actions.append(editButton, archiveButton);
    li.append(nameEl, countdownEl, deadlineEl, progressEl, actions);
    timerListNode.append(li);
  }
}

function renderMarks() {
  markListNode.innerHTML = "";

  if (!state.selectedTimerId) {
    selectedTimerNode.textContent = "选择一个倒计时开始";
    selectedTimerNode.className = "current-timer-badge";
    return;
  }

  const timer = selectedTimer();
  if (timer) {
    const remaining = timer.target_at_minute - nowMinute();
    selectedTimerNode.textContent = `${timer.name} — ${remainingLabel(remaining)}`;
    selectedTimerNode.className = `current-timer-badge`;
  } else {
    selectedTimerNode.textContent = "倒计时不存在";
    selectedTimerNode.className = "current-timer-badge";
  }

  for (const mark of [...state.marks].sort((a, b) => b.marked_at_minute - a.marked_at_minute)) {
    const li = document.createElement("li");
    li.className = "mark-card";

    const timeRow = document.createElement("div");
    timeRow.className = "mark-time";

    const timeText = document.createElement("span");
    timeText.textContent = `${formatDate(mark.marked_at_minute)} ${formatTime(mark.marked_at_minute)}`;

    timeRow.append(timeText);

    if (mark.duration_minutes != null) {
      const dur = document.createElement("span");
      dur.className = "mark-duration";
      dur.textContent = formatDuration(mark.duration_minutes);
      timeRow.append(dur);
    }

    li.append(timeRow);

    if (mark.description) {
      const desc = document.createElement("div");
      desc.className = "mark-desc";
      desc.textContent = mark.description;
      li.append(desc);
    } else {
      const empty = document.createElement("div");
      empty.className = "mark-empty";
      empty.textContent = "无记录";
      li.append(empty);
    }

    markListNode.append(li);
  }
}

function renderTodos() {
  todoListNode.innerHTML = "";

  for (const todo of state.todos) {
    const li = document.createElement("li");
    const isDone = todo.status === "done";

    const card = document.createElement("div");
    card.className = `todo-card ${isDone ? "todo-done" : ""}`;

    const checkbox = document.createElement("button");
    checkbox.className = "todo-checkbox";
    checkbox.title = isDone ? "标记未完成" : "标记完成";
    checkbox.onclick = async () => {
      await invokeEnvelope("todo_update_status", {
        todo_id: todo.id,
        status: isDone ? "open" : "done",
        now_minute: nowMinute(),
      });
      await refreshMarksAndTodos();
      renderAll();
    };

    const content = document.createElement("div");
    content.className = "todo-content";

    const title = document.createElement("div");
    title.className = "todo-title";
    title.textContent = todo.title;

    const actions = document.createElement("div");
    actions.className = "todo-actions";

    if (!isDone) {
      const insert = document.createElement("button");
      insert.className = "btn-ghost btn-sm";
      insert.textContent = "插入打卡";
      insert.onclick = () => {
        const textarea = $("mark-description");
        const prefix = textarea.value.trim().length > 0 ? "\n" : "";
        textarea.value += `${prefix}- ${todo.title}`;
        state.insertedTodoIds.add(todo.id);
        showToast("已插入");
      };
      actions.append(insert);
    }

    const remove = document.createElement("button");
    remove.className = "btn-danger btn-sm";
    remove.textContent = "删除";
    remove.onclick = async () => {
      await deleteTodo(todo.id);
      state.insertedTodoIds.delete(todo.id);
      state.compactInsertedTodoIds.delete(todo.id);
      await refreshMarksAndTodos();
      renderAll();
      showToast("已删除待办");
    };
    actions.append(remove);

    content.append(title, actions);
    card.append(checkbox, content);
    li.append(card);
    todoListNode.append(li);
  }
}

function renderCompactTodoSelect() {
  compactTodoSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "从 todo list 选择填入...";
  compactTodoSelect.append(placeholder);

  if (!state.selectedTimerId) {
    compactTodoSelect.disabled = true;
    return;
  }

  const openTodos = state.todos.filter((todo) => todo.status !== "done");
  if (openTodos.length === 0) {
    compactTodoSelect.disabled = true;
    return;
  }

  compactTodoSelect.disabled = false;
  for (const todo of openTodos) {
    const option = document.createElement("option");
    option.value = todo.id;
    option.textContent = todo.title;
    compactTodoSelect.append(option);
  }
}

function renderCompactBar() {
  const timer = selectedTimer();
  compactTimerSelect.innerHTML = "";

  if (state.timers.length === 0) {
    const option = document.createElement("option");
    option.textContent = "暂无倒计时";
    option.value = "";
    compactTimerSelect.append(option);
    compactTimerSelect.disabled = true;
    compactRemaining.textContent = "创建一个倒计时开始";
    compactRemaining.className = "compact-countdown no-timer";
    return;
  }

  compactTimerSelect.disabled = false;
  for (const timerItem of state.timers) {
    const option = document.createElement("option");
    option.value = timerItem.id;
    option.textContent = timerItem.name;
    if (timerItem.id === state.selectedTimerId) {
      option.selected = true;
    }
    compactTimerSelect.append(option);
  }

  if (timer) {
    const remaining = timer.target_at_minute - nowMinute();
    compactRemaining.textContent = compactRemainingLabel(timer.target_at_minute, state.compactPrecision);
    compactRemaining.className = remaining < 0 ? "compact-countdown overdue" : "compact-countdown";
  } else {
    compactRemaining.textContent = "选择倒计时";
    compactRemaining.className = "compact-countdown no-timer";
  }
}

function renderAll() {
  renderTimers();
  renderMarks();
  renderTodos();
  renderCompactTodoSelect();
  renderCompactBar();
}

async function refreshTimers() {
  state.timers = await invokeEnvelope("timer_list", {
    include_archived: false,
  });

  if (state.selectedTimerId && !state.timers.some((timer) => timer.id === state.selectedTimerId)) {
    state.selectedTimerId = null;
  }

  if (!state.selectedTimerId && state.timers.length > 0) {
    state.selectedTimerId = state.timers[0].id;
  }
}

async function refreshMarksAndTodos() {
  if (!state.selectedTimerId) {
    state.marks = [];
    state.todos = [];
    return;
  }

  state.marks = await invokeEnvelope("mark_list_by_timer", {
    timer_id: state.selectedTimerId,
  });
  state.todos = await invokeEnvelope("todo_list_by_timer", {
    timer_id: state.selectedTimerId,
  });
}

$("timer-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("timer-name").value.trim();
  const targetInput = $("timer-target").value;
  const targetMinute = parseDateMinute(targetInput);
  if (!name || targetMinute === null) {
    showToast("请输入名称和截止时间");
    return;
  }

  try {
    await invokeEnvelope("timer_create", {
      name,
      target_at_minute: targetMinute,
      now_minute: nowMinute(),
    });

    $("timer-form").reset();
    await refreshTimers();
    await refreshMarksAndTodos();
    renderAll();
    showToast("已创建");
  } catch (_error) {
    // already handled in invokeEnvelope
  }
});

$("todo-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("todo-title").value.trim();
  await createTodo(title);
  $("todo-form").reset();
  await refreshMarksAndTodos();
  renderAll();
});

$("mark-submit").addEventListener("click", async () => {
  const description = $("mark-description").value;
  await createMark(description, Array.from(state.insertedTodoIds));
  $("mark-description").value = "";
  state.insertedTodoIds.clear();
  await refreshMarksAndTodos();
  renderAll();
  showToast("已打卡");
});

compactTodoSelect.addEventListener("change", (event) => {
  const selectedId = event.target.value;
  if (!selectedId) {
    return;
  }

  const todo = state.todos.find((item) => item.id === selectedId);
  if (!todo) {
    return;
  }

  const textarea = $("compact-mark-input");
  const prefix = textarea.value.trim().length > 0 ? "\n" : "";
  textarea.value += `${prefix}- ${todo.title}`;
  state.compactInsertedTodoIds.add(todo.id);
  compactTodoSelect.value = "";
  showToast("已填入待办");
});

$("compact-mark-submit").addEventListener("click", async () => {
  const description = $("compact-mark-input").value;
  await createMark(description, Array.from(state.compactInsertedTodoIds));
  $("compact-mark-input").value = "";
  state.compactInsertedTodoIds.clear();
  await refreshMarksAndTodos();
  renderAll();
  showToast("已打卡");
});

$("compact-precision-toggle").addEventListener("click", () => {
  const idx = PRECISION_CYCLE.indexOf(state.compactPrecision);
  state.compactPrecision = PRECISION_CYCLE[(idx + 1) % PRECISION_CYCLE.length];
  $("compact-precision-toggle").textContent = PRECISION_LABELS[state.compactPrecision];
  localStorage.setItem(COMPACT_PRECISION_KEY, state.compactPrecision);
  renderCompactBar();
});

compactTimerSelect.addEventListener("change", async (event) => {
  const nextId = event.target.value;
  state.selectedTimerId = nextId || null;
  state.insertedTodoIds.clear();
  state.compactInsertedTodoIds.clear();
  await refreshMarksAndTodos();
  renderAll();
});

toggleCompactButton.addEventListener("click", () => {
  setCompactMode(!state.compactMode);
});

$("open-data-dir").addEventListener("click", async () => {
  try {
    await invokeEnvelope("open_data_dir");
  } catch (_error) {
    // already handled in invokeEnvelope
  }
});

setInterval(() => {
  if (state.timers.length > 0) {
    renderTimers();
    renderMarks();
    renderCompactBar();
  }
}, 1000);

(async () => {
  try {
    await refreshTimers();
    await refreshMarksAndTodos();
    renderAll();

    const compactModeEnabled = localStorage.getItem(COMPACT_MODE_KEY) === "1";
    setCompactMode(compactModeEnabled, false);

    const savedPrecision = localStorage.getItem(COMPACT_PRECISION_KEY);
    if (savedPrecision && PRECISION_CYCLE.includes(savedPrecision)) {
      state.compactPrecision = savedPrecision;
    }
    $("compact-precision-toggle").textContent = PRECISION_LABELS[state.compactPrecision];
  } catch (_error) {
    // silent init failure
  }
})();
