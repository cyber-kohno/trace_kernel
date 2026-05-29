import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createMinimalWorkspace } from '../src/app/workspace/workspace-fixture.js';
import { WORKSPACE_GEN } from '../src/app/workspace/workspace-version.js';

const outputPath = resolve(
  process.cwd(),
  `src/app/workspace/schema/v${WORKSPACE_GEN}.min.json`,
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(createMinimalWorkspace(), null, 2)}\n`,
  'utf8',
);

console.log(`Wrote workspace fixture: ${outputPath}`);
