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

module.exports = function(config){
    "use strict";
    var caches = [] ;
    config = config || {} ;
    config.createCache = config.createCache || function(cacheID){ return null } ;
    var crypto = config.crypto || (typeof require==="function" && require('crypto')) || { createHash:basicCreateHash };

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
                localCache.set(key,data) ;
                if (backingCache) backingCache.set(key,data,ttl) ;
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
                if (backingCache) return backingCache.keys() ;
                return localCache.keys() ;
            }
        };
        caches.push(cache) ;

        var memoed = async function() {
            var key = getKey(this,arguments,options.key,afn)+afnID ;
            if (key===undefined || key===null) {
                // Not cachable - maybe 'crypto' isn't defined?
                return afn.apply(this,arguments) ;
            }

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

    function hashCode(h,o,m) {
        if (o===undefined) {
            h.update("undefined") ;
            return  ;
        }
        if (o===null) {
            h.update("null") ;
            return ;
        }
        if (o instanceof Object){
            if (m.get(o))
                return ;
            m.set(o,o) ;
            Object.keys(o).sort().map(function(k) { 
                return hashCode(h,k)+hashCode(h,o[k],m) 
            }) ;
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

    function basicCreateHash(){
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
    
    function cleanCaches() {
        var now = Date.now();
        caches.forEach(function(c){
            c.forEach(function(entry,k){
                if (entry.expires && entry.expires < now)
                    c.delete(k) ;
            }) ;
        }) ;
    }

    var timer = setInterval(cleanCaches,60000) ;
    if (timer.unref)
        timer.unref()
} ;
