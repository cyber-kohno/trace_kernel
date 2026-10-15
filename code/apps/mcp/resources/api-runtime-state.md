# Runtime and State APIs

Use `get_work_context` to confirm that these APIs are present in the selected Work method. Their declarations are stable across `plain` and `channel` Works.

## `$runtime`

- `sleep(ms)` asynchronously waits for the specified millisecond duration. Await it.
- `exit()` stops the current Work by throwing Trace Kernel's runtime exit signal. It is not a return value; code after the call is not reached.

```ts
await $runtime.sleep(250);
$println('Wait finished');
```

## `$state.useProgress`

Pass the total number of planned steps. Call `tick()` once per completed step; `getCurrent()` reads the completed count.

```ts
const progress = $state.useProgress(rows.length);
for (const row of rows) {
  processRow(row);
  progress.tick();
}
$println(`Completed ${progress.getCurrent()} rows`);
```

Keep ticks aligned with completed work, not attempted work. If processing can fail, decide whether failed rows count as completed and place `tick()` accordingly.

## `$state.useMonitor`

Allocate a fixed number of text callbacks. Each callback updates its corresponding monitor slot; call the callback with a string to publish the latest status for that slot.

```ts
const [setPhase, setDetail] = $state.useMonitor(2);
setPhase('Reading input');
setDetail(`Found ${rows.length} rows`);
```

The returned callback array length equals `allocSize`; keep the allocation and destructuring/indexes consistent. These APIs report UI state and do not persist application data.
