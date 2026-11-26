# Broken Nest: Incomplete Prototype Pollution Fix in `nested-property` v4.0.0

**Package:** [`nested-property`](https://www.npmjs.com/package/nested-property) v4.0.0 (latest)
**License:** MIT

This repo reproduces a bypass of the prototype pollution guard shipped in `nested-property` v4.0.0.
The v4.0.0 check only blocks writes to `Object.prototype`, leaving other built-in prototypes (`Array.prototype`, `Function.prototype`, etc.) writable when paths come from untrusted input.

---

## 1. Technical Summary

`nested-property` v4.0.0 added a guard that throws `ObjectPrototypeMutationError` if traversal hits `Object.prototype`.
Because the check uses strict identity against `Reflect.getPrototypeOf({})` (which is only `Object.prototype`), other built-in prototypes are not caught.

Calling `nested-property.set()` on a non-plain-object root with paths walking `__proto__` or `constructor.__proto__` allows:

- Setting process-wide properties on `Array.prototype`
- Overriding methods such as `Array.prototype.toString`
- Attaching properties to `Function.prototype`

All four vectors in `pocs/` reproduce against `nested-property@4.0.0` on current Node.js runtimes.

---

## 2. Reproducing the PoC

### 2.1 Environment

- Node.js v16+
- npm

### 2.2 Clone and install

```bash
git clone https://github.com/blah-blah-cell/broken-nest.git
cd broken-nest
npm install
```

`package.json` pins `nested-property@4.0.0`. Verify with:

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

The `Object.prototype` guard triggers as expected, while the equivalent writes to `Array.prototype` and `Function.prototype` succeed silently.

---

## 3. Root Cause

In `nested-property/dist/nested-property.js`, the guard is:

```js
if (currentObject === Reflect.getPrototypeOf({})) {
  throw new ObjectPrototypeMutationError("Attempting to mutate Object.prototype");
}
```

`Reflect.getPrototypeOf({})` only matches `Object.prototype`. When traversal resolves `currentObject` to `Array.prototype`, `Function.prototype`, or another built-in prototype, the check does not fire.

The vectors in `pocs/prototype-pollution-poc.js` hit this gap by:

- Starting from a non-plain root (`[]` or `{ data: [] }`)
- Walking the prototype chain through `__proto__` or `constructor.__proto__`
- Writing properties onto the resolved built-in prototype

---

## 4. Impact

Mutations persist across the Node.js process until restart:

- Overriding `Array.prototype` methods (`toString`, `join`, `map`, `includes`) affects every array in the process.
- Properties added to `Function.prototype` appear on every function value, including framework handlers and callbacks.
- Downstream apps relying on these built-ins for authorization checks, validation, or routing can be steered into broken behavior.

Concrete failure modes include:

- Denial of service by replacing `Array.prototype.map` with a non-function value.
- Logic/auth bypass by overriding `Array.prototype.includes` in role checks.
- Code-execution gadgets in template engines or helpers sensitive to inherited function/array properties.

Because v4.0.0 ships an explicit `Object.prototype` guard, consumers may assume prototype pollution is closed even though non-plain roots remain exposed.

---

## 5. Additional Pitfalls in `nested-property`

Alongside the incomplete prototype guard, a few other traversal behaviors are worth noting if you accept untrusted paths:

- **Mass assignment:** Passing unfiltered JSON paths into `nested-property.set()` can overwrite sibling fields such as `role`. See [`pocs/mass-assignment-poc.js`](./pocs/mass-assignment-poc.js).
- **Type confusion:** Numeric path segments implicitly create arrays (`settings.0.theme`), breaking code that expects plain objects. See [`pocs/type-confusion-poc.js`](./pocs/type-confusion-poc.js).
- **Fail-open error handling:** `hasOwn` wraps property checks in a broad `try/catch` and returns `false` on `TypeError`, letting shadowed `hasOwnProperty` values bypass checks. See [`pocs/fail-open-poc.js`](./pocs/fail-open-poc.js).

---

## 6. Remediation Sketch

[`fix-recommendation.js`](./fix-recommendation.js) outlines a drop-in defensive fix covering these cases:

- Block writes to built-in prototypes (`Object.prototype`, `Array.prototype`, `Function.prototype`, etc.), not just `Object.prototype`.
- Reject path segments containing `__proto__`, `constructor`, or `prototype`.
- Drop the broad `try/catch` around `hasOwn` so type errors propagate instead of failing open.

Run `npm run fix` to test the patch sketch against the PoC vectors and inspect which paths are rejected vs. allowed.

---

## 7. Disclosure and Status

- Confirmed on Node.js v22.22.2 with `nested-property@4.0.0`.
- Reported to the `nested-property` maintainer, Snyk, MITRE CVE Program, and the `webdav` maintainer.
- As of June 4, 2026, no upstream patch has shipped.

If you are consuming `nested-property` with user-supplied paths, validate and allowlist path segments before calling `set()` or switch to a maintained alternative. Open an issue on this repo for follow-up or coordination.
