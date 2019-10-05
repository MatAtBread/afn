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
    var d = new Promise(function (resolve, reject) {
      props.resolve.value = resolve;
      props.reject.value = reject;
    });
    // We attach a single, silent handler to suppress the unecessary warning about unhandled rejections
    d.then(function(){},function(){});
    Object.defineProperties(d, props)
    return d;
  }

  function ensureAsyncApi(cache) {
    if (!cache) return cache;
    var result = Object.create(cache);
    ['get', 'set', 'delete', 'clear', 'keys', 'has', 'expireKeys'].forEach(function (k) {
      if (typeof cache[k] === "function") {
        result[k] = function () {
          var r = cache[k].apply(cache, arguments);
          return isThenable(r) ? r : Promise.resolve(r)
        }
      }
    });
    return result;
  }

  // In order to maintain compatability with <=v1.2.7
  // the 'ttl' member is treated as being in ms if a constant, and 
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

  function time(spec, name, args) {
    var k = [name.toUpperCase(), name.toLowerCase()];

    var i, j;
    for (i = 0; i < spec.length; i++) {
      for (j = 0; j < k.length; j++) {
        if (k[j] in spec[i]) {
          var value = spec[i][k[j]];
          if (k[j] === 'ttl' && typeof value === 'number')
            return value; // The special case of .ttl: <number>, which is in milliseconds

          if (typeof value === 'function') {
            try {
              value = value.apply(spec[i], args);
            } catch (ex) {
              console.warn(__dirname+"/"+__filename+": mru()",ex);
              value = undefined;
              continue;
            }
          }
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


  var noReturn = Promise.resolve();
  function createBackedCache(afnID, options) {
    // Ensure the backing cache has an async interface
    var backingCache = ensureAsyncApi(options.createCache(afnID));
    var localCache = options.createLocalCache(afnID); // localCache is always stnchronous, like a Map
    var localID = "local";
    try {
      localID = "local(" + require('os').hostname() + ":" + process.pid + ")"
    } catch (ex) { }

    function updateCaches(key,backingCache,data,ttl){
      var l = localCache.get(key);
      // If TTL is absent, the item remains in the cache "forever" (depends on cache semantics)
      var expires = typeof ttl === "number" ? Date.now() + ttl : undefined;

      return (function setValue(v,rejection){
        if (v === undefined) {
          localCache.delete(key);
          l && isThenable(l.value) && l.value.reject(rejection) ;
          return backingCache && backingCache.delete(key);
        } else if (isThenable(v)) {
          localCache.set(key,{ value: v, expires: expires })
          return v.then(setValue, 
          function(x){
            setValue(undefined,x);
          })
        } else {
          var c = { value: v, expires: expires };
          localCache.set(key,c);
          l && isThenable(l.value) && l.value.resolve(v) ;
          return backingCache && backingCache.set(key,c,ttl) ;
        }
      })(data);
    }

    var cache = {
      _flushLocal() {
        if (backingCache)
          localCache.clear();
      },
      get: function (key, origin) {
        // Get a cache entry. This can return a concrete value OR a Promise for the entry
        var l, now = Date.now();

        origin && origin.push(key, localID);
        var localEntry = localCache.get(key);
        // Treat expired local entries as if they had never existed
        var currentOrigin = "miss";
        if (localEntry && localEntry.expires < now) {
          localEntry = undefined;
          localCache.delete(key);
          currentOrigin = "expired";
        }
  
        // If we don't have this entry, create a Promise for when we do.
        // This is an atomic lock - by synchronously setting a Promise,
        // only the first miss creates a new Promise. Subsequent get()s
        // will get the Promise of the first result
        if (localEntry === undefined) {
          origin && origin.push(currentOrigin);
          localEntry = { value: deferred() };
          localCache.set(key, localEntry);
          l = noReturn;

		
          {
            // This is placeholder Promise. A set() operation will cause this to resolve
            // but we ensure resolution by timing out the get(), in case we don't call set()
            var timerId = setTimeout(function () {
              timerId = undefined;
              origin && origin.push("getTimeOut")
              localEntry.value.resolve();
              localCache.delete(key);
            }, options.asyncTimeOut * 1000);
            function killTimer() { 
              if (timerId) {
                clearTimeout(timerId) 
                timerId = undefined;
              }
            }
            localEntry.value.then(killTimer, killTimer);
          }
        } else {
          // Otherwise, return the cached entry - either a real value, or the Promise of one
          origin && origin.push(isThenable(localEntry.value)?"async":"sync");
          l = localEntry.value;
        }

        // First check if we might need to consult a backingCache (but don't do it yet)
        if (backingCache) {
          if (l === noReturn) {
            // We don't have a local copy, but we have reserved a promise - try the backing cache to resolve it
            origin && origin.push("backingCache("+backingCache.name+")");
            return backingCache.get(key,options).then(function (r) {
              if (r === undefined || (!backingCache.expireKeys && r.expires < now)) {
                origin && origin.push(r?"expired":"miss");
                return noReturn;
              } else {
                origin && origin.push("restore");

                var mru = time([options], 'mru', [undefined, undefined, r.value]);
                if (mru !== undefined) {
                  updateCaches(key,backingCache,r.value, mru);        
                } else {
                  updateCaches(key,null,r.value,r.expires - now);        
                }
                return r.value;
              }
            }, function (x) {
              origin && origin.push("exception");
              updateCaches(key,null,undefined,undefined);        
              return noReturn;
            })
          } else {
            // Just return the local copy
            return l;
          }
        }

        return l;
      },
      set: function (key, data, ttl, origin) {
        // In this context (a cache set operation) the "ttl" parameter is ALWAYS in milliseconds
        if (data === undefined) {
          origin && origin.push("noUndefined")
          options.log && options.log("Cannot store 'undefined' in afn async cache. Using 'null' instead");
          data = null;
        }

        if (ttl === undefined)
          ttl = time([options], 'ttl', []);
        if (ttl <= 0)
          data = undefined;

        updateCaches(key,backingCache,data,ttl);
        return noReturn;
      },
      has: async function(key) {
        if (localCache.has(key))
          return true ;
        if (backingCache)
          return backingCache.has(key);
        return false;
      },
      'delete': function (key) {
        updateCaches(key,backingCache,undefined,undefined);
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
        if (now === undefined) now = Date.now();
        var keys = localCache.keys();
        var expired = [];
        for (var k of keys) {
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
    var options = Object.assign({
      asyncTimeOut: 60,
      createLocalCache() { return new Map() }
    }, globalOptions, memoOptions);

    // Fix up the timing entries `ttl` and `mru`. Originally lower cases and type sensitive,
    // they are now uppercased and either strings with units, or numbers of seconds, or functions
    // returning those values. The issue here is deciding which is precedence - the specific
    // function options of the general `afn` globalOptions.
    if (memoOptions.ttl && !memoOptions.TTL && globalOptions.TTL)
      delete options.TTL;

    // If this async function already has a named memo, use that one
    if (options.link && afn[options.link])
      return afn[options.link];

    var cache = createBackedCache(afn.name + "[" + hash(afn.toString()) + "]", options);
    caches.push(cache);

    // If 'afn' is NOT a function, just return the backed-cache.
    if (typeof afn !== "function") {
      return ensureAsyncApi(cache);
    }

    function createMemo() {
      function memoed(/* arguments */) {
        var theseArgs = arguments;
        var self = this;
        var origin = globalOptions.origin ? [] : undefined;
        var memoPromise ;

        var key = getKey(this, arguments, options.key, afn);
        if (key === undefined || key === null) {
          // Not cachable - maybe 'crypto' isn't defined?
          origin && origin.push("apicall");
          var result = afn.apply(this, arguments);
          memoPromise = isThenable(result) ? result : Promise.resolve(result);
        } else {
          var value = cache.get(key, origin) ;
          if (!isThenable(value)) {
            memoPromise = Promise.resolve(value);
          } else {
            memoPromise = value.then(function(entry){
              if (entry === undefined) {
                origin && origin.push("apicall");
                var apicall = afn.apply(self, theseArgs);
                var ttl = time([options], 'ttl', [self, theseArgs]);
                cache.set(key,apicall,ttl,origin);
                apicall.then(function(result){
                  var thenTtl = time([options], 'ttl', [self, theseArgs, result]);
                  if (thenTtl !== ttl) {
                    cache.set(key,result,thenTtl,origin);
                  }
                });
                return apicall;
              } else {
                var mru = time([options], 'mru', [self, theseArgs, entry]);
                if (mru !== undefined) {
                  origin && origin.push("mru");
                  cache.set(key,entry,mru,origin)
                } else {
                  origin && origin.push("retrieved");
                }
                return entry ;
              }
            }).then(function(r){ return r },function(x){
              options && options.log && options.log('Rejection writing back to cache',x);
              throw x;
            })
          }
        }
        if (origin)
          memoPromise.origin = origin;

        memoOptions && memoOptions.testHarness && memoOptions.testHarness(this, arguments, afn, memoPromise);
        globalOptions && globalOptions.testHarness && globalOptions.testHarness(this, arguments, afn, memoPromise);
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
          return cache.clear();
        } else {
          var keys = await cache.keys();
          return Promise.all(keys.map(function(k){ return cache.delete(k) }));
        }
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
