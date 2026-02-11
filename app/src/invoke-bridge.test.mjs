import test from "node:test";
import assert from "node:assert/strict";

import {
  createTauriInvoke,
  formatErrorMessage,
  invokeEnvelopeWith,
  toCamelCase,
  withPayloadAliases,
} from "./invoke-bridge.mjs";

test("toCamelCase converts snake_case keys", () => {
  assert.equal(toCamelCase("target_at_minute"), "targetAtMinute");
  assert.equal(toCamelCase("now_minute"), "nowMinute");
});

test("withPayloadAliases keeps snake_case and adds camelCase", () => {
  const payload = {
    timer_id: "timer-1",
    target_at_minute: 123,
    now_minute: 88,
    name: "vacation",
  };

  const normalized = withPayloadAliases(payload);
  assert.equal(normalized.timer_id, "timer-1");
  assert.equal(normalized.timerId, "timer-1");
  assert.equal(normalized.target_at_minute, 123);
  assert.equal(normalized.targetAtMinute, 123);
  assert.equal(normalized.now_minute, 88);
  assert.equal(normalized.nowMinute, 88);
  assert.equal(normalized.name, "vacation");
});

test("createTauriInvoke uses window.__TAURI__.invoke and passes aliased payload", async () => {
  let calledCommand;
  let calledPayload;

  const invoke = createTauriInvoke(() => ({
    invoke: async (command, payload) => {
      calledCommand = command;
      calledPayload = payload;
      return { ok: true, data: { id: "timer-1" } };
    },
  }));

  await invoke("timer_create", {
    target_at_minute: 120,
    now_minute: 100,
    name: "test",
  });

  assert.equal(calledCommand, "timer_create");
  assert.equal(calledPayload.target_at_minute, 120);
  assert.equal(calledPayload.targetAtMinute, 120);
  assert.equal(calledPayload.now_minute, 100);
  assert.equal(calledPayload.nowMinute, 100);
  assert.equal(calledPayload.name, "test");
});

test("createTauriInvoke falls back to tauri.invoke shape", async () => {
  let called = false;
  const invoke = createTauriInvoke(() => ({
    tauri: {
      invoke: async () => {
        called = true;
        return { ok: true, data: 1 };
      },
    },
  }));

  const data = await invokeEnvelopeWith(invoke, "timer_list", {
    include_archived: false,
  });

  assert.equal(called, true);
  assert.equal(data, 1);
});

test("createTauriInvoke falls back to core.invoke shape", async () => {
  let called = false;
  const invoke = createTauriInvoke(() => ({
    core: {
      invoke: async () => {
        called = true;
        return { ok: true, data: ["x"] };
      },
    },
  }));

  const data = await invokeEnvelopeWith(invoke, "timer_list", {
    include_archived: false,
  });

  assert.equal(called, true);
  assert.deepEqual(data, ["x"]);
});

test("invokeEnvelopeWith throws readable error for empty response", async () => {
  const invoke = async () => undefined;

  await assert.rejects(
    () => invokeEnvelopeWith(invoke, "timer_create", {}),
    /命令 timer_create 返回了空响应/,
  );
});

test("invokeEnvelopeWith throws backend error message", async () => {
  const invoke = async () => ({
    ok: false,
    error: { message: "timer name cannot be empty" },
  });

  await assert.rejects(
    () => invokeEnvelopeWith(invoke, "timer_create", {}),
    /timer name cannot be empty/,
  );
});

test("formatErrorMessage never returns undefined", () => {
  assert.equal(formatErrorMessage(undefined), "未知错误");
  assert.equal(formatErrorMessage(null), "未知错误");
  assert.equal(formatErrorMessage("boom"), "boom");
  assert.equal(formatErrorMessage({ reason: "bad request" }), "bad request");
});
