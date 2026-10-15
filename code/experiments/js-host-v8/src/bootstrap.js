(() => {
  const core = Deno.core;
  const url = core.loadExtScript("ext:deno_web/00_url.js");
  const encoding = core.loadExtScript("ext:deno_web/08_text_encoding.js");
  const base64 = core.loadExtScript("ext:deno_web/05_base64.js");
  const clone = core.loadExtScript("ext:deno_web/13_message_port.js");
  const timers = core.loadExtScript("ext:deno_web/02_timers.js");
  const { DOMException } = core.loadExtScript(
    "ext:deno_web/01_dom_exception.js",
  );
  // Deno's native Base64 decoder uses this error class. Register it before
  // exposing atob; bootstrap-source verification may install this twice.
  if (!Object.hasOwn(globalThis, "atob")) {
    core.registerErrorBuilder(
      "DOMExceptionInvalidCharacterError",
      (message) => new DOMException(message, "InvalidCharacterError"),
    );
  }
  const pending = new Set();
  const cancelTimer = timers.clearTimeout;
  const clear = (id) => {
    pending.delete(id);
    cancelTimer(id);
  };
  const schedule = (repeats, callback, delay, args) => {
    let id;
    const handler =
      typeof callback === "function"
        ? callback
        : new Function(String(callback));
    id = (repeats ? timers.setInterval : timers.setTimeout)(() => {
      if (!repeats) pending.delete(id);
      core.ops.op_spike_checkpoint();
      handler(...args);
    }, delay);
    pending.add(id);
    return id;
  };
  Object.assign(globalThis, {
    URL: url.URL,
    URLSearchParams: url.URLSearchParams,
    TextEncoder: encoding.TextEncoder,
    TextDecoder: encoding.TextDecoder,
    atob: base64.atob,
    btoa: base64.btoa,
    structuredClone: clone.structuredClone,
    DOMException,
    setTimeout: (callback, delay, ...args) =>
      schedule(false, callback, delay, args),
    setInterval: (callback, delay, ...args) =>
      schedule(true, callback, delay, args),
    clearTimeout: clear,
    clearInterval: clear,
    __invoke: (command, payload) => {
      core.ops.op_spike_checkpoint();
      return core.ops.op_spike_invoke(command, payload);
    },
    __beginWork: core.ops.op_spike_begin,
    __finishNative: core.ops.op_spike_finish_native,
    __finishWork: () => {
      core.ops.op_spike_checkpoint();
      for (const id of pending) clear(id);
    },
  });
})();
