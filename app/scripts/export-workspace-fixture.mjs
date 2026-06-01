import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createWorkspaceSchemaFixture } from '../src/app/workspace/workspace-fixture.js';
import { WORKSPACE_GEN } from '../src/app/workspace/workspace-version.js';

const outputPath = resolve(
  process.cwd(),
  `src/app/workspace/schema/v${WORKSPACE_GEN}.schema.json`,
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(createWorkspaceSchemaFixture(), null, 2)}\n`,
  'utf8',
);

console.log(`Wrote workspace fixture: ${outputPath}`);
