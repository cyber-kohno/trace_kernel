async function runCli(input, libs, RuntimeCore, CompilerCore) {
  const R = RuntimeCore,
    C = CompilerCore;
  const host = globalThis.__cliHost;
  delete globalThis.__cliHost;
  let phase = 4;
  const emit = (kind, value) => host.emit(kind, JSON.stringify(value));
  const native = {
    call: async (command, args) => {
      const response = JSON.parse(
        await host.invoke(command, JSON.stringify(args)),
      );
      if (!response.ok) throw new Error(response.error);
      return response.value;
    },
  };
  const message = (value) =>
    value instanceof Error ? value.message : String(value);
  const diagnostics = (name, values) =>
    values.map((d) => `${name}:${d.line}:${d.column}: ${d.message}`).join("\n");
  try {
    const professional = input.licenseKey != null;
    if (professional)
      await R.License.parseActivateInfoFromProductKey(input.licenseKey);
    phase = 3;
    const loaded = R.WorkspaceCodec.prepareFile(input.workspace, R.CURRENT_GEN);
    if (loaded.status !== "ok")
      throw new Error(
        loaded.message ?? "Workspace requires GUI migration and save",
      );
    const workspace = loaded.workspace;
    for (const key of [
      "envs",
      "resources",
      "datasets",
      "processes",
      "logics",
      "works",
    ])
      if (
        !Array.isArray(workspace[key]) ||
        workspace[key].some((item) => item == null || typeof item !== "object")
      )
        throw new Error(`Invalid Workspace collection: ${key}`);
    if (typeof workspace.declare?.source !== "string")
      throw new Error("Invalid Declare source");
    for (const value of [workspace.gen.workspace, workspace.gen.api])
      if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
        throw new Error("Invalid generation metadata");
    for (const work of workspace.works)
      if (
        typeof work.name !== "string" ||
        typeof work.source !== "string" ||
        typeof work.method !== "string"
      )
        throw new Error("Invalid Work structure");
    if (input.mode === "list") {
      emit(
        "list",
        workspace.works.map(({ name, method }) => ({ name, method })),
      );
      return JSON.stringify({ code: 0 });
    }
    const matches = workspace.works.filter((work) => work.name === input.work);
    if (matches.length !== 1)
      throw new Error(
        matches.length
          ? "Work name is ambiguous"
          : `Work not found: ${input.work}`,
      );
    const work = matches[0];
    if (!["plain", "channel"].includes(work.method))
      throw new Error(`Unsupported Work output: ${work.method}`);
    const disables = R.ValidateWorkspace(workspace);
    if (
      disables.some(
        (item) => item.cat === "work" && workspace.works[item.index] === work,
      )
    )
      throw new Error("Selected Work is invalid");
    const plan = R.createWorkExecutionPlan({
      workspace,
      work,
      disables,
      professional,
    });
    const allLogics = plan.contextData.logics;
    const names = allLogics.map((logic) => logic.name);
    const reached = new Set(C.referencedLogics(work.source, names));
    const pending = [...reached];
    while (pending.length) {
      const name = pending.pop();
      const logic = allLogics.find((logic) => logic.name === name);
      for (const next of C.referencedLogics(logic.source, names))
        if (!reached.has(next)) {
          reached.add(next);
          pending.push(next);
        }
    }
    plan.contextData = {
      ...plan.contextData,
      logics: allLogics.filter((logic) => reached.has(logic.name)),
    };
    const api = (name) => {
      const d = C.ApiDeclarations.createUtilDeclareDef(name);
      return `${d.typeDec}\ndeclare const $${name}: ${d.valueDec};`;
    };
    const declarations = {
      contextDeclarations: C.ContextDeclarations.createDeclareDef(
        plan.contextData,
        workspace.declare.source,
      ),
      apiDeclarations: plan.usableUtils.map(api),
      declare: workspace.declare.source,
    };
    const workDiagnostics = await C.validateWorkTypes(
      work,
      declarations,
      libs,
      "cli",
    );
    if (workDiagnostics.length)
      throw new Error(diagnostics(work.name, workDiagnostics));
    for (const logic of plan.contextData.logics) {
      const shape = C.LogicSource.validate(logic.source);
      if (shape.length)
        throw new Error(
          shape
            .map(
              (d) =>
                `Logic ${logic.name}:${d.startLineNumber}:${d.startColumn}: ${d.message}`,
            )
            .join("\n"),
        );
      const context = C.ContextDeclarations.createDeclareDef(
        {
          ...plan.contextData,
          logics: plan.contextData.logics.filter(
            (peer) => peer.name !== logic.name,
          ),
        },
        workspace.declare.source,
      );
      const errors = await C.validateWorkTypes(
        { source: C.logicAsWork(logic.source) },
        {
          contextDeclarations: context,
          apiDeclarations: [api("parser")],
          declare: workspace.declare.source,
        },
        libs,
        "cli",
      );
      if (errors.length)
        throw new Error(diagnostics(`Logic ${logic.name}`, errors));
    }
    if (input.mode === "check") return JSON.stringify({ code: 0 });
    const execution = R.compileWorkExecution(
      plan,
      C.TypeScript.transpileTsToJs,
    );
    phase = 1;
    emit("mode", work.method);
    const registrations = new Map();
    let scheduler;
    const cache = {
      progress: { current: 0, total: 0 },
      preparation: { datasetMap: [] },
      vfs: null,
      rust: {
        executionId: "cli",
        logQueues: new Map(),
        channelReady: registrations,
      },
      scheduleFlush: (id) => scheduler.schedule(id),
      createVFS: () => {
        const vfs = R.RuntimeCache.getInitialVfsState();
        cache.vfs = vfs;
        return vfs;
      },
    };
    scheduler = R.createFlushScheduler({
      getBatches: (id) => cache.rust.logQueues.get(id)?.splice(0) ?? [],
      appendToRuntime: async (id, batches) => {
        await registrations.get(id);
        await native.call("append_lines", { channelId: id, batches });
      },
      notifyUI: () => {},
      getActiveChannelIds: () => [...cache.rust.logQueues.keys()],
      hasAnyPending: () =>
        [...cache.rust.logQueues.values()].some((queue) => queue.length > 0),
    });
    const register = (definition) => {
      if (registrations.has(definition.id))
        throw new Error(`Duplicate channel: ${definition.id}`);
      const ready = native.call("add_channel", {
        channelId: definition.id,
        definition,
      });
      registrations.set(definition.id, ready);
      void ready.catch(() => {});
      return ready;
    };
    const parser = () => R.Parser.getObject(cache.rust, native);
    const ports = {
      plainChannelId: R.RuntimeCache.PLAIN_CHANNEL_ID,
      appendLines: (id, lines) => {
        const queue = cache.rust.logQueues.get(id) ?? [];
        cache.rust.logQueues.set(id, queue);
        queue.push(lines);
        scheduler.schedule(id);
      },
      registerChannel: register,
      createFileSystem: () => R.FileSystem.getObject(cache, native),
      createRuntime: () => R.Runtime.getObject(),
      createNetwork: () => R.Network.getObject(cache.rust, native),
      createParser: parser,
      createState: () =>
        R.createStateApi(cache.progress, (event) => emit("state", event)),
    };
    const contextPorts = {
      readTextFile: (req) => native.call("read_file", { req }),
      runProcess: (req) => native.call("run_process", { req }),
      createParserObject: parser,
      transpileLogic: C.TypeScript.transpileTsModuleToCjs,
    };
    const outcome = await R.runPreparedWork(execution, {
      initialize: () => {},
      createReservedApi: (name) => R.createReservedApi(name, ports),
      scanDirectory: (req) => native.call("scan_directory", { req }),
      onPrepared: (datasets) => {
        cache.preparation.datasetMap = datasets;
      },
      prepareOutput: (method) =>
        method === "plain"
          ? register({
              id: R.RuntimeCache.PLAIN_CHANNEL_ID,
              view: "text",
              detail: {},
            })
          : undefined,
      createContext: (data, datasets) =>
        R.createWorkContext(data, datasets, contextPorts),
      isExitSignal: R.Runtime.isExitSignal,
      waitForRegistrations: () => {
        host.finishTimers();
        return Promise.all(registrations.values());
      },
      flushOutput: () => scheduler.finish(),
    });
    host.finishNative();
    if (outcome.status === "failed") throw outcome.error;
    const orders = cache.vfs
      ? R.PlanNormalize.convertVfsToOrder(cache.vfs)
      : [];
    if (orders.length && !input.commit)
      return JSON.stringify({
        code: 5,
        message:
          "VFS transaction was not applied. Specify --commit to apply it.",
      });
    if (orders.length) {
      const io = {
        existsPath: (path) => native.call("exists_path", { path }),
        stat: (path) => native.call("stat", { path }),
        readDirectory: (dir) => native.call("read_dir", { dir }),
        readText: (filePath, encoding) =>
          native.call("read_file", { req: { filePath, encoding } }),
        saveText: (path, content, encoding) =>
          native.call("save_binary", {
            path,
            bytes: Array.from(R.Data.encodeText(content, encoding)),
          }),
        deleteFile: (path) => native.call("delete_file", { path }),
        deleteDir: (path) => native.call("delete_dir", { path }),
        renameFile: (from, to) => native.call("rename", { from, to }),
        copyFile: (src, dest) => native.call("copy_file", { src, dest }),
        makeDir: (dirPath) => native.call("make_dir", { dirPath }),
      };
      const session = R.TransactionService.create(orders, io);
      const result = await session.run(({ state, completedCount }) =>
        emit("transaction", { state, completedCount }),
      );
      if (result.kind !== "success")
        throw new Error(
          `Transaction ${result.kind}; applied ${session.getSnapshot().completedCount} operations. ${JSON.stringify(result)}`,
        );
    }
    host.finishNative();
    return JSON.stringify({ code: 0 });
  } catch (error) {
    host.finishTimers();
    return JSON.stringify({ code: phase, message: message(error) });
  }
}
