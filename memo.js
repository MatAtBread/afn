'use nodent-engine';
'use strict';

/* 'memoize' an async function so that that multiple calls with 
 * matching* parameters return the same async result in a Promise
 * for the specified amount of time.
 * 
 *  Example:
 *      var getUser = memo(getUserById,{
 *          key:<<key-specification>>,  // optional
 *          TTL:<<max cache time>>      // optional
 *      });
 *      
 *  The key-specification a `function(this,arguments,asyncFunction)` that returns an object containing the key values to memoize against.
 *  The default behaviour is to hash concrete values in the objects 'this' and 'args', ignoring any values attached to the asyncFunction
 *  
 *  As a secondary function, you can create an async map:
 *  
 *  memo.createAsyncMap({name:'some name'}, { TTL })
 *  
 */

module.exports = function (globalOptions) {
  function isThenable(f) {
    return f && typeof f.then === "function";
  }

  function deferred() {
    var props = {
      resolve: { value: null },
      reject: { value: null }
    };
    var d = new Promise(function (r, x) {
      props.resolve.value = r;
      props.reject.value = x;
    });
    Object.defineProperties(d, props)
    return d;
  }

  function ensureAsyncApi(cache){
    if (!cache) return cache ;
    var result = Object.create(cache);
    ['get', 'set', 'delete', 'clear', 'keys'].forEach(function (k) {
      if (typeof cache[k] === "function") {
        result[k] = function () {
          var r = cache[k].apply(cache, arguments);
          return isThenable(r) ? r : Promise.resolve(r)
        }
      }
    });
    return result;
}

  var noReturn = Promise.resolve();
  function createBackedCache(afnID, options) {
    // Ensure the backing cache has an async interface
    var backingCache = ensureAsyncApi(options.createCache(afnID)) ;
    var localCache = options.createLocalCache(afnID); // localCache is always stnchronous, like a Map
    var localID = "local";
    try {
      localID = "local(" + require('os').hostname() + ":" + process.pid + ")"
    } catch (ex) { }

    var cache = {
      _flushLocal() {
        if (backingCache)
          localCache.clear();
      },
      _assureLocalCachePending: function (key) {
        var l = localCache.get(key);
        if (!l || !l.value || !isThenable(l.value)) {
          l = { value: deferred() };
          localCache.set(key, l);
        }
        return l.value;
      },
      get: function (key, origin) {
        // Get a cache entry. This can return a concrete value OR a Promise for the entry
        // The result 'undefined' (concrete or Promise) means there is no entry for this key.
        // (async caches can't store 'undefined' - they treat it as 'null' instead)
        var now = Date.now();

        origin && origin.push(key, localID);

        var l = localCache.get(key);
        if (l !== undefined) {
          if (l.expires === undefined || l.expires > now) {
            origin && origin.push(isThenable(l.value) ? "async":"sync");
            return l.value;
          }
          origin && origin.push("expired");
          localCache.delete(key);
        }
        if (backingCache) {
          origin && origin.push("backingCache(" + (backingCache.name || 0) + ")");
          var entry = deferred(), response = deferred();
          localCache.set(key, { value: entry });
          /* expire me when the max lock-promise-time is met */
          backingCache.get(key).then(function (result) {
            if (result === undefined) {
              origin && origin.push("backingmiss");
              response.resolve(undefined);
            } else {
              if (result.expires && result.expires < Date.now()) {
                origin && origin.push("backingexpired");
                response.resolve(undefined);
              } else {
                origin && origin.push("restored");
                origin && (origin.expires = result.expires);
                localCache.set(key, result);
                response.resolve(result.value);
                entry.resolve(result.value);
              }
            }
          }, function (exception) {
            origin && origin.push("cacheexception");
            localCache.delete(key);
            response.resolve(undefined);
            entry.resolve(undefined);
          })
          return response;
        }
        origin && origin.push("localcachemiss");
        // Else return undefined...we don't have (and won't get) an entry for this item
      },
      set: function (key, data, ttl) {
        // In this context (a cache set operation) the "ttl" parameter is ALWAYS in milliseconds
        if (data === undefined) {
          options.log && options.log("Cannot store 'undefined' in afn async cache. Using 'null' instead");
          data = null;
        }

        if (ttl <= 0)
          return cache.delete(key);

        //         if (ttl===undefined)
        //           ttl = time('ttl',[]);
        // If TTL is absent, the item remains in the cache "forever" (depends on cache semantics)
        var expires = typeof ttl === "number" ? Date.now() + ttl : undefined;
        localCache.set(key, { value: data, expires: expires });
        if (backingCache) {
          if (isThenable(data)) {
            return backingCache.set(key,
              data.then(function (result) {
                if (result === undefined) {
                  return backingCache.delete(key);
                } else {
                  return backingCache.set(key, { value: result, expires: expires }, ttl);
                }
              }, function (exception) {
                return backingCache.delete(key);
              }),
              ttl);
          } else {
            return backingCache.set(key, { value: data, expires: expires }, ttl);
          }
        }
        return noReturn;
      },
      'delete': function (key) {
        localCache.delete(key);
        if (backingCache)
          return backingCache.delete(key);
      },
      clear: async function () {
        localCache.clear();
        if (backingCache) {
          if (backingCache.clear)
            return backingCache.clear();
          else {
            (await Promise.resolve(backingCache.keys())).forEach(function (k) { backingCache.delete(k) });
          }
        }
      },
      keys: async function () {
        if (backingCache) {
          var keys = [];
          var backingKeys = await Promise.resolve(backingCache.keys());
          for (var bk in backingKeys)
            keys.push(backingKeys[bk]);
          var localKeys = localCache.keys();
          for (var i in localKeys) {
            var k = localKeys[i];
            if (keys.indexOf(k) < 0)
              keys.push(k);
          }
          return keys;
        } else {
          return localCache.keys();
        }
      },
      expireKeys: async function (now) {
        // Expire local keys
        var keys = localCache.keys();
        var expired = [];
        for (var i in keys) {
          var k = keys[i];
          var entry = localCache.get(k);
          if (entry && entry.expires && entry.expires < now) {
            expired.push(k);
            localCache.delete(k);
          }
        }
        // Expire backing keys
        if (backingCache && backingCache.expireKeys) {
          return backingCache.expireKeys(now);
        }
        else if (backingCache) {
          // This backing cache doesn't support automatic expiry, which gives un
          // a problem in this implementation, as we have no idea what should be 
          // removed, so we just expire the keys we know about, and hope other instances
          // that created keys will do the same
          return Promise.all(expired.map(function (k) { return backingCache.delete(k) }))
        }
      }
    };

    return cache;
  }

  function memo(afn, memoOptions) {

    // In order to maintain compatability with <=v1.2.7
    // the 'ttl' member is treated as in being in ms if a constant, and 
    // seconds otherwise (as per previous spec)
    // This routine prefers the 'TTL' member which is always in seconds, or a time-string
    // It can also retrieve the 'mru' member which was always in seconds, for which MRU is an alias
    // It checks the current memoOptions and the instance memoOptions, meaning the order is:
    // memoOptions.TTL, globalOptions.TTL, memoOptions.ttl, globalOptions.ttl
    // These can be constants (number, string) or functions returning the same
    // The return value is always in 'ms' even though they aew all specified in seconds, EXCEPT
    // the lower0case 'ttl' member if it is a constant number.

    const timebase = { s: 1000, ms: 1, m: 60000, h: 3600000, d: 86400000 };
    const timeRegexp = /([0-9.]+)(s|ms|m|h|d)/;

    function time(name, args) {
      var k = [name.toUpperCase(), name.toLowerCase()];
      var spec = [options];

      var i, j;
      for (i = 0; i < spec.length; i++) {
        for (j = 0; j < k.length; j++) {
          if (k[j] in spec[i]) {
            var value = spec[i][k[j]];
            if (k[j] === 'ttl' && typeof value === 'number')
              return value; // The special case of .ttl: <number>, which is in milliseconds

            if (typeof value === 'function')
              value = value.apply(spec[i], args);

            if (typeof value === "undefined")
              return;
            if (typeof value === 'number')
              return value * 1000; // Convert to ms
            if (typeof value === 'string') {
              var m = value.match(timeRegexp);
              if (!m || !timebase[m[2]])
                throw new Error("Unknown TTL format: " + value);
              return parseFloat(m[1]) * timebase[m[2]];
            }
            throw new Error("Unknown TTL format: " + value);
          }
        }
      }
    }

    var options = Object.assign({ createLocalCache() { return new Map() } }, globalOptions, memoOptions);
    var cache = createBackedCache(afn.name + "[" + hash(afn.toString()) + "]", options);

    caches.push(cache);

    // If 'afn' is NOT a function, just return the backed-cache.
    if (typeof afn !== "function") {
      return ensureAsyncApi(cache);
    }

    // If this async function already has a named memo, use that one
    if (options.link && afn[options.link])
      return afn[options.link];

    function createMemo() {
      function memoed(/* arguments */) {
        var theseArgs = arguments;
        var self = this;
        var origin = globalOptions.origin ? [] : undefined;
        var memoPromise = (function () {
          var key = getKey(this, arguments, options.key, afn);
          if (key === undefined || key === null) {
            // Not cachable - maybe 'crypto' isn't defined?
            origin && origin.push("apicall");
            var result = afn.apply(this, arguments);
            return isThenable(result) ? result : Promise.resolve(result);
          }

          var entry = cache.get(key, origin);
          if (isThenable(entry)) {
            origin && origin.push("wait");
            entry = await entry;
          }
          if (entry !== undefined) {
            var mru = time('mru', [this, arguments, entry]);
            if (mru)
              cache.set(key, entry, mru);
            origin && origin.push("returned");
            return Promise.resolve(entry);
          }

          // `entry` is undefined (possibly via a promise). Retrieve the promise
          // that any callers are waiting for from the local cache, or create one if necessary
          entry = cache._assureLocalCachePending(key);

          function cacheOperation(p) {
            p && p.then && p.then(r => null, x => origin && origin.push("cacheexecption"));
          }

          entry.then(function (result) {
            ttl = time('ttl', [self, theseArgs, result]);
            if (ttl && origin) {
              origin.expires = ttl + Date.now();
            }
            cacheOperation(cache.set(key, result, ttl));
          }, function (exception) {
            cacheOperation(cache.delete(key));
          })

          // Now run the underlying async function, then resolve the Promise in the cache
          origin && origin.push("apicall");
          afn.apply(self, theseArgs).then(function (r) {
            origin && origin.push("resolved");
            entry.resolve(r);
          }, function (exception) {
            origin && origin.push("exception");
            entry.reject(exception);
          });

          return entry;
        }).apply(this, arguments);
        if (origin)
          memoPromise.origin = origin;

        memoOptions.testHarness && memoOptions.testHarness(this, arguments, afn, memoPromise);
        globalOptions.testHarness && globalOptions.testHarness(this, arguments, afn, memoPromise);
        return memoPromise;
      }
      memoed.options = function (overrides) {
        return createMemo(Object.assign({}, options, overrides));
      };
      memoed._flushLocal = function () {
        cache._flushLocal();
      };
      memoed.clearCache = async function () {
        if (cache.clear) {
          cache.clear();
        } else {
          (await Promise.resolve(cache.keys())).forEach(function (k) { cache.delete(k) });
        }
        return memoed;
      };
      if (options.link) {
        Object.defineProperty(memoed, options.link, afn);
        Object.defineProperty(afn, options.link, memoed);
      }
      return memoed;
    }

    return createMemo();

    function getKey(self, args, keySpec, fn) {
      if (typeof keySpec === 'function') {
        var spec = keySpec(self, args, fn, memo);
        if (spec === undefined)
          return spec;

        if (spec instanceof Object)
          return (typeof spec) + "/" + hash(spec);
        return (typeof spec) + "/" + spec.toString();
      }
      return hash({ self: self, args: args });
    }
  };

  function hashCode(h, o, m) {
    if (o === undefined) {
      h.update("undefined");
      return;
    }
    if (o === null) {
      h.update("null");
      return;
    }
    if (typeof o === 'object') {
      if (m.get(o))
        return;
      m.set(o, o);
      if (globalOptions.unOrderedArrays && Array.isArray(o)) {
        h.update("array/" + o.length + "/" + o.map(hash).sort());
      } else {
        Object.keys(o).sort().map(function (k) {
          return hashCode(h, k) + hashCode(h, o[k], m)
        });
      }
    } else {
      h.update((typeof o) + "/" + o.toString());
    }
  }

  function hash(o) {
    if (!crypto)
      return undefined;
    var h = crypto.createHash('sha256');
    hashCode(h, o, new Map());
    return h.digest(globalOptions.hashEncoding || 'latin1');
  }

  function subHash(o) {
    var h = 0, s = o.toString();
    for (var i = 0; i < s.length; i++)
      h = (h * 2333 + s.charCodeAt(i)) & 0xFFFFFFFF;
    return h.toString(36);
  }

  var hashes = {
    basicCreateHash: function () {
      var n = 0;
      var codes = ["0", "0", "0", "0", "0", "0"];
      return {
        update: function (u) {
          n = (n + 1) % codes.length;
          codes[n] = subHash(codes[n] + u);
        },
        digest: function () {
          return codes.join('');
        }
      }
    }
  };

  globalOptions = globalOptions || {};
  globalOptions.createCache = globalOptions.createCache || function (cacheID) { };
  var caches = [];
  var crypto;
  switch (typeof globalOptions.crypto) {
    case 'string':
      crypto = { createHash: hashes[globalOptions.crypto] };
      break;
    case 'object':
      crypto = globalOptions.crypto;
  }

  if (!crypto) {
    try {
      crypto = require('crypto');
    } catch (ex) {
      crypto = { createHash: hashes.basicCreateHash };
    }
  }

  var timer = setInterval(async function cleanCaches() {
    var now = Date.now();
    for (var i = 0; i < caches.length; i++) {
      try {
        await caches[i].expireKeys(now);
      } catch (ex) {
        if (globalOptions.log)
          globalOptions.log("cleanCaches", ex);
      }
    }
  }, 60000);

  if (timer.unref)
    timer.unref()

  memo.hash = hash; // Other exports that are useful

  return memo;
};
