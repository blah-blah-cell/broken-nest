/**
 * Recommended Fix for nested-property v4.0.0 Prototype Pollution Bypass
 * Researcher: Ojas Mehta
 *
 * Two layers of defense:
 *   1. Extended PROTECTED_PROTOS Set (covers all built-in prototypes)
 *   2. Segment-level DANGEROUS_KEYS denylist (blocks dangerous path segments before traversal)
 *
 * Both defenses should be applied together for defense in depth.
 */

// ---------------------------------------------------------------------------
// FIX 1: Extend the prototype guard inside nested-property's set() traversal
// ---------------------------------------------------------------------------

// Current vulnerable guard (nested-property/dist/nested-property.js, line 166):
//
//   if (currentObject === Reflect.getPrototypeOf({})) {
//     throw new ObjectPrototypeMutationError("Attempting to mutate Object.prototype");
//   }
//
// Problem: Reflect.getPrototypeOf({}) === Object.prototype — strict identity check.
// Only Object.prototype is protected. Array.prototype, Function.prototype, etc. are unguarded.

// RECOMMENDED REPLACEMENT:
const PROTECTED_PROTOS = new Set([
  Object.prototype,
  Array.prototype,
  Function.prototype,
  Number.prototype,
  String.prototype,
  Boolean.prototype,
  RegExp.prototype,
  Date.prototype,
  Error.prototype,
  Map.prototype,
  Set.prototype,
  Promise.prototype,
]);

function guardedTraversalCheck(currentObject) {
  if (PROTECTED_PROTOS.has(currentObject)) {
    throw new Error(
      `Blocked: attempted mutation of built-in prototype (${currentObject.constructor?.name ?? 'unknown'}.prototype)`
    );
  }
}

// ---------------------------------------------------------------------------
// FIX 2: Segment-level denylist — validate path BEFORE traversal begins
// ---------------------------------------------------------------------------

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Returns true if the path is safe (no dangerous segments).
 * Call this before passing any user-controlled path to np.set() or np.get().
 *
 * @param {string} path - dot-notation path, e.g. "data.tags.0"
 * @returns {boolean}
 */
function isSafePath(path) {
  if (typeof path !== "string" || path.length === 0) return false;
  return !path.split(".").some((segment) => DANGEROUS_KEYS.has(segment));
}

/**
 * Safe wrapper around np.set() that validates the path before calling.
 *
 * @param {object} np - the nested-property module
 * @param {object|Array} obj - root object
 * @param {string} path - dot-notation path
 * @param {*} value - value to set
 */
function safeSet(np, obj, path, value) {
  if (!isSafePath(path)) {
    throw new Error(`Blocked: dangerous path segment in "${path}"`);
  }
  return np.set(obj, path, value);
}

// ---------------------------------------------------------------------------
// Validation: verify the fixes block all 4 attack vectors
// ---------------------------------------------------------------------------

const np = require("nested-property");

console.log("=== Fix Validation ===");

const vectors = [
  { obj: { data: [] }, path: "data.__proto__.polluted",         value: true,     label: "Vector 1" },
  { obj: {},           path: "constructor.__proto__.polluted",  value: true,     label: "Vector 2" },
  { obj: { data: [] }, path: "data.__proto__.toString",         value: ()=>"X",  label: "Vector 3" },
  { obj: [],           path: "constructor.prototype.injected",  value: "owned",  label: "Vector 4" },
];

for (const { obj, path, value, label } of vectors) {
  try {
    safeSet(np, obj, path, value);
    console.log(`[FAIL] ${label}: safeSet did NOT block — path: ${path}`);
  } catch (e) {
    console.log(`[PASS] ${label}: blocked — ${e.message}`);
  }
}

// Safe path — should succeed
try {
  const result = {};
  safeSet(np, result, "user.profile.name", "Alice");
  console.log("[PASS] Safe path allowed:", JSON.stringify(result));
} catch (e) {
  console.log("[FAIL] Safe path was incorrectly blocked:", e.message);
}

console.log("\nFix validation complete.");
