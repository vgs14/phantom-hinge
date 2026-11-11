"use strict"

const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from the backend!\n');
});

// PORT is passed in by etc/init.d/app-backend. Bind to loopback only - the
// kiosk's own Chromium is the only client, and anything else on the network
// shouldn't be able to reach the backend.
const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
});
