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
    config.createCache = config.createCache || function(){ return new Map() } ;
    var crypto = config.crypto || (require && require('crypto')) || { createHash:basicCreateHash };

    return function memo(afn,options) {
        if (!options) options = {} ;

        var cache = (options.createCache || config.createCache)() ;
        caches.push(cache) ;

        var memoed = function() {
            var key = getKey(this,arguments,options.key,afn) ;
            if (key===undefined || key===null) {
                // Not cachable - maybe 'crypto' isn't defined?
                return afn.apply(this,arguments) ;
            }

            var entry = cache.get(key) ;
            if (entry) {
                if (!entry.expires || entry.expires > Date.now()) {
                    if (entry.result && entry.result.then)
                        return entry.result ;
                    if ('data' in entry)
                        return Promise.resolve(entry.data) ;
                }
                // This entry has expited or contains no pending or concrete data
                cache.delete(key) ;
            }
            var result = afn.apply(this,arguments) ;
            var entry = Object.create(null,{resut:{value:result}}) ;
            cache.set(key,entry) ;
            result.then(function(r){
                if (options.ttl) {
                    entry.expires = options.ttl + Date.now() ;
                }
                entry.data = r ;
                cache.set(key,entry) ;
            },function(x){
                cache.delete(key) ;
            }) ;
            return result ;
        };
        memoed.clearCache = function(){
            cache.keys().forEach(function(k){ cache.delete(k) }) ;
            return memoed ;
        };
        return memoed ;

        function getKey(self,args,keySpec,fn) {
            if (typeof keySpec==='function')
                return hash(keySpec(self,args,fn)) ;
            return hash({self:self,args:args}) ;
        }

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
            const h = crypto.createHash('sha256');
            hashCode(h,o,new Map()) ;
            return h.digest('latin1') ;
        }
    };

    function subHash(o) {
        var h = 0, s = o.toString() ;
        for (var i=0; i<s.length; i++)
            h = (((h << 5) - h) + s.charCodeAt(i)) & 0xFFFFFFFF;
        return h.toString(36) ;
    }

    function basicCreateHash(){
        var n = 0 ;
        var codes = [[],[],[],[]] ;
        return {
            update:function(u){ codes[(n++)%codes.length].push(u) },
            digest:function(){
                return codes.map(function(str){return subHash(str.join()) }).join('');
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
