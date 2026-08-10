/**
 * Cordova DirectoryEntry-compatible window.file_storage for @capacitor/filesystem.
 * Prefer shell www/filesystem_bridge.js; this installs the same API for monorepo builds.
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

function fsPlugin() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
}

var DIRECTORY = 'DATA';

function joinPath() {
  var parts = [];
  for(var i = 0; i < arguments.length; i++) {
    var p = String(arguments[i] || '').replace(/^\/+|\/+$/g, '');
    if(p) { parts.push(p); }
  }
  return parts.join('/');
}

function blobToBase64(blob) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function() {
      var result = reader.result || '';
      var idx = String(result).indexOf(',');
      resolve(idx >= 0 ? String(result).slice(idx + 1) : String(result));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer);
  var binary = '';
  for(var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function convertSrc(uri) {
  if(window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
    return window.Capacitor.convertFileSrc(uri);
  }
  return uri;
}

function makeFileEntry(dirPath, name) {
  var fullPath = joinPath(dirPath, name);
  return {
    isFile: true,
    isDirectory: false,
    name: name,
    fullPath: fullPath,
    toURL: function() {
      return this._uri || ('capacitor://localhost/_capacitor_file_/' + fullPath);
    },
    getMetadata: function(success, error) {
      var p = fsPlugin();
      p.stat({ path: fullPath, directory: DIRECTORY }).then(function(st) {
        success({ size: (st && st.size) || 0, modificationTime: (st && st.mtime) || Date.now() });
      }, function(err) {
        if(typeof error === 'function') { error(err); }
      });
    },
    file: function(success, error) {
      var p = fsPlugin();
      p.readFile({ path: fullPath, directory: DIRECTORY }).then(function(res) {
        var data = res && res.data;
        var blob;
        try {
          var bin = atob(data);
          var arr = new Uint8Array(bin.length);
          for(var i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
          blob = new Blob([arr]);
        } catch(e) {
          blob = new Blob([data || '']);
        }
        success(blob);
      }, function(err) {
        if(typeof error === 'function') { error(err); }
      });
    },
    remove: function(success, error) {
      var p = fsPlugin();
      p.deleteFile({ path: fullPath, directory: DIRECTORY }).then(function() {
        if(typeof success === 'function') { success(); }
      }, function(err) {
        if(typeof error === 'function') { error(err); }
      });
    },
    createWriter: function(success, error) {
      var entry = this;
      var p = fsPlugin();
      var writer = {
        onwriteend: null,
        onerror: null,
        write: function(data) {
          var prep = Promise.resolve();
          if(data instanceof ArrayBuffer) {
            prep = Promise.resolve(arrayBufferToBase64(data));
          } else if(typeof Blob !== 'undefined' && data instanceof Blob) {
            prep = blobToBase64(data);
          } else if(typeof data === 'string') {
            prep = Promise.resolve(btoa(unescape(encodeURIComponent(data))));
          } else {
            prep = Promise.reject(new Error('unsupported write payload'));
          }
          prep.then(function(b64) {
            return p.writeFile({
              path: fullPath,
              data: b64,
              directory: DIRECTORY,
              recursive: true
            });
          }).then(function() {
            return p.getUri({ path: fullPath, directory: DIRECTORY });
          }).then(function(uriRes) {
            entry._uri = convertSrc((uriRes && uriRes.uri) || fullPath);
            if(typeof writer.onwriteend === 'function') { writer.onwriteend(); }
          }).catch(function(err) {
            if(typeof writer.onerror === 'function') { writer.onerror(err); }
            else if(typeof error === 'function') { error(err); }
          });
        }
      };
      p.getUri({ path: fullPath, directory: DIRECTORY }).then(function(uriRes) {
        entry._uri = convertSrc((uriRes && uriRes.uri) || fullPath);
        success(writer);
      }, function() {
        success(writer);
      });
    }
  };
}

function makeDirEntry(dirPath) {
  return {
    isFile: false,
    isDirectory: true,
    name: dirPath.split('/').pop() || '',
    fullPath: dirPath,
    getDirectory: function(name, opts, success, error) {
      var p = fsPlugin();
      var next = joinPath(dirPath, name);
      var create = !!(opts && opts.create);
      var ensure = create
        ? p.mkdir({ path: next, directory: DIRECTORY, recursive: true }).catch(function() {})
        : Promise.resolve();
      ensure.then(function() {
        return p.stat({ path: next, directory: DIRECTORY });
      }).then(function() {
        success(makeDirEntry(next));
      }, function(err) {
        if(typeof error === 'function') { error(err); }
      });
    },
    getFile: function(name, opts, success, error) {
      var p = fsPlugin();
      var fullPath = joinPath(dirPath, name);
      var create = !!(opts && opts.create);
      var entry = makeFileEntry(dirPath, name);
      if(create) {
        p.getUri({ path: fullPath, directory: DIRECTORY }).then(function(uriRes) {
          entry._uri = convertSrc((uriRes && uriRes.uri) || fullPath);
          success(entry);
        }, function() {
          success(entry);
        });
      } else {
        p.stat({ path: fullPath, directory: DIRECTORY }).then(function() {
          return p.getUri({ path: fullPath, directory: DIRECTORY });
        }).then(function(uriRes) {
          entry._uri = convertSrc((uriRes && uriRes.uri) || fullPath);
          success(entry);
        }, function(err) {
          if(typeof error === 'function') { error(err); }
        });
      }
    },
    createReader: function() {
      var path = dirPath;
      return {
        readEntries: function(success, error) {
          var p = fsPlugin();
          p.readdir({ path: path || '', directory: DIRECTORY }).then(function(res) {
            var files = (res && res.files) || [];
            var list = files.map(function(f) {
              var name = typeof f === 'string' ? f : (f.name || f);
              var type = typeof f === 'object' && f.type ? f.type : null;
              if(type === 'directory' || (!type && name.indexOf('.') === -1)) {
                return makeDirEntry(joinPath(path, name));
              }
              return makeFileEntry(path, name);
            });
            success(list);
          }, function(err) {
            if(typeof error === 'function') { error(err); }
            else { success([]); }
          });
        }
      };
    }
  };
}

export function installCapacitorFilesystemShim() {
  if(!isNativeCapacitor() || window.file_storage) {
    return !!window.file_storage;
  }
  if(!fsPlugin()) {
    console.warn('LINGOLINQ: Filesystem plugin not available; file_storage shim skipped');
    return false;
  }

  window.file_storage = {
    root: function(success, error) {
      var p = fsPlugin();
      Promise.all(['image', 'sound', 'json'].map(function(dir) {
        return p.mkdir({ path: dir, directory: DIRECTORY, recursive: true }).catch(function() {});
      })).then(function() {
        success(makeDirEntry(''));
      }, function(err) {
        if(typeof error === 'function') { error(err); }
      });
    },
    free_space: function() {
      return Promise.resolve({
        free: 2 * 1024 * 1024 * 1024,
        mb: 2048,
        gb: 2
      });
    }
  };

  console.log('LINGOLINQ: Capacitor file_storage bridge ready (ember)');
  return true;
}

export default { installCapacitorFilesystemShim: installCapacitorFilesystemShim };
