'use strict';

// Proxy /auth/*, /parental_consent/*, and /eu_ai_parental_consent/* to Rails BEFORE
// Ember's SPA history fallback. Full-page navigations (window.location) send
// Accept: text/html, which Ember otherwise answers with index.html — so OAuth and
// parental-consent email links never reached Rails.
module.exports = function(app) {
  var frontendHost = process.env.EMBER_DEV_HOST || process.env.FRONTEND_HOST || 'localhost:8184';
  var frontendOrigin = process.env.FRONTEND_ORIGIN || ('http://' + frontendHost);
  var backendPatterns = [
    /http:\/\/127\.0\.0\.1:5000/gi,
    /http:\/\/localhost:5000/gi
  ];

  function rewriteRedirectUrl(url) {
    if(!url || typeof url !== 'string') { return url; }
    var rewritten = url;
    backendPatterns.forEach(function(pattern) {
      rewritten = rewritten.replace(pattern, frontendOrigin);
    });
    return rewritten;
  }

  function authPath(url) {
    var path = (url || '').split('?')[0];
    return path === '/auth' || path.indexOf('/auth/') === 0;
  }

  function migrationPath(url) {
    var path = (url || '').split('?')[0];
    return path === '/migration' || path.indexOf('/migration/') === 0;
  }

  function parentalConsentPath(url) {
    var path = (url || '').split('?')[0];
    return path === '/parental_consent/complete' || path === '/parental_consent/revoke' ||
      path === '/eu_ai_parental_consent/complete' || path === '/eu_ai_parental_consent/revoke';
  }

  var proxy = require('http-proxy').createProxyServer({
    target: 'http://127.0.0.1:5000',
    changeOrigin: true,
    followRedirects: false
  });

  proxy.on('proxyReq', function(proxyReq, req) {
    if(req.headers.host) {
      proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
    }
    var proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http');
    proxyReq.setHeader('X-Forwarded-Proto', proto);
    if(req.headers.host && req.headers.host.indexOf(':') !== -1) {
      proxyReq.setHeader('X-Forwarded-Port', req.headers.host.split(':').pop());
    }
  });

  proxy.on('proxyRes', function(proxyRes) {
    var location = proxyRes.headers.location;
    if(!location) { return; }
    if(Array.isArray(location)) {
      proxyRes.headers.location = location.map(rewriteRedirectUrl);
    } else {
      proxyRes.headers.location = rewriteRedirectUrl(location);
    }
  });

  proxy.on('error', function(err, req, res) {
    if(!res.headersSent) {
      res.writeHead(502, {'Content-Type': 'text/plain'});
    }
    res.end('Auth proxy error: ' + err.message);
  });

  app.use(function(req, res, next) {
    if(!authPath(req.url) && !migrationPath(req.url) && !parentalConsentPath(req.url)) {
      return next();
    }
    proxy.web(req, res, { target: 'http://127.0.0.1:5000' });
  });
};
