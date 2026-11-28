// A local pass-through proxy in front of the Rails server, for offline-worker-lifecycle.spec.js.
//
// Playwright's routing sees a page's requests and a service worker's own requests, but not the
// browser's fetch of the worker script itself (the update check), so it cannot hand the browser a new
// version of /sw.js. Every request through this proxy, that one included, goes to Rails unchanged,
// except /sw.js while `state.edit` is set: then the browser gets Rails' worker with the edit applied,
// exactly as it would get a new deploy. Local only: it listens on 127.0.0.1 and forwards to the
// (already local-only) E2E_BASE_URL.

const http = require('http');

const PORT = parseInt(process.env.E2E_WORKER_PROXY_PORT || '5078', 10);

function startWorkerProxy(target) {
  const upstream = new URL(target);
  const state = { edit: null, served: 0 };
  const server = http.createServer((req, res) => {
    const edit = state.edit;
    const isWorker = !!edit && new URL(req.url, 'http://proxy.local').pathname === '/sw.js';
    const headers = { ...req.headers };
    if (isWorker) {
      // A full, uncompressed body to edit: no 304, no gzip.
      delete headers['if-none-match'];
      delete headers['if-modified-since'];
      delete headers['accept-encoding'];
    }
    const forward = http.request({
      hostname: upstream.hostname === 'localhost' ? '127.0.0.1' : upstream.hostname,
      port: upstream.port,
      path: req.url,
      method: req.method,
      headers: headers,
    }, (upstreamResponse) => {
      if (!isWorker) {
        res.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
        upstreamResponse.pipe(res);
        return;
      }
      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(chunk));
      upstreamResponse.on('end', () => {
        const body = edit(Buffer.concat(chunks).toString('utf8'));
        state.served += 1;
        const outHeaders = { ...upstreamResponse.headers };
        delete outHeaders.etag;
        delete outHeaders['last-modified'];
        delete outHeaders['transfer-encoding'];
        outHeaders['content-length'] = Buffer.byteLength(body);
        res.writeHead(upstreamResponse.statusCode, outHeaders);
        res.end(body);
      });
    });
    forward.on('error', () => res.destroy());
    req.pipe(forward);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      resolve({
        url: `http://localhost:${PORT}`,
        state: state,
        close: () => new Promise((done) => { server.close(() => done()); server.closeAllConnections(); }),
      });
    });
  });
}

module.exports = { startWorkerProxy };
