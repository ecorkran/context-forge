---
name: cf-build
description: Build and load a Context Forge context prompt. Use when the user asks to build, load, or refresh Context Forge context, optionally for a particular phase or slice.
---

# Context Forge Build

1. Run `cf build --json` from the project root. If the user supplied a phase
   or slice, pass it with `--phase <phase>` or `--slice <slice>`.
2. If the command fails, show its error output and stop.
3. Use the returned prompt as your working context.
4. Confirm receipt with exactly one line:
   `Context loaded: {project} | {phase} | {slice}` — take the three values
   from the command's output.
5. Follow the instruction prompt contained in the generated context.
6. If the instruction prompt contains a STOP condition, STOP — do not begin
   work; request the required input instead.
