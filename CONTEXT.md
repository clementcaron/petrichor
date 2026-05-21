# Petrichor

Petrichor helps a coding agent understand a local codebase with less context overhead. It exists to make code navigation and reasoning more structurally aware.

## Language

**Coding Agent**:
An agent that works through a CLI session to read, edit, and reason about code in a local repository.
_Avoid_: AI, bot, assistant, model

**Repository**:
A local codebase the Coding Agent is working in.
_Avoid_: project, workspace

**Repository Index**:
Petrichor's structured representation of a Repository for navigation and reasoning without opening every file.
_Avoid_: cache, vector store, embedding index

**Structural Query**:
A question about code structure answered from the Repository Index, such as where a symbol is defined or what it relates to.
_Avoid_: grep, text search

**Symbol**:
A top-level named declaration in a Repository that Petrichor can index and return in a Structural Query. In the first runnable slice, this includes top-level named declarations and exports only.
_Avoid_: token, local variable, arbitrary string

**Definition Lookup**:
A Structural Query that returns all exact matches for a Symbol name, with each match including symbol kind and location in deterministic order.
_Avoid_: fuzzy search, best guess

**Context Inflation**:
The growth of irrelevant, redundant, or low-value material in the Coding Agent's working context.
_Avoid_: noise, bloat

## Flagged ambiguities

- **Core project** was ambiguous. In this repo, we resolved it to **first runnable slice**.
- Use **Structural Query** when the intent is to answer from the Repository Index rather than from raw text matching.
- Use **Definition Lookup** for the day-one query rather than the broader phrase "symbol search."

## Example dialogue

**Developer**: Can Petrichor tell the Coding Agent where `Foo` is defined without opening ten files?

**Domain Expert**: Yes. The Coding Agent asks a Definition Lookup against the Repository Index for that Repository.

**Developer**: So the Repository Index is not the Repository itself?

**Domain Expert**: Right. The Repository stays on disk; the Repository Index is Petrichor's structured view of it.
