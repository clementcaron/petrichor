# Domain docs

How engineering skills consume this Repository's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the Repository root.
- Relevant ADRs in `docs/adr/`.

If either location does not exist, proceed silently. Domain documentation is created when terminology or architectural decisions are actually resolved.

## Layout

This is a single-context Repository:

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   └── roadmap/
│       └── slices.md
└── src/
```

`CONTEXT.md` defines domain language and current module boundaries. `docs/adr/` contains binding decisions. `docs/roadmap/slices.md` is the persistent Slice Roadmap and is not itself a binding architectural decision.

## Use the glossary's vocabulary

When output names a domain concept—in a slice title, refactor proposal, hypothesis, or test name—use the term defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a required concept is absent, reconsider whether the language belongs to the Repository or note the gap for domain modeling.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it.
