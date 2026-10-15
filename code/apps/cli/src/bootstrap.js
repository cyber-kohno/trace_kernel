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
  core.registerErrorBuilder(
    "DOMExceptionInvalidCharacterError",
    (message) => new DOMException(message, "InvalidCharacterError"),
  );
  const pending = new Set();
  const clear = (id) => {
    pending.delete(id);
    timers.clearTimeout(id);
  };
  const schedule = (repeats, callback, delay, args) => {
    let id;
    id = (repeats ? timers.setInterval : timers.setTimeout)(() => {
      if (!repeats) pending.delete(id);
      core.ops.op_cli_checkpoint();
      callback(...args);
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
    __cliHost: Object.freeze({
      invoke: (command, payload) => {
        core.ops.op_cli_checkpoint();
        return core.ops.op_cli_invoke(command, payload);
      },
      emit: (kind, payload) => core.ops.op_cli_emit(kind, payload),
      finishTimers: () => {
        core.ops.op_cli_checkpoint();
        for (const id of pending) clear(id);
      },
      finishNative: () => core.ops.op_cli_finish_native(),
    }),
  });
  // Native ops remain captured in host closures, not exposed to Work code.
  delete globalThis.Deno;
})();
