// The network between the device and the local server, for the sync specs (e2e/sync.spec.js).
//
// A TCP pass-through on 127.0.0.1 that every platform reaches the same way: desktop browsers and the
// Playwright device profiles directly, the Android emulator through `adb reverse` (support/sync.js).
// The spec controls it while a sync runs:
// - setRate(kbps): one bandwidth limit shared by every connection, as on one phone link (null = unlimited);
// - setDelay(ms): latency added each way;
// - down() / up(): down drops every open connection and refuses new ones, as when a phone loses signal;
// - stats(): bytes sent to the device, requests seen, connections open now and at most at once.
// Picture requests never reach it (the specs answer the picture host themselves); they honour isDown()
// and the delay (support/sync.js routePictures).
//
// Local only: it listens on 127.0.0.1 and forwards to the local server (support/local-session.js
// assertLocalStack guards the target).

const net = require('net');

const REQUEST_LINE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \S+ HTTP\/1\.[01]\r\n/;

function startSyncLink(options) {
  const target = new URL(options.target);
  const port = options.port || 5078;
  const state = { rate: null, delay: options.delayMs || 0, down: false };
  const stats = { bytes: 0, requests: 0, open: 0, peak: 0, refused: 0 };
  const pairs = new Set();
  const queue = []; // device-bound chunks from every connection, in arrival order: one shared link
  let tokens = 0;
  let last = Date.now();

  const queued = () => queue.reduce((n, q) => n + q.chunk.length, 0);
  const send = (sock, chunk) => { if (!sock.destroyed) { sock.write(chunk); stats.bytes += chunk.length; } };

  const pump = setInterval(() => {
    const now = Date.now();
    if (state.rate === null) {
      while (queue.length) { const q = queue.shift(); send(q.sock, q.chunk); }
    } else {
      const rate = state.rate * 1000 / 8;
      tokens = Math.min(rate / 5, tokens + ((now - last) / 1000) * rate);
      while (queue.length) {
        const q = queue[0];
        if (q.sock.destroyed) { queue.shift(); continue; }
        const n = Math.min(q.chunk.length, Math.floor(tokens));
        if (n <= 0) { break; }
        send(q.sock, q.chunk.subarray(0, n));
        tokens -= n;
        if (n === q.chunk.length) { queue.shift(); } else { q.chunk = q.chunk.subarray(n); }
      }
    }
    last = now;
    if (queued() < 2 * 1024 * 1024) { pairs.forEach((p) => { if (p.upstream.isPaused()) { p.upstream.resume(); } }); }
  }, 10);

  const later = (fn) => (state.delay ? setTimeout(fn, state.delay) : setImmediate(fn));

  const server = net.createServer((client) => {
    if (state.down) { stats.refused += 1; client.destroy(); return; }
    const upstream = net.connect(+target.port || 80, target.hostname === 'localhost' ? '127.0.0.1' : target.hostname);
    const pair = { client, upstream };
    pairs.add(pair);
    stats.open = pairs.size;
    stats.peak = Math.max(stats.peak, stats.open);
    const close = () => {
      if (!pairs.delete(pair)) { return; }
      stats.open = pairs.size;
      client.destroy();
      upstream.destroy();
    };
    client.on('data', (d) => {
      if (REQUEST_LINE.test(d.toString('latin1', 0, 300))) { stats.requests += 1; }
      later(() => { if (!upstream.destroyed) { upstream.write(d); } });
    });
    upstream.on('data', (d) => {
      later(() => { if (!client.destroyed) { queue.push({ sock: client, chunk: d }); } });
      if (queued() > 2 * 1024 * 1024) { upstream.pause(); }
    });
    // Finish sending what is queued for this connection, then close it.
    upstream.on('end', () => later(() => {
      const wait = () => { if (queue.some((q) => q.sock === client)) { setTimeout(wait, 20); } else { client.end(); close(); } };
      wait();
    }));
    client.on('error', close);
    upstream.on('error', close);
    client.on('close', close);
  });

  const link = {
    url: `http://localhost:${port}`,
    port,
    setRate(kbps) { state.rate = kbps || null; tokens = 0; last = Date.now(); },
    setDelay(ms) { state.delay = ms || 0; },
    down() { state.down = true; queue.length = 0; pairs.forEach((p) => { p.client.destroy(); p.upstream.destroy(); }); pairs.clear(); stats.open = 0; },
    up() { state.down = false; },
    isDown() { return state.down; },
    delay() { return state.delay; },
    stats() { return { ...stats }; },
    resetStats() { Object.assign(stats, { bytes: 0, requests: 0, peak: stats.open, refused: 0 }); },
    close() {
      clearInterval(pump);
      link.down();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(link));
  });
}

module.exports = { startSyncLink };
