# Workspace Generation

- `gen-version.js`: current `WORKSPACE_GEN` / `API_GEN`
- `workspace-fixture.js`: current workspace fixture generators
- `schema/vN.schema.json`: saved required-property fixture for each workspace generation

Key functions:

- `createMinimalWorkspace()`: empty workspace for runtime initialization
- `createWorkspaceSchemaFixture()`: required-property fixture for generation diffing

To export the current schema fixture:

```bash
npm run workspace:fixture
```
