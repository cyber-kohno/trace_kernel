# Trace Kernel

Trace Kernel is a desktop app for writing and running small TypeScript-based
workflows inside a local application.

It is intended for day-to-day technical tasks such as inspecting files,
transforming CSV or text data, checking logs, and running small pieces of logic
while keeping inputs, context, code, and output together in a workspace.

This README is a draft for developers joining the project. It focuses on the
minimum information needed to set up the app and follow the current source code
conventions.

## Prerequisites

The following tools are expected to be installed before setting up the project.

- Node.js
- npm
- rustup

## Setup

Install frontend dependencies from the app directory.

```sh
npm install
```

## Development

Start the Tauri development app with:

```sh
npm run tauri dev
```

The Rust build can take some time, especially on the first run or after changes
under `src-tauri`.

## Source Placement

Do not create application source files directly under `src`.

Except for generated files, application code should be placed under `src/app`.
`src/app/Entry.svelte` is the entry point for the app UI.

## Naming Conventions

TypeScript files use lowercase kebab-case.

```text
example-util.ts
worker-adapter.ts
```

Svelte component files use PascalCase.

```text
ProgramDialog.svelte
TextInput.svelte
```

## TypeScript Export Policy

Avoid directly exporting multiple functions or types from one TypeScript file.

Use one of the following styles:

- Define related functions and types inside a namespace, then `default export`
  the namespace.
- For a large standalone function, define one function per file and `default
  export` that function.

This keeps call sites and ownership boundaries easier to follow as the codebase
grows.
