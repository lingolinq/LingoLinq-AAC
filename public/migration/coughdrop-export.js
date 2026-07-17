/**
 * LingoLinq CoughDrop board-set exporter.
 * Loaded by the bookmarklet from the Import JSON Bundle modal.
 * Must run on a logged-in CoughDrop page (uses persistence.ajax when available).
 */
(function(global) {
  'use strict';

  if (global.__lingolinqCoughdropExportRunning) {
    return;
  }
  global.__lingolinqCoughdropExportRunning = true;

  var STATUS_ID = 'lingolinq-coughdrop-export-status';

  function coughdropFetch(path) {
    var persistence = global.persistence || (global.CoughDrop && global.CoughDrop.persistence);
    if (persistence && typeof persistence.ajax === 'function') {
      return persistence.ajax(path, { type: 'GET' });
    }
    return fetch(path, { credentials: 'same-origin' }).then(function(response) {
      if (!response.ok) {
        throw new Error(path + ' → ' + response.status);
      }
      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('json') === -1) {
        throw new Error(path + ' returned non-JSON (' + contentType + ')');
      }
      return response.json();
    });
  }

  function detectRootBoardKey() {
    var path = (global.location.pathname || '').replace(/^\//, '');
    var parts = path.split('/').filter(Boolean);
    if (parts[0] === 'board' || parts[0] === 'boards') {
      parts.shift();
    }
    if (parts.length >= 2) {
      return parts[0] + '/' + parts.slice(1).join('/');
    }
    return null;
  }

  function ensureStatusPanel() {
    var panel = document.getElementById(STATUS_ID);
    if (panel) {
      return panel;
    }
    panel = document.createElement('div');
    panel.id = STATUS_ID;
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'z-index:2147483647',
      'max-width:min(420px,calc(100vw - 32px))',
      'padding:14px 16px',
      'border-radius:10px',
      'background:#1f2937',
      'color:#f9fafb',
      'font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,0.25)'
    ].join(';');
    document.body.appendChild(panel);
    return panel;
  }

  function setStatus(message) {
    var panel = ensureStatusPanel();
    panel.textContent = message;
  }

  function clearStatus(delayMs) {
    setTimeout(function() {
      var panel = document.getElementById(STATUS_ID);
      if (panel && panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }, delayMs || 0);
  }

  function collectBoardKeys(rootKey) {
    var seen = {};
    var queue = [rootKey];
    var keys = [];

    function walk() {
      if (!queue.length) {
        return Promise.resolve(keys);
      }
      var key = queue.shift();
      if (!key || seen[key]) {
        return walk();
      }
      seen[key] = true;
      keys.push(key);

      return coughdropFetch('/api/v1/boards/' + key).then(function(data) {
        var board = (data && data.board) || data || {};
        (board.buttons || []).forEach(function(btn) {
          if (btn && btn.load_board && btn.load_board.key) {
            queue.push(btn.load_board.key);
          }
        });
        return walk();
      });
    }

    return walk();
  }

  function exportBoardJsonBundle(rootKey) {
    setStatus('LingoLinq: finding linked boards…');

    return collectBoardKeys(rootKey).then(function(keys) {
      setStatus('LingoLinq: exporting 0 / ' + keys.length + ' boards…');

      var boards = [];
      var index = 0;

      function nextBoard() {
        if (index >= keys.length) {
          var bundle = { root: rootKey, boards: boards };
          var blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
          var link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = rootKey.replace(/\//g, '-') + '-full-export.json';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);

          var summary = 'LingoLinq: exported ' + boards.length + ' of ' + keys.length + ' boards.';
          if (boards.length < keys.length) {
            summary += ' Some boards were skipped — check the browser console.';
          }
          setStatus(summary);
          clearStatus(12000);
          return bundle;
        }

        var key = keys[index];
        index += 1;
        setStatus('LingoLinq: exporting ' + index + ' / ' + keys.length + ' — ' + key);

        return coughdropFetch('/api/v1/boards/' + key).then(function(data) {
          boards.push({ key: key, data: data });
        }).catch(function(err) {
          console.warn('LingoLinq export skipped board:', key, err);
        }).then(function() {
          return new Promise(function(resolve) {
            setTimeout(resolve, 150);
          });
        }).then(nextBoard);
      }

      return nextBoard();
    });
  }

  function run() {
    var host = (global.location.hostname || '').toLowerCase();
    if (host.indexOf('coughdrop') === -1 && host.indexOf('mycoughdrop') === -1) {
      setStatus('LingoLinq: open your home board on CoughDrop, then click the bookmark again.');
      clearStatus(10000);
      return Promise.resolve();
    }

    var rootKey = detectRootBoardKey();
    if (!rootKey) {
      rootKey = global.prompt('Enter your CoughDrop home board key (username/board-name):');
    }
    if (!rootKey) {
      global.__lingolinqCoughdropExportRunning = false;
      return Promise.resolve();
    }
    rootKey = rootKey.replace(/^\s+|\s+$/g, '');

    return exportBoardJsonBundle(rootKey).catch(function(err) {
      console.error('LingoLinq CoughDrop export failed:', err);
      setStatus('LingoLinq export failed: ' + (err && err.message ? err.message : err));
      clearStatus(12000);
    }).then(function() {
      global.__lingolinqCoughdropExportRunning = false;
    });
  }

  run();
})(window);
