# Security & Ethical Use Policy

This repository contains proof-of-concept reproductions for an incomplete prototype pollution fix in `nested-property@4.0.0`, along with a defensive patch sketch (`fix-recommendation.js`).

## Intended Audience and Use

This material is meant for:

- Maintainers and downstream developers checking whether their usage of `nested-property` is affected.
- Security engineers and triage teams reproducing the issue during CVE review or supply-chain audits.

## Boundaries

Only run these scripts locally or against systems you own and have explicit authorization to test. Using prototype pollution payloads against third-party systems without permission is unauthorized and may violate applicable computer misuse laws.

## Disclosure Notes

The issue was reported to:

- The `nested-property` maintainer
- Snyk
- MITRE CVE Program
- The maintainer of `webdav` (downstream consumer)

This repository was published after standard disclosure windows elapsed without an upstream fix.

## Follow-up

If you find related edge cases or are coordinating an upstream patch, open an issue on this repository.
