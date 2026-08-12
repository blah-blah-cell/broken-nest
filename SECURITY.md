# Security & Ethical Use Policy

This repository ships proof‑of‑concept material around a prototype pollution issue in `nested-property@4.0.0`.
The intent is to make the behaviour easy to reproduce and to give maintainers and downstream users something concrete
they can run in their own environments.

## Intended Audience and Use

The code and notes here are aimed at:

- Developers who need to understand how incomplete prototype guards can still be reached from user‑controlled data.
- Security engineers and researchers who want a compact, runnable testbed for the bug.
- Triage teams and coordinators involved in CVE assignment and supply‑chain risk review.

The focus is defensive: surface the behaviour, document the impact, and outline a patch sketch.

## Legal and Ethical Boundaries

Do not use these techniques against systems you do not own or operate, or where you do not have clear written permission to test.
Running prototype‑pollution payloads against third‑party services without authorisation can trigger computer‑misuse and anti‑hacking laws
(CFAA, UK Computer Misuse Act, and similar statutes in other jurisdictions).

If you are experimenting locally, keep it to disposable test environments or isolated lab setups.

## Disclosure Notes

The underlying issue has been reported to:

- The `nested-property` maintainer.
- Snyk.
- MITRE’s CVE Program.
- The maintainer of `webdav`, which consumes `nested-property` as a dependency.

Public material in this repository was published after standard disclosure windows elapsed without an upstream patch.

## Coordinated Follow‑up

If you discover related issues or have data points that help close the remaining gaps in upstream code,
open an issue on this repository or reach out via GitHub before publishing exploit details elsewhere.
The goal is to keep the discussion technical and focused on getting robust fixes into the ecosystem.
