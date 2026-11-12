# TypeScript style

Apply this guide after [development.md](development.md). `npm run lint` checks
it with Biome and `tsc`.

- **Run TypeScript directly; no build step.** Node strips types at load, so
  only erasable syntax is allowed: no `enum`, `namespace`, or constructor
  parameter properties. Use a string-literal union or `as const` object.
- **ES modules with explicit extensions.** Relative imports name the `.ts`
  file; use `import type` for type-only imports.
- **Keep the compiler strict.** No `any` and no non-null assertions (`!`);
  narrow with a check that fails loudly.
- **Write the required docs as TSDoc** `/** … */` blocks. Add `@throws` when a
  caller must handle an error; types carry parameters and returns.
- **Throw `Error` subclasses** named for the failure, with the context a caller
  needs in the message.
- **Await every promise,** return it, or hand it to a function that owns its
  errors.
- **Name files in kebab-case** (`idle-timer.ts`).

```ts
test.each([
  { bank: [100, 200], ledger: [200, 100], expected: [] },
  { bank: [300, 100], ledger: [100], expected: [300] },
  { bank: [100, 100], ledger: [100], expected: [100] },
])('reports $bank against $ledger as $expected', ({ bank, ledger, expected }) => {
  expect(unmatched(bank, ledger)).toEqual(expected);
});
```
