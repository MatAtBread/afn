'use nodent';
'use strict';

/* 'memoize' an async function so that that multiple calls with 
 * matching* parameters return the same async result in a Promise
 * for the specified amount of time.
 * 
 *  Example:
 *      var getUser = memo(getUserById,{
 *          key:<<key-specification>>,  // optional
 *          ttl:<<max cache time>>      // optional
 *      });
 *      
 *  The key-specification a `function(this,arguments,asyncFunction)` that returns an object containing the key values to memoize against.
 *  The default behaviour is to hash concrete values in the objects 'this' and 'args', ignoring any values attached to the asyncFunction
 */

var os = require('os') ;

module.exports = function(config){
    function memo(afn,options) {
        if (!options) options = {} ;
        if (!options.createLocalCache)
            options.createLocalCache = config.createLocalCache || function(){ return new Map() } ;

        function isThenable(f) {
            return f && typeof f.then === "function" ;
        }
        
        function deferred() {
            var d = {
                result:{ value:null },
                resolve:{ value:null },
                reject:{ value:null }
            } ;
            d.result.value = new Promise(function(r,x){
                d.resolve.value = r ;
                d.reject.value = x ;
            }) ;
            return Object.create(null,d) ;
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
                var l = localCache.get(key) ;
                if (l!==null && l!==undefined) {
                    origin && origin.push(localID) ;
                    return l ;
                }
                if (backingCache) {
                    var entry = deferred() ;
                    localCache.set(key,entry.result) ;
                    var back = backingCache.get(key);
                    if (isThenable(back)) {
                        back.then(entry.resolve,entry.reject);
                    } else {
                        entry.resolve(back) ;
                    }
                    origin && origin.push("backingCache("+(backingCache.name||0)+")") ;
                    return entry.result ;
                }
                origin && origin.push("cachemiss") ;
                // Else return undefined...we don't have (and won't get) an entry for this item
            },
            set:async function(key,data,ttl) {
                if (ttl) {
                    localCache.set(key,data) ;
                    if (backingCache) {
                        var wait = backingCache.set(key,data,ttl) ;
                        if (isThenable(wait))
                            wait = await wait ;
                    }
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
                for (var i in keys) {
                    var k = keys[i] ;
                    var entry = localCache.get(k) ;
                    if (entry && entry.expires && entry.expires < now)
                        localCache.delete(k) ;
                }
                // Expire backing keys
                if (backingCache) {
                    if (backingCache.expireKeys)
                        await backingCache.expireKeys(now) ;
                    else {
                        keys = await Promise.resolve(backingCache.keys()) ;
                        for (var i in keys) {
                            k = keys[i] ;
                            entry = await Promise.resolve(backingCache.get(k)) ;
                            if (entry && entry.expires && entry.expires < now)
                                backingCache.delete(k) ;
                        }
                    }
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
                    var key = getKey(this,arguments,options.key,afn) ;
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
                        if (!entry.expires || entry.expires > Date.now()) {
                            if ('data' in entry) {
                                origin && origin.push("sync") ;
                                var mru = options.mru && options.mru(this,arguments,entry.data) ; 
                                if (mru) {
                                    mru = mru*1000 ;
                                    var mruExpiry = mru + Date.now() ;
                                    if (mruExpiry > entry.expires) {
                                        origin && origin.push("mru("+new Date(mruExpiry).toISOString()+")") ;
                                        entry.expires = mruExpiry ;
                                        cache.set(key,entry,mruExpiry) ;
                                    }
                                }
                                return entry.data ;
                            }
                            if (isThenable(entry.result)) {
                                origin && origin.push("async") ;
                                return entry.result ;
                            }
                        }
                        // This entry has expired or contains no pending or concrete data
                        await cache.delete(key) ;
                        origin && origin.push("expired") ;
                    } else {
                        var inProgress = localCache.get(key) ;
                        if (inProgress && !inProgress.then) {
                            origin && origin.push("inprogress") ;
                            return inProgress.result ;
                        }
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
                    var ttl = typeof options.ttl === "number"?options.ttl:1000*options.ttl(this,theseArgs) ;
                    await cache.set(key,entry,ttl) ; // The early set means other requests get suspended

                    // Now run the underlying async function, then resolve the Promise in the cache
                    afn.apply(this,theseArgs).then(function(r){
                        try {
                            if (typeof options.ttl === "function")
                                ttl = 1000*options.ttl(this,theseArgs,r) ;
                            
                            origin && origin.push("resolved") ;
                            if (ttl) {
                                entry.expires = ttl + Date.now() ;
                                if (origin)
                                    origin.expires = entry.expires ;
                            }
                            entry.data = r ;
                            await cache.set(key,entry,ttl) ;
                            entry.resolve(r) ;
                        } catch (x) {
                            origin && origin.push("exception") ;
                            await cache.delete(key) ;
                            entry.reject(x) ;
                        }
                    },function(x){
                        origin && origin.push("rejected") ;
                        await cache.delete(key) ;
                        entry.reject(x) ;
                    }) ;

                    return entry.result ;
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
                var spec = keySpec(self,args,fn) ;
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
        
    return memo ;
} ;
