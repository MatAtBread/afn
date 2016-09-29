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
    var crypto = config.crypto || require('crypto');

    return function memo(afn,options) {
        var cache = config.createCache() ;
        caches.push(cache) ;
        if (!options) options = {} ;

        var memoed = function() {
            var key = getKey(this,arguments,options.key,afn) ;
            if (key===undefined || key===null) {
                // Not cachable
                return afn.apply(this,arguments) ;
            }

            var entry = cache.get(key) ;
            if (entry) {
                if (!entry.expires || entry.expires > Date.now())
                    return entry.result ;
                cache.delete(key) ;
            }
            var result = afn.apply(this,arguments) ;
            var entry = {
                expires: 0,
                result: result
            } ;
            cache.set(key,entry) ;
            result.then(function(r){
                if (options.ttl)
                    entry.expires = options.ttl + Date.now() ;
            },function(x){
                cache.delete(key) ;
            }) ;
            return result ;
        };
        memoed.clearCache = function(){
            var cache = config.createCache() ;
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
                h.update((typeof o)+o.toString()) ;
            }
        }

        function hash(o) {
            const h = crypto.createHash('sha256');
            hashCode(h,o,new Map()) ;
            return h.digest('latin1') ;
        }
    };

    function cleanCaches() {
        var now = Date.now();
        caches.forEach(function(c){
            c.forEach(function(entry,k){
                if (entry.expires && entry.expires < now)
                    c.delete(k) ;
            }) ;
        }) ;
    }

    setInterval(cleanCaches,60000).unref() ;
} ;
