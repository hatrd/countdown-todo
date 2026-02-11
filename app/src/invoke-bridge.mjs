export function toCamelCase(key) {
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

export function withPayloadAliases(payload = {}) {
  const normalized = { ...payload };
  for (const [key, value] of Object.entries(payload)) {
    if (key.includes("_")) {
      normalized[toCamelCase(key)] = value;
    }
  }
  return normalized;
}

export function formatErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object") {
    const maybeMessage =
      error.message ||
      error.error?.message ||
      error.error ||
      error.reason ||
      error.details;

    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }

    try {
      return JSON.stringify(error);
    } catch (_jsonError) {
      return "未知错误";
    }
  }

  return "未知错误";
}

export function createTauriInvoke(getTauriGlobal) {
  return (command, payload = {}) => {
    const invokePayload = withPayloadAliases(payload);
    const tauri =
      typeof getTauriGlobal === "function" ? getTauriGlobal() : getTauriGlobal;

    if (tauri?.invoke) {
      return tauri.invoke(command, invokePayload);
    }
    if (tauri?.tauri?.invoke) {
      return tauri.tauri.invoke(command, invokePayload);
    }
    if (tauri?.core?.invoke) {
      return tauri.core.invoke(command, invokePayload);
    }

    return Promise.reject(
      new Error("Tauri invoke 不可用，请在桌面应用内运行。"),
    );
  };
}

export async function invokeEnvelopeWith(invoke, command, payload = {}) {
  const response = await invoke(command, payload);

  if (!response || typeof response !== "object") {
    throw new Error(`命令 ${command} 返回了空响应`);
  }

  if (!response.ok) {
    throw new Error(
      response?.error?.message || response?.message || `命令 ${command} 执行失败`,
    );
  }

  return response.data;
}
