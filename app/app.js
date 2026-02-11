const state = {
  timers: [],
  selectedTimerId: null,
  marks: [],
  todos: [],
  insertedTodoIds: new Set(),
};

const $ = (id) => document.getElementById(id);

const statusNode = $("status");
const timerListNode = $("timer-list");
const selectedTimerNode = $("selected-timer");
const markListNode = $("mark-list");
const todoListNode = $("todo-list");

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

function tauriInvoke(command, payload = {}) {
  const tauri = window.__TAURI__;
  if (tauri?.invoke) {
    return tauri.invoke(command, payload);
  }
  if (tauri?.core?.invoke) {
    return tauri.core.invoke(command, payload);
  }
  return Promise.reject(new Error("Tauri invoke 不可用，请在桌面应用内运行。"));
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
        timerId: timer.id,
        name: nextName,
        targetAtMinute: nextMinute,
        nowMinute: nowMinute(),
      });
      await refreshTimers();
      renderAll();
    };

    const archiveButton = document.createElement("button");
    archiveButton.textContent = "归档";
    archiveButton.onclick = async () => {
      await invokeEnvelope("timer_archive", {
        timerId: timer.id,
        nowMinute: nowMinute(),
      });
      if (state.selectedTimerId === timer.id) {
        state.selectedTimerId = null;
        state.marks = [];
        state.todos = [];
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

  const timer = state.timers.find((item) => item.id === state.selectedTimerId);
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
        todoId: todo.id,
        status: todo.status === "done" ? "open" : "done",
        nowMinute: nowMinute(),
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

function renderAll() {
  renderTimers();
  renderMarks();
  renderTodos();
}

async function refreshTimers() {
  state.timers = await invokeEnvelope("timer_list", {
    includeArchived: false,
  });

  if (state.selectedTimerId && !state.timers.some((timer) => timer.id === state.selectedTimerId)) {
    state.selectedTimerId = null;
  }
}

async function refreshMarksAndTodos() {
  if (!state.selectedTimerId) {
    state.marks = [];
    state.todos = [];
    return;
  }

  state.marks = await invokeEnvelope("mark_list_by_timer", {
    timerId: state.selectedTimerId,
  });
  state.todos = await invokeEnvelope("todo_list_by_timer", {
    timerId: state.selectedTimerId,
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
    targetAtMinute: targetMinute,
    nowMinute: nowMinute(),
  });

  $("timer-form").reset();
  await refreshTimers();
  renderAll();
  setStatus("Timer 已创建");
});

$("todo-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.selectedTimerId) {
    setStatus("请先选择 Timer");
    return;
  }

  const title = $("todo-title").value.trim();
  if (!title) {
    setStatus("Todo 内容不能为空");
    return;
  }

  await invokeEnvelope("todo_create", {
    timerId: state.selectedTimerId,
    title,
    nowMinute: nowMinute(),
  });

  $("todo-form").reset();
  await refreshMarksAndTodos();
  renderAll();
  setStatus("Todo 已创建");
});

$("mark-submit").addEventListener("click", async () => {
  if (!state.selectedTimerId) {
    setStatus("请先选择 Timer");
    return;
  }

  const description = $("mark-description").value;
  await invokeEnvelope("mark_create", {
    timerId: state.selectedTimerId,
    markedAtMinute: nowMinute(),
    description,
    todoIds: Array.from(state.insertedTodoIds),
  });

  $("mark-description").value = "";
  state.insertedTodoIds.clear();
  await refreshMarksAndTodos();
  renderAll();
  setStatus("Mark 已保存");
});

setInterval(() => {
  if (state.timers.length > 0) {
    renderTimers();
    renderMarks();
  }
}, 1000);

(async () => {
  try {
    await refreshTimers();
    await refreshMarksAndTodos();
    renderAll();
    setStatus("已连接到 Tauri 后端");
  } catch (_error) {
    setStatus("启动失败：请在 Tauri 桌面环境运行");
  }
})();
