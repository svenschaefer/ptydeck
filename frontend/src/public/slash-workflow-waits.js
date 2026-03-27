function createAbortError(message = "Workflow wait aborted.") {
  const error = new Error(message);
  error.name = "SlashWorkflowWaitAbortError";
  error.code = "workflow.aborted";
  return error;
}

function createTimeoutError(message = "Workflow wait timed out.") {
  const error = new Error(message);
  error.name = "SlashWorkflowWaitTimeoutError";
  error.code = "workflow.timeout";
  return error;
}

function addAbortListener(signal, onAbort) {
  if (!signal) {
    return () => {};
  }
  if (signal.aborted) {
    onAbort();
    return () => {};
  }
  const handler = () => onAbort();
  signal.addEventListener("abort", handler, { once: true });
  return () => signal.removeEventListener("abort", handler);
}

function toRegExp(pattern) {
  if (pattern instanceof RegExp) {
    return pattern;
  }
  if (pattern && typeof pattern === "object" && typeof pattern.source === "string") {
    return new RegExp(pattern.source, typeof pattern.flags === "string" ? pattern.flags : "");
  }
  throw new TypeError("A workflow regex pattern is required.");
}

export function waitDelay(durationMs, options = {}) {
  const signal = options.signal || null;
  const setTimeoutFn = typeof options.setTimeoutFn === "function" ? options.setTimeoutFn : setTimeout;
  const clearTimeoutFn = typeof options.clearTimeoutFn === "function" ? options.clearTimeoutFn : clearTimeout;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError("Workflow delay must be a positive duration.");
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer = null;
    const finish = (callback) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timer !== null) {
        clearTimeoutFn(timer);
      }
      removeAbortListener();
      callback();
    };
    const removeAbortListener = addAbortListener(signal, () => finish(() => reject(createAbortError())));
    timer = setTimeoutFn(() => finish(resolve), durationMs);
  });
}

export function waitIdle(durationMs, options = {}) {
  const signal = options.signal || null;
  const subscribeActivity = options.subscribeActivity;
  const setTimeoutFn = typeof options.setTimeoutFn === "function" ? options.setTimeoutFn : setTimeout;
  const clearTimeoutFn = typeof options.clearTimeoutFn === "function" ? options.clearTimeoutFn : clearTimeout;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError("Workflow idle wait must be a positive duration.");
  }
  if (typeof subscribeActivity !== "function") {
    throw new TypeError("waitIdle requires subscribeActivity().");
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer = null;
    const cleanup = () => {
      if (timer !== null) {
        clearTimeoutFn(timer);
      }
      unsubscribe();
      removeAbortListener();
    };
    const finish = (callback) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      callback();
    };
    const schedule = () => {
      if (timer !== null) {
        clearTimeoutFn(timer);
      }
      timer = setTimeoutFn(() => finish(resolve), durationMs);
    };
    const unsubscribe = subscribeActivity(() => {
      if (!finished) {
        schedule();
      }
    });
    const removeAbortListener = addAbortListener(signal, () => finish(() => reject(createAbortError())));
    schedule();
  });
}

export function waitUntilMatch(pattern, timeoutMs, options = {}) {
  const signal = options.signal || null;
  const subscribe = options.subscribe;
  const setTimeoutFn = typeof options.setTimeoutFn === "function" ? options.setTimeoutFn : setTimeout;
  const clearTimeoutFn = typeof options.clearTimeoutFn === "function" ? options.clearTimeoutFn : clearTimeout;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Workflow wait timeout must be a positive duration.");
  }
  if (typeof subscribe !== "function") {
    throw new TypeError("waitUntilMatch requires subscribe().");
  }
  const regex = toRegExp(pattern);
  return new Promise((resolve, reject) => {
    let finished = false;
    let timer = null;
    const cleanup = () => {
      if (timer !== null) {
        clearTimeoutFn(timer);
      }
      unsubscribe();
      removeAbortListener();
    };
    const finish = (callback) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      callback();
    };
    const unsubscribe = subscribe((value) => {
      const text = typeof value === "string" ? value : String(value ?? "");
      const match = regex.exec(text);
      regex.lastIndex = 0;
      if (!match) {
        return;
      }
      finish(() => resolve(Object.freeze({ value: text, match: Array.from(match) })));
    });
    const removeAbortListener = addAbortListener(signal, () => finish(() => reject(createAbortError())));
    timer = setTimeoutFn(() => finish(() => reject(createTimeoutError())), timeoutMs);
  });
}

export function createSlashWorkflowWaitStepRunner(options = {}) {
  const waitDelayFn = typeof options.waitDelay === "function" ? options.waitDelay : waitDelay;
  const waitIdleFn = typeof options.waitIdle === "function" ? options.waitIdle : waitIdle;
  const waitUntilMatchFn = typeof options.waitUntilMatch === "function" ? options.waitUntilMatch : waitUntilMatch;
  const subscribeActivity = typeof options.subscribeActivity === "function" ? options.subscribeActivity : null;
  const resolveSourceSubscription =
    typeof options.resolveSourceSubscription === "function" ? options.resolveSourceSubscription : () => null;

  return Object.freeze({
    async execute(step, context = {}) {
      if (!step || step.type !== "wait") {
        throw new TypeError("Workflow wait runner expects a wait step.");
      }
      const signal = context.signal || null;
      if (step.mode === "delay") {
        return waitDelayFn(step.duration.ms, { signal });
      }
      if (step.mode === "idle") {
        return waitIdleFn(step.duration.ms, { signal, subscribeActivity });
      }
      if (step.mode === "until") {
        const subscribe = resolveSourceSubscription(step.source);
        return waitUntilMatchFn(step.pattern, step.timeout.ms, { signal, subscribe });
      }
      throw new Error(`Unknown workflow wait mode '${step.mode}'.`);
    }
  });
}

export { createAbortError as createSlashWorkflowWaitAbortError, createTimeoutError as createSlashWorkflowWaitTimeoutError };
