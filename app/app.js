const state = {
  timers: [],
  selectedTimerId: null,
  marks: [],
  todos: [],
  insertedTodoIds: new Set(),
  compactInsertedTodoIds: new Set(),
  compactMode: false,
};

const COMPACT_MODE_KEY = "countdown_todo_compact_mode";

const $ = (id) => document.getElementById(id);

const statusNode = $("status");
const timerListNode = $("timer-list");
const selectedTimerNode = $("selected-timer");
const markListNode = $("mark-list");
const todoListNode = $("todo-list");
const compactTimerSelect = $("compact-timer-select");
const compactRemaining = $("compact-remaining");
const toggleCompactButton = $("toggle-compact");

function setStatus(message) {
  statusNode.textContent = message;
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

function parseDateMinute(dateString) {
  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return Math.floor(timestamp / 60000);
}

function remainingText(timer) {
  const remaining = timer.target_at_minute - nowMinute();
  if (remaining >= 0) {
    return `剩余 ${remaining} 分钟`;
  }
  return `已超时 ${Math.abs(remaining)} 分钟`;
}

function selectedTimer() {
  return state.timers.find((timer) => timer.id === state.selectedTimerId) || null;
}

function tauriInvoke(command, payload = {}) {
  const tauri = window.__TAURI__;
  if (tauri?.invoke) {
    return tauri.invoke(command, payload);
  }
  if (tauri?.tauri?.invoke) {
    return tauri.tauri.invoke(command, payload);
  }
  if (tauri?.core?.invoke) {
    return tauri.core.invoke(command, payload);
  }
  return Promise.reject(new Error("Tauri invoke 不可用，请在桌面应用内运行。"));
}

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
    const response = await tauriInvoke(command, payload);
    if (!response.ok) {
      throw new Error(response?.error?.message || "命令执行失败");
    }
    return response.data;
  } catch (error) {
    setStatus(`错误: ${error.message}`);
    throw error;
  }
}

async function createMark(description, todoIds = []) {
  if (!state.selectedTimerId) {
    setStatus("请先选择 Timer");
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
    setStatus("请先选择 Timer");
    return;
  }

  if (!title.trim()) {
    setStatus("Todo 内容不能为空");
    return;
  }

  await invokeEnvelope("todo_create", {
    timer_id: state.selectedTimerId,
    title,
    now_minute: nowMinute(),
  });
}

function insertOpenTodosToDescription(textarea, todoIdSet) {
  const openTodos = state.todos.filter((todo) => todo.status !== "done");
  if (openTodos.length === 0) {
    setStatus("没有进行中的 Todo 可插入");
    return;
  }

  const prefix = textarea.value.trim().length > 0 ? "\n" : "";
  const lines = openTodos.map((todo) => `- ${todo.title}`).join("\n");
  textarea.value += `${prefix}${lines}`;

  for (const todo of openTodos) {
    todoIdSet.add(todo.id);
  }

  setStatus(`已插入 ${openTodos.length} 条进行中 Todo`);
}

