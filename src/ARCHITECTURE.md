# src/ layout

This package ships three public entry points that share almost all of their
logic. This doc is the map: what lives where, and why.

```
src/
├── index.ts          Public Node entry point
├── index.edge.ts      Public browser/edge entry point
├── core.ts              Public advanced entry point (@maildeno/renderer/core)
├── types.ts               Public types (Template, RenderOptions, ...)
├── error.ts                 Public RenderError
├── engine.wasm                 The compiled Rust engine — raw material for
│                                both platform loaders below
│
├── shared/                      Platform-agnostic internals. No `node:*`
│   │                            imports, no platform-specific Wasm loading.
│   │                            Runs identically everywhere.
│   ├── render.ts                  createRenderApi(deps) — the orchestration
│   │                              factory: validate → run engine → minify.
│   │                              Both index.ts and index.edge.ts call this
│   │                              with their own platform's deps injected.
│   ├── engine-core.ts              invokeEngine(instance, ...) — the Wasm
│   │                              calling convention (alloc/write/call/read).
│   │                              Takes an already-instantiated
│   │                              WebAssembly.Instance; doesn't know or care
│   │                              how it was obtained.
│   ├── validate.ts                  assertTemplate() — template shape
│   │                              validation, used by both loaders below.
│   └── minify.ts                     minifyOutput() — output post-processing.
│
├── node/                         Node-specific internals.
│   ├── engine.ts                   Reads engine.wasm from disk, next to the
│   │                              compiled JS. Delegates to
│   │                              shared/engine-core.ts to actually run it.
│   └── load.ts                      Reads template files from disk
│                                   (fs + path-traversal guard against
│                                   baseDir). Delegates validation to
│                                   shared/validate.ts.
│
└── edge/                         Browser/edge-specific internals. No disk,
    │                            no network.
    ├── engine.ts                   Decodes a base64 copy of engine.wasm
    │                              embedded in the bundle at build time (see
    │                              tsup.config.ts). Delegates to
    │                              shared/engine-core.ts to run it.
    ├── load.ts                      Only accepts already-parsed templates —
    │                              a string `source` throws immediately
    │                              (TEMPLATE_NOT_FOUND), since there's no
    │                              disk to read a path from. Delegates
    │                              validation to shared/validate.ts.
    └── wasm-module.d.ts               Ambient `declare module "*.wasm"` so
                                       `import x from "../engine.wasm"` in
                                       ./engine.ts type-checks.
```

## The pattern

Every public entry point is the same three lines: import `createRenderApi`
from `shared/render.ts`, import a platform's `runEngine` and
`resolveTemplate`/`defaultBaseDir`, call the factory, re-export the result
plus `RenderError` and the public types.

```ts
// src/index.ts (Node) — src/index.edge.ts and src/core.ts follow the same shape
import { createRenderApi } from "./shared/render.js";
import { runEngine } from "./node/engine.js";
import { resolveTemplate, defaultBaseDir } from "./node/load.js";

const api = createRenderApi({ runEngine, resolveTemplate, defaultBaseDir });
export const render = api.render;
// ...
```

`shared/render.ts` never imports from `node/` or `edge/` — dependencies flow
one way, entry point → platform folder → shared. This is what makes it
possible for `tsup.config.ts` to bundle `index.ts` and `index.edge.ts` as two
independent, non-overlapping outputs (dist/index.mjs stays a ~9 KB Node
bundle; only dist/index.edge.mjs pays for the embedded Wasm) without any
build-time branching or conditional imports — each entry point's module graph
is simply smaller, because it only imports one platform folder.

## Adding a new platform

If a fourth platform ever needs genuinely different loading logic (rather
than just matching an existing one via `package.json#exports` conditions —
most new edge runtimes should just fall into the existing `edge/`
implementation for free), the shape to follow is: add `src/<platform>/`
with `engine.ts` (exporting `runEngine`) and `load.ts` (exporting
`resolveTemplate` and `defaultBaseDir`), add `src/index.<platform>.ts` wiring
them through `createRenderApi`, add a tsup entry, and add the export
condition in `package.json`. `shared/` shouldn't need to change.

## Tests

`tests/` mirrors this layout: `tests/node/`, `tests/edge/`, `tests/shared/`
test the corresponding `src/` folder; `tests/core.test.ts` stays at the top
level next to `tests/fixtures/`, mirroring `src/core.ts`.
