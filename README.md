# Broken Nest: Incomplete Prototype Pollution Fix in `nested-property` v4.0.0

**Package:** [`nested-property`](https://www.npmjs.com/package/nested-property) — v4.0.0 (latest)
**License:** MIT

This repository documents and reproduces a bypass of the prototype pollution fix that shipped in `nested-property` v4.0.0.
The goal is to provide a minimal, reviewer-friendly codebase that shows how the current guard only protects `Object.prototype`,
while leaving other built‑in prototypes such as `Array.prototype` and `Function.prototype` writable from untrusted input.

The work is written from the perspective of an independent security researcher who is analyzing a regression in a previously reported issue,
and is intended to be readable by maintainers, security triage teams, and other researchers.

---

## 1. Technical Summary

The v4.0.0 release introduced a guard that throws `ObjectPrototypeMutationError` when the traversal engine attempts to write into `Object.prototype`.
However, the check is implemented as a strict identity comparison against `Reflect.getPrototypeOf({})`, which is exactly `Object.prototype`.
This leaves the rest of the prototype chain unprotected: `Array.prototype`, `Function.prototype`, and other built‑ins remain writable via crafted paths.

Using `nested-property.set()` with non‑plain‑object roots and paths that walk through `__proto__` or `constructor.__proto__`,
an attacker can:

- Flip process‑wide flags on `Array.prototype`
- Override methods such as `Array.prototype.toString`
- Attach new properties to `Function.prototype`

All four proof‑of‑concept vectors in this repository reproduce that behaviour against `nested-property@4.0.0` on current Node.js runtimes.

---

## 2. Reproducing the PoC

### 2.1 Environment

- Node.js v16 or higher
- npm

### 2.2 Clone and install

```bash
git clone https://github.com/blah-blah-cell/broken-nest.git
cd broken-nest
npm install
```

The `package.json` pins `nested-property@4.0.0`. You can verify the version with:

```bash
npm list nested-property
# nested-property@4.0.0
```

### 2.3 Run the prototype pollution PoC

```bash
npm run poc
# or:
node pocs/prototype-pollution-poc.js
```

Expected output (abridged):

```
=== nested-property v4.0.0 — Prototype Pollution Bypass PoC ===

--- Vector 1: Array.prototype via __proto__ ---
[1] Array.prototype.polluted: true
[1] Object.prototype.polluted: undefined
[1] [].polluted: true

--- Vector 2: Function.prototype via constructor.__proto__ ---
[2] Function.prototype.polluted: true
[2] (function(){}).polluted: true

--- Vector 3: Array.prototype method hijacking ---
[3] [1,2,3].toString(): HIJACKED
[3] ({}).toString(): [object Object]

--- Vector 4: Array root + constructor.prototype ---
[4] [].injected: owned
[4] ({}).injected: undefined
```

This demonstrates that the `Object.prototype` guard triggers correctly, but the same write operations against `Array.prototype` and `Function.prototype` succeed silently.

---

## 3. Root Cause

In `nested-property/dist/nested-property.js` the prototype guard is implemented as:

```js
if (currentObject === Reflect.getPrototypeOf({})) {
  throw new ObjectPrototypeMutationError("Attempting to mutate Object.prototype");
}
```

`Reflect.getPrototypeOf({})` returns `Object.prototype`, so this check only ever matches a single object instance.
During traversal, when `currentObject` is `Array.prototype`, `Function.prototype`, or any other built‑in prototype, the guard does not fire.

The PoC vectors in this repository exercise those gaps by:

- Starting from a non‑plain root (`[]` or `{ data: [] }`)
- Walking the chain via `__proto__` and `constructor.__proto__`
- Writing into properties on the resulting prototype object

---

## 4. Impact

The impact is process‑wide and persistent until the Node.js process restarts:

- Methods on `Array.prototype` such as `toString`, `join`, or `map` can be overridden, affecting every array created in the process.
- Properties added to `Function.prototype` are visible on every function value, including framework‑level handlers and callbacks.
- Applications that rely on these built‑ins for authorisation checks, data validation, or routing can be steered into incorrect behaviour.

In practice, this makes it possible to build exploit chains that look like:

- Denial of service by replacing `Array.prototype.map` with a non‑function value.
- Privilege bypass by overriding `Array.prototype.includes` used in role checks.
- Code‑execution style attacks in template engines that rely on function and array behaviour.

The existing `Object.prototype` guard gives the impression that "prototype pollution has been fixed" for this package,
while the bypass vectors show that a meaningful portion of the attack surface remains exposed.

---

## 5. Additional Pitfalls in `nested-property`

Beyond the prototype guard, the traversal and helper functions in `nested-property` exhibit other behaviours that are important for defenders to understand:

- **Mass assignment:** Using `nested-property.set()` to apply unfiltered JSON to backend objects can overwrite sibling properties such as `role`.
  See `pocs/mass-assignment-poc.js` for a minimal reproduction.
- **Type confusion:** Numeric segments in paths cause implicit array creation (`settings.0.theme`), which can break application logic that expects a plain object.
  See `pocs/type-confusion-poc.js`.
- **Fail‑open error handling:** The implementation of `hasOwn` wraps property checks in generic `try/catch` blocks and returns `false` on `TypeError`,
  enabling an attacker to shadow `hasOwnProperty` and bypass validation. See `pocs/fail-open-poc.js`.

These behaviours combine with the incomplete prototype guard to make secure use of `nested-property` non‑trivial in code that accepts user‑controlled paths.

---

## 6. Remediation Sketch

The file [`fix-recommendation.js`](./fix-recommendation.js) contains a concrete patch sketch that closes the gaps exercised by this repository.
At a high level, the defensive pattern is:

- Treat a small set of built‑in prototypes (`Object.prototype`, `Array.prototype`, `Function.prototype`, etc.) as non‑writable from user input.
- Deny paths that include dangerous segments such as `__proto__`, `constructor`, or `prototype`.
- Remove generic `try/catch` blocks around validation logic so that type errors propagate to the caller instead of failing open.

The `npm run fix` script runs this patch sketch against the PoC vectors and reports which paths are blocked and which are allowed.

---

## 7. Disclosure and Status

- Vulnerability confirmed on Node.js v22.22.2 with `nested-property@4.0.0`.
- Reported to Snyk, MITRE CVE Program, and the `webdav` maintainer.
- As of June 4, 2026, no patch has shipped and the issue remains unaddressed upstream.

This repository is maintained as a self‑contained, reproducible description of the bug so that downstream users and maintainers
can independently evaluate the risk for their own deployments.

For questions about this work or coordination around further remediation, please open an issue on the GitHub repository.