function renderTimers() {
  timerListNode.innerHTML = "";

  for (const timer of state.timers) {
    const li = document.createElement("li");
    li.className = `timer-card ${timer.id === state.selectedTimerId ? "active" : ""}`;

    const title = document.createElement("strong");
    title.textContent = timer.name;

    const meta = document.createElement("div");
    meta.className = "timer-meta";
    meta.innerHTML = `
      <span>${remainingText(timer)}</span>
      <span>截止: ${formatMinute(timer.target_at_minute)}</span>
    `;

    const actions = document.createElement("div");
    actions.className = "timer-actions";

    const selectButton = document.createElement("button");
    selectButton.textContent = "选择";
    selectButton.onclick = async () => {
      state.selectedTimerId = timer.id;
      state.insertedTodoIds.clear();
      state.compactInsertedTodoIds.clear();
      await refreshMarksAndTodos();
      renderAll();
    };

    const editButton = document.createElement("button");
    editButton.textContent = "编辑";
    editButton.onclick = async () => {
      const nextName = prompt("新名称", timer.name);
      if (!nextName) {
        return;
      }
      const nextTarget = prompt(
        "新的截止时间（格式：2026-02-22T18:30）",
        new Date(timer.target_at_minute * 60000).toISOString().slice(0, 16),
      );
      if (!nextTarget) {
        return;
      }
      const nextMinute = parseDateMinute(nextTarget);
      if (nextMinute === null) {
        setStatus("截止时间格式无效");
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

    actions.append(selectButton, editButton, archiveButton);
    li.append(title, meta, actions);
    timerListNode.append(li);
  }
}

function renderMarks() {
  markListNode.innerHTML = "";

  if (!state.selectedTimerId) {
    selectedTimerNode.textContent = "请选择一个 Timer";
    return;
  }

  const timer = selectedTimer();
  selectedTimerNode.textContent = timer
    ? `当前 Timer: ${timer.name}（${remainingText(timer)}）`
    : "当前 Timer 不存在";

  for (const mark of [...state.marks].sort((a, b) => b.marked_at_minute - a.marked_at_minute)) {
    const li = document.createElement("li");
    const todoLinks = mark.todo_ids.length ? ` | todo: ${mark.todo_ids.join(", ")}` : "";
    li.innerHTML = `
      <strong>${formatMinute(mark.marked_at_minute)}</strong>
      <span>上次: ${formatMinute(mark.prev_marked_at_minute)} | 间隔: ${mark.duration_minutes ?? "-"} 分钟${todoLinks}</span>
      <span>${mark.description || "(空描述)"}</span>
    `;
    markListNode.append(li);
  }
}

function renderTodos() {
  todoListNode.innerHTML = "";

  for (const todo of state.todos) {
    const li = document.createElement("li");
    const title = document.createElement("span");
    title.textContent = todo.title;

    const meta = document.createElement("span");
    meta.textContent = `${todo.status === "done" ? "已完成" : "进行中"} | 创建: ${formatMinute(
      todo.created_at_minute,
    )}`;

    const actions = document.createElement("div");
    actions.className = "todo-actions";

    const toggle = document.createElement("button");
    toggle.textContent = todo.status === "done" ? "标记未完成" : "标记完成";
    toggle.onclick = async () => {
      await invokeEnvelope("todo_update_status", {
        todo_id: todo.id,
        status: todo.status === "done" ? "open" : "done",
        now_minute: nowMinute(),
      });
      await refreshMarksAndTodos();
      renderAll();
    };

    const insert = document.createElement("button");
    insert.textContent = "插入 Mark";
    insert.onclick = () => {
      const textarea = $("mark-description");
      const prefix = textarea.value.trim().length > 0 ? "\n" : "";
      textarea.value += `${prefix}- ${todo.title}`;
      state.insertedTodoIds.add(todo.id);
      setStatus(`已插入 todo: ${todo.title}`);
    };

    actions.append(toggle, insert);
    li.append(title, meta, actions);
    todoListNode.append(li);
  }
}

function renderCompactBar() {
  const timer = selectedTimer();
  compactTimerSelect.innerHTML = "";

  if (state.timers.length === 0) {
    const option = document.createElement("option");
    option.textContent = "暂无 Timer";
    option.value = "";
    compactTimerSelect.append(option);
    compactTimerSelect.disabled = true;
    compactRemaining.textContent = "请先创建 Timer";
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

  compactRemaining.textContent = timer ? remainingText(timer) : "请选择 Timer";
}

function renderAll() {
  renderTimers();
  renderMarks();
  renderTodos();
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
    setStatus("请输入合法的 timer 名称和截止时间");
    return;
  }

  await invokeEnvelope("timer_create", {
    name,
    target_at_minute: targetMinute,
    now_minute: nowMinute(),
  });

  $("timer-form").reset();
  await refreshTimers();
  await refreshMarksAndTodos();
  renderAll();
  setStatus("Timer 已创建");
});

$("todo-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("todo-title").value.trim();
  await createTodo(title);
  $("todo-form").reset();
  await refreshMarksAndTodos();
  renderAll();
  setStatus("Todo 已创建");
});

$("mark-submit").addEventListener("click", async () => {
  const description = $("mark-description").value;
  await createMark(description, Array.from(state.insertedTodoIds));
  $("mark-description").value = "";
  state.insertedTodoIds.clear();
  await refreshMarksAndTodos();
  renderAll();
  setStatus("Mark 已保存");
});

$("compact-insert-open-todos").addEventListener("click", () => {
  const textarea = $("compact-mark-input");
  insertOpenTodosToDescription(textarea, state.compactInsertedTodoIds);
});

$("compact-mark-submit").addEventListener("click", async () => {
  const description = $("compact-mark-input").value;
  await createMark(description, Array.from(state.compactInsertedTodoIds));
  $("compact-mark-input").value = "";
  state.compactInsertedTodoIds.clear();
  await refreshMarksAndTodos();
  renderAll();
  setStatus("便签 Mark 已保存");
});

$("compact-todo-submit").addEventListener("click", async () => {
  const input = $("compact-todo-input");
  const title = input.value.trim();
  await createTodo(title);
  input.value = "";
  await refreshMarksAndTodos();
  renderAll();
  setStatus("便签 Todo 已创建");
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

$("compact-exit").addEventListener("click", () => {
  setCompactMode(false);
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

    setStatus("已连接到 Tauri 后端");
  } catch (_error) {
    setStatus("启动失败：请在 Tauri 桌面环境运行");
  }
})();
