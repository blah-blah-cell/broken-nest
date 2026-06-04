const express = require('express');
const np = require('nested-property');

const app = express();
app.use(express.json());

// Mock database
const db = {
  users: {
    "alice": { role: "admin", settings: { theme: "light" }, tags: [] },
    "bob": { role: "user", settings: { theme: "dark" }, tags: [] }
  },
  systemLogs: ["Server started", "Connected to DB"]
};

// VULNERABLE ENDPOINT: Updates a user's settings using nested-property
app.post('/api/users/:username/settings', (req, res) => {
  const { username } = req.params;
  const { path, value } = req.body;
  
  if (!db.users[username]) {
    return res.status(404).json({ error: "User not found" });
  }

  try {
    // VULNERABILITY: User-controlled 'path' is passed directly to np.set
    // E.g. {"path": "tags.__proto__.map", "value": "hacked"}
    np.set(db.users[username], path, value);
    
    res.json({ 
      success: true, 
      message: "Settings updated",
      settings: db.users[username].settings 
    });
  } catch (error) {
    // nested-property ONLY throws for Object.prototype mutation attempts
    res.status(400).json({ error: error.message });
  }
});

// BENIGN ENDPOINT: Relies on native Array methods
app.get('/api/health', (req, res) => {
  try {
    // This uses Array.prototype.map()
    const logSummary = db.systemLogs.map(log => `[LOG] ${log}`);
    
    res.json({
      status: "Healthy",
      logs: logSummary
    });
  } catch (err) {
    res.status(500).json({ error: "Server Error: " + err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`[+] Vulnerable Demo Server listening on port ${PORT}`);
});
