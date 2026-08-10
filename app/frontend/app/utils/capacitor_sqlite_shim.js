/**
 * Cordova-compatible window.sqlitePlugin shim for @capacitor-community/sqlite.
 * Prefer shell www/sqlite_bridge.js (loads before app.js); this module installs
 * the same API when packaging a monorepo Ember build without that script.
 */

function isNativeCapacitor() {
  try {
    return !!(window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform());
  } catch(e) {
    return false;
  }
}

function plugin() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite;
}

function sanitizeDbName(name) {
  return String(name || 'lingolinq').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function toResultSet(values) {
  var rows = Array.isArray(values) ? values : [];
  return {
    rows: {
      length: rows.length,
      item: function(i) {
        return rows[i];
      }
    }
  };
}

function makeDb(rawName) {
  var dbName = sanitizeDbName(rawName);
  var openPromise = null;
  var queue = Promise.resolve();

  function ensureOpen() {
    if(openPromise) { return openPromise; }
    var p = plugin();
    if(!p) {
      return Promise.reject(new Error('CapacitorSQLite plugin missing'));
    }
    // Native CapacitorSQLitePlugin has createConnection/open/closeConnection —
    // not isConnection (that lives on the npm SQLiteConnection JS helper only).
    openPromise = Promise.resolve()
      .then(function() {
        if(typeof p.checkConnectionsConsistency === 'function') {
          return p.checkConnectionsConsistency({
            dbNames: [dbName],
            openModes: ['RW']
          }).catch(function() {
            return { result: false };
          });
        }
        return { result: false };
      })
      .then(function(consistency) {
        if(consistency && consistency.result === false && typeof p.closeConnection === 'function') {
          return p.closeConnection({ database: dbName, readonly: false }).catch(function() {});
        }
      })
      .then(function() {
        return p.createConnection({
          database: dbName,
          version: 1,
          encrypted: false,
          mode: 'no-encryption',
          readonly: false
        }).catch(function(err) {
          var msg = String((err && err.message) || err || '');
          if(/already|exist/i.test(msg)) { return; }
          throw err;
        });
      })
      .then(function() {
        return p.open({ database: dbName, readonly: false });
      })
      .catch(function(err) {
        openPromise = null;
        throw err;
      });
    return openPromise;
  }

  function runSql(sql, params) {
    params = params || [];
    var p = plugin();
    var trimmed = String(sql || '').replace(/^\s+/, '');
    var isSelect = /^\s*SELECT\b/i.test(trimmed) || /^\s*PRAGMA\b/i.test(trimmed);
    return ensureOpen().then(function() {
      if(isSelect) {
        return p.query({
          database: dbName,
          statement: sql,
          values: params
        }).then(function(res) {
          return toResultSet(res && res.values);
        });
      }
      return p.run({
        database: dbName,
        statement: sql,
        values: params,
        transaction: false
      }).then(function() {
        return toResultSet([]);
      });
    });
  }

  function enqueue(fn) {
    var result = queue.then(fn, fn);
    queue = result.catch(function() {});
    return result;
  }

  return {
    executeSql: function(sql, params, success, error) {
      enqueue(function() {
        return runSql(sql, params).then(function(rs) {
          if(typeof success === 'function') { success(rs); }
          return rs;
        }, function(err) {
          if(typeof error === 'function') {
            error(err && err.message ? err : { message: String(err) });
          }
        });
      });
    },
    transaction: function(fn, error, success) {
      enqueue(function() {
        var p = plugin();
        var ops = [];
        var tx = {
          executeSql: function(sql, params, ok, fail) {
            ops.push({ sql: sql, params: params || [], ok: ok, fail: fail });
          }
        };
        try {
          fn(tx);
        } catch(e) {
          if(typeof error === 'function') { error({ message: e.message || String(e) }); }
          return Promise.resolve();
        }
        return ensureOpen()
          .then(function() {
            if(typeof p.beginTransaction === 'function') {
              return p.beginTransaction({ database: dbName });
            }
          })
          .then(function() {
            var chain = Promise.resolve();
            ops.forEach(function(op) {
              chain = chain.then(function() {
                return runSql(op.sql, op.params).then(function(rs) {
                  if(typeof op.ok === 'function') { op.ok(tx, rs); }
                }, function(err) {
                  if(typeof op.fail === 'function') {
                    op.fail(tx, err && err.message ? err : { message: String(err) });
                  }
                  throw err;
                });
              });
            });
            return chain;
          })
          .then(function() {
            if(typeof p.commitTransaction === 'function') {
              return p.commitTransaction({ database: dbName });
            }
          })
          .then(function() {
            if(typeof success === 'function') { success(); }
          })
          .catch(function(err) {
            var rollback = Promise.resolve();
            if(typeof p.rollbackTransaction === 'function') {
              rollback = p.rollbackTransaction({ database: dbName }).catch(function() {});
            }
            return rollback.then(function() {
              if(typeof error === 'function') {
                error(err && err.message ? err : { message: String(err) });
              }
            });
          });
      });
    }
  };
}

export function installCapacitorSqliteShim() {
  if(!isNativeCapacitor() || window.sqlitePlugin) {
    return !!window.sqlitePlugin;
  }
  if(!plugin()) {
    console.warn('LINGOLINQ: CapacitorSQLite plugin not available; sqlitePlugin shim skipped');
    return false;
  }

  var databases = {};

  window.sqlitePlugin = {
    openDatabase: function(opts, success, error) {
      var name = (opts && opts.name) || opts;
      if(typeof name !== 'string') {
        name = opts && opts.name;
      }
      try {
        var db = databases[name] || makeDb(name);
        databases[name] = db;
        if(typeof success === 'function') {
          setTimeout(function() { success(db); }, 0);
        }
        return db;
      } catch(e) {
        if(typeof error === 'function') { error(e); }
        return null;
      }
    },
    deleteDatabase: function(opts, success, error) {
      var name = (opts && opts.name) || opts;
      var dbName = sanitizeDbName(name);
      var p = plugin();
      Promise.resolve()
        .then(function() {
          return p.closeConnection({ database: dbName, readonly: false }).catch(function() {});
        })
        .then(function() {
          return p.deleteDatabase({ database: dbName });
        })
        .then(function() {
          delete databases[name];
          if(typeof success === 'function') { success(); }
        })
        .catch(function(err) {
          if(typeof error === 'function') {
            error(err && err.message ? err : { message: String(err) });
          }
        });
    }
  };

  console.log('LINGOLINQ: Capacitor sqlitePlugin shim ready (ember)');
  return true;
}

export default { installCapacitorSqliteShim: installCapacitorSqliteShim };
