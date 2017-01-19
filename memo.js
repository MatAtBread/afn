'use nodent-promises';

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

var hashGenerator = require('./hash') ;

module.exports = function(config){
    config = config || {} ;
    config.createCache = config.createCache || function(cacheID){ return null } ;
    var crypto = config.crypto || (typeof require==="function" && require('crypto')) || { createHash:basicCreateHash };
    var hash = hashGenerator(config) ;
    var caches = [] ;

    async function cleanCaches() {
        var now = Date.now();
        for (var i=0; i<caches.length; i++) {
            var cache = caches[i] ;
            var keys = await cache.keys() ;
            for (var i in keys) {
                var k = keys[i] ;
                var entry = await cache.get(k) ;
                if (entry && entry.expires && entry.expires < now)
                    cache.delete(k) ;
            }
        } 
    }

    var timer = setInterval(cleanCaches,60000) ;
    if (timer.unref)
        timer.unref()

    return function memo(afn,options) {
        if (!options) options = {} ;

        if (options.ttl !==undefined && typeof options.ttl!=="number")
            throw new Error("ttl must be undefined or a number") ;
        
        var afnID = hash(afn.toString()) ;
        var backingCache = (options.createCache || config.createCache)(afnID) ;
        var localCache = new Map() ;
        var cache = {
            get:async function(key) {
                var l = localCache.get(key) ;
                if (l) return l ;
                if (backingCache) return backingCache.get(key) ;
            },
            set:async function(key,data,ttl) {
                if (ttl) {
                    localCache.set(key,data) ;
                    if (backingCache) backingCache.set(key,data,ttl) ;
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
            }
        };
        caches.push(cache) ;

        var memoed = async function() {
            var key = getKey(this,arguments,options.key,afn) ;
            if (key===undefined || key===null) {
                // Not cachable - maybe 'crypto' isn't defined?
                return afn.apply(this,arguments) ;
            }
            
            key += afnID ;

            var entry = cache.get(key) ;
            if (entry && typeof entry.then==="function")
                entry = await entry ;
            
            if (entry) {
                if (!entry.expires || entry.expires > Date.now()) {
                    if (entry.result && entry.result.then)
                        return entry.result ;
                    if ('data' in entry)
                        return entry.data ;
                }
                // This entry has expited or contains no pending or concrete data
                cache.delete(key) ;
            }
            var result = afn.apply(this,arguments) ;
            entry = Object.create(null,{result:{value:result}}) ;
            cache.set(key,entry,options.ttl) ;
            result.then(function(r){
                if (options.ttl) {
                    entry.expires = options.ttl + Date.now() ;
                }
                entry.data = r ;
                cache.set(key,entry,options.ttl) ;
            },function(x){
                cache.delete(key) ;
            }) ;
            return result ;
        };
        memoed.clearCache = async function(){
            if (cache.clear) {
                cache.clear() ;
            } else {
                (await Promise.resolve(cache.keys())).forEach(function(k){ cache.delete(k) }) ;
            }
            return memoed ;
        };
        return memoed ;

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
};
