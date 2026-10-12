// Probe-only host profile. It is intentionally not a complete Web API polyfill.
globalThis.TextEncoder = class {
  encode(text = "") {
    return new Uint8Array(JSON.parse(__encode(String(text))));
  }
};
globalThis.TextDecoder = class {
  constructor(encoding = "utf-8") {
    if (!["utf-8", "shift_jis"].includes(encoding)) {
      throw new Error("Unsupported spike TextDecoder encoding");
    }
    this.encoding = encoding;
  }
  decode(bytes = new Uint8Array()) {
    return __decode(JSON.stringify(Array.from(bytes)), this.encoding);
  }
};
{
  let nextTimer = 0;
  const timers = new Set();
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    const id = ++nextTimer;
    timers.add(id);
    __sleep(Math.max(0, Math.min(Number(delay) || 0, 10000))).then(() => {
      if (timers.delete(id)) callback(...args);
    });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };
}
