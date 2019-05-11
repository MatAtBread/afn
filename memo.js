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

var os = require('os') ;

module.exports = function(config){
  function memo(afn,options) {

    // In order to maintain compatability with <=v1.2.7
    // the 'ttl' member is treated as in being in ms if a constant, and 
    // seconds otherwise (as per previous spec)
    // This routine prefers the 'TTL' member which is always in seconds, or a time-string
    // It can also retrieve the 'mru' member which was always in seconds, for which MRU is an alias
    // It checks the current options and the instance options, meaning the order is:
    // options.TTL, config.TTL, options.ttl, config.ttl
    // These can be constants (number, string) or functions returning the same
    // The return value is always in 'ms' even though they aew all specified in seconds, EXCEPT
    // the lower0case 'ttl' member if it is a constant number.
    
    const timebase = {s:1000,ms:1,m:60000,h:3600000,d:86400000} ;
    const timeRegexp = /([0-9.]+)(s|ms|m|h|d)/ ;

    function time(name,args) {
      var k = [name.toUpperCase(), name.toLowerCase()] ;
      var spec = [options,config] ;
      
      var i,j;
      for (i=0; i<spec.length; i++) {
        for (j=0; j<k.length; j++) {
          if (k[j] in spec[i]) {
            var value = spec[i][k[j]] ;
            if (k[j] === 'ttl' && typeof value === 'number')
              return value ; // The special case of .ttl: <number>, which is in milliseconds
            
            if (typeof value === 'function') 
              value = value.apply(spec[i],args);

            if (typeof value === "undefined")
              return ;
            if (typeof value === 'number')
                return value * 1000 ; // Convert to ms
            if (typeof value === 'string') {
              var m = value.match(timeRegexp);
              if (!m || !timebase[m[2]]) 
                throw new Error("Unknown TTL format: "+value) ;
              return parseFloat(m[1])*timebase[m[2]];
            }
            throw new Error("Unknown TTL format: "+value) ;
          }
        }
      }
    }

    if (!options) options = {} ;
    if (!options.createLocalCache)
      options.createLocalCache = config.createLocalCache || function(){ return new Map() } ;

      function isThenable(f) {
        return f && typeof f.then === "function" ;
      }

      function deferred() {
        var resolve, reject ;
        var d = new Promise(function(r,x){
          resolve = r ;
          reject = x ;
        }) ;
        d.then(function(v){ 
          Object.defineProperties(d,{value: { value: v }});
        }) ;
        Object.defineProperties(d,{
          resolve: { value: resolve },
          reject: { value: reject }
        })
        return d ;
      }

      var afnID = afn.name+"["+hash(afn.toString())+"]" ;
      var backingCache = (options.createCache || config.createCache)(afnID) ;
      var localCache = options.createLocalCache(afnID) ;

      var localID = "local" ;
      try { localID = "local("+os.hostname()+":"+process.pid+")" } catch (ex) {}

      var cache = {
          get:function(key,origin) {
            // This is like an 'async function' (ie. it returns a Promise), _except_ it
            // can synchronously return undefined meaning there is no cache entry and 
            // no hope of getting one asynchronously. This fact is used by the caller
            // to indicate that the entry should be set synchronously, to implement
            // a critcal-section lock
            var now = Date.now() ;
            var l = localCache.get(key) ;
            if (l!==null && l!==undefined) {
              if (l.expires===undefined || l.expires > now) {
                origin && origin.push(localID) ;
                return l.value ;
              }
              localCache.delete(key);
            }
            if (backingCache) {
              var entry = deferred() ;
              localCache.set(key,{ value: entry /* expire me when the max lock-promise-time is met */ }) ;
              var back = backingCache.get(key);
              if (isThenable(back)) {
                back.then(entry.resolve,entry.reject);
              } else {
                entry.resolve(back) ;
              }
              origin && origin.push("backingCache("+(backingCache.name||0)+")") ;
              return entry ;
            }
            origin && origin.push("cachemiss") ;
            // Else return undefined...we don't have (and won't get) an entry for this item
          },
          set:async function(key,data,ttl) {
            if (ttl===0)
               return cache.delete(key);
             if (ttl===undefined)
               ttl = time('ttl',[]);
            // If TTL is absent, the item remains in the cache "forever" (depends on cache semantics)
            // In this context (a cache set operation, ttl is ALWAYS in milliseconds)
            localCache.set(key,{value: data, expires: typeof ttl === "number" ? Date.now() + ttl : undefined }) ;
            if (backingCache) {
              var wait = backingCache.set(key,data,ttl) ;
              if (isThenable(wait))
                wait = await wait ;
            }
          },
          'delete':async function(key) {
            localCache.delete(key) ;
            if (backingCache) backingCache.delete(key) ;
          },
          clear:async function() {
            localCache.clear() ;
            if (backingCache) {
              if (backingCache.clear)
                backingCache.clear() ;
              else {
                (await Promise.resolve(backingCache.keys())).forEach(function(k){ backingCache.delete(k) }) ;
              }
            }
          },
          keys:async function() {
            if (backingCache) {
              var keys = [] ;
              var backingKeys = await Promise.resolve(backingCache.keys()) ;
              for (var bk in backingKeys)
                keys.push(backingKeys[bk]) ;
              var localKeys = localCache.keys() ;
              for (var i in localKeys) {
                var k = localKeys[i] ;
                if (keys.indexOf(k)<0)
                  keys.push(k) ;
              }
              return keys ;
            } else {
              return localCache.keys() ;
            }
          },
          expireKeys:async function(now){
            // Expire local keys
            var keys = localCache.keys() ;
            var expired = [];
            for (var i in keys) {
              var k = keys[i] ;
              var entry = localCache.get(k) ;
              if (entry && entry.expires && entry.expires < now) {
                expired.push(k);
                localCache.delete(k) ;
              }
            }
            // Expire backing keys
            if (backingCache && backingCache.expireKeys) {
              await backingCache.expireKeys(now) ;
            }
            else {
                // This backing cache doesn't support automatic expiry, which gives un
                // a problem in this implementation, as we have no idea what should be 
                // removed, so we just expire the keys we know about, and hope other instances
                // that created keys will do the same
                await Promise.all(expired.map(function(k){ return backingCache.delete(k) }))
            }
          }
      };
      caches.push(cache) ;

      // If 'afn' is NOT a function, just return the backed-cache.
      if (typeof afn !== "function") {
        return cache ;
      }

      // If this async function already has a named memo, use that one
      if (options.link && afn[options.link])
        return afn[options.link] ;

      function createMemo(options) {
        function memoed() {
          var origin = config.origin ? []:undefined ;
          var memoPromise = (async function() {
            var key = getKey(this,arguments,options.key || config.key,afn) ;
            if (key===undefined || key===null) {
              // Not cachable - maybe 'crypto' isn't defined?
              origin && origin.push("apicall") ;
              return afn.apply(this,arguments) ;
            }

            origin && origin.push(key) ;

            var entry = cache.get(key,origin) ;
            if (isThenable(entry)) {
              origin && origin.push("await") ;
              entry = await entry ;
            }

            if (entry) {
              if (isThenable(entry)) {
                origin && origin.push("async") ;
                return entry.result ;
              } else {
                origin && origin.push("sync") ;
                var mru = time('mru',[this,arguments,entry.data]) ; 
                if (mru)
                  cache.set(key,entry,mru * 1000) ;
                return entry ;
              }
              // This entry has expired or contains no pending or concrete data
              await cache.delete(key) ;
              origin && origin.push("expired") ;
            }

            // Create a promise and cache it. Do this _before_ running the underlying function
            // to minimize the timing-hole where two processes attempt to populate the same
            // cache entry. Note this is not possible (and unnecessary) in a single, unclustered
            // process, but the point of afn/memo is to provide a framework for multi-process or
            // clustered processes to avoid unnecessary re-entrancy
            // Note: to eliminate the hole altogether, the get() on line:111 would need to be 
            // an atomic "get-and-set-promise-if-empty" returning a Promise that can be externally resolved/rejected.
            entry = deferred() ;
            origin && origin.push("apicall") ;
            var theseArgs = arguments ;
            var ttl = time('ttl',[this,theseArgs]) ;
            await cache.set(key,entry,ttl); // The early set means other requests get suspended

            // Now run the underlying async function, then resolve the Promise in the cache
            afn.apply(this,theseArgs).then(async function(r){
              try {
                ttl = time('ttl',[this,theseArgs,r]) ;

                origin && origin.push("resolved") ;
                if (ttl) {
                  entry.expires = ttl + Date.now() ;
                  if (origin)
                    origin.expires = entry.expires ;
                }
                await cache.set(key, r, ttl);
                entry.resolve(r) ;
              } catch (x) {
                origin && origin.push("exception") ;
                await cache.delete(key) ;
                entry.reject(x) ;
              }
            },async function(x){
              origin && origin.push("rejected") ;
              await cache.delete(key) ;
              entry.reject(x) ;
            }) ;

            return entry ;
          }).apply(this,arguments);
          if (origin)
            memoPromise.origin = origin ;

          options.testHarness && options.testHarness(this,arguments,afn,memoPromise) ;
          config.testHarness && config.testHarness(this,arguments,afn,memoPromise) ;
          return memoPromise ;
        }
        memoed.options = function(overrides){
          return createMemo(Object.assign({},options,overrides)) ;
        };
        memoed.clearCache = async function(){
          if (cache.clear) {
            cache.clear() ;
          } else {
            (await Promise.resolve(cache.keys())).forEach(function(k){ cache.delete(k) }) ;
          }
          return memoed ;
        };
        if (options.link) {
          Object.defineProperty(memoed,options.link,afn) ;
          Object.defineProperty(afn,options.link,memoed) ;
        }
        return memoed ;
      }

      return createMemo(options) ;

      function getKey(self,args,keySpec,fn) {
        if (typeof keySpec==='function') {
          var spec = keySpec(self,args,fn,memo) ;
          if (spec===undefined)
            return spec ;

          if (spec instanceof Object)
            return (typeof spec)+"/"+hash(spec) ;
          return (typeof spec)+"/"+spec.toString() ;
        }
        return hash({self:self,args:args}) ;
      }
  };

  function hashCode(h,o,m) {
    if (o===undefined) {
      h.update("undefined") ;
      return  ;
    }
    if (o===null) {
      h.update("null") ;
      return ;
    }
    if (typeof o === 'object'){
      if (m.get(o))
        return ;
      m.set(o,o) ;
      if (config.unOrderedArrays && Array.isArray(o)) {
        h.update("array/"+o.length+"/"+o.map(hash).sort()) ;
      } else {
        Object.keys(o).sort().map(function(k) { 
          return hashCode(h,k)+hashCode(h,o[k],m) 
        }) ;
      }
    } else {
      h.update((typeof o)+"/"+o.toString()) ;
    }
  }

  function hash(o) {
    if (!crypto)
      return undefined ;
    var h = crypto.createHash('sha256');
    hashCode(h,o,new Map()) ;
    return h.digest(config.hashEncoding || 'latin1') ;
  }

  function subHash(o) {
    var h = 0, s = o.toString() ;
    for (var i=0; i<s.length; i++)
      h = (h*2333 + s.charCodeAt(i)) & 0xFFFFFFFF;
    return h.toString(36) ;
  }

  var hashes = {
      basicCreateHash: function(){
        var n = 0 ;
        var codes = ["0","0","0","0","0","0"] ;
        return {
          update:function(u){
            n = (n+1)%codes.length ;
            codes[n] = subHash(codes[n]+u) ; 
          },
          digest:function(){
            return codes.join('');
          }
        }
      }
  } ;

  config = config || {} ;
  config.createCache = config.createCache || function(cacheID){ return null } ;
  var caches = [] ;
  var crypto ;
  switch (typeof config.crypto) {
  case 'string':
    crypto = { createHash: hashes[config.crypto]} ;
    break ;
  case 'object':
    crypto = config.crypto ;
  }

  if (!crypto) {
    function _require(mod) {
      try {
        return typeof require==="function" ? require(mod):undefined ;
      } catch (ex) {
        return undefined ;
      }
    }

    crypto = _require('crypto') || { createHash:hashes.basicCreateHash };
  }

  var timer = setInterval(async function cleanCaches() {
    var now = Date.now();
    for (var i=0; i<caches.length; i++) {
      caches[i].expireKeys(now) ;
    }
  } ,60000) ;

  if (timer.unref)
    timer.unref()

  memo.hash = hash ; // Other exports that are useful

  return memo ;
} ;
