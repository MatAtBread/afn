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

"use strict";
var crypto = require('crypto');

var caches = [] ;

module.exports = function memo(afn,options) {
    var cache = {} ;
    caches.push(cache) ;
    if (!options) options = {} ;
    var memoed = function() {
        var key = getKey(this,arguments,options.key,afn) ;
        if (key===undefined || key===null) {
            // Not cachable
            return afn.apply(this,arguments) ;
        }
        
        if (cache[key]) {
            if (!cache[key].expires || cache[key].expires > Date.now())
                return cache[key].result ;
            delete cache[key] ;
        }
        var result = afn.apply(this,arguments) ;
        cache[key] = {
            expires: 0,
            result: result
        } ;
        result.then(function(r){
            if (options.ttl && cache[key])
                 cache[key].expires = options.ttl + Date.now() ;
        },function(x){
            delete cache[key] ;
        }) ;
        return result ;
    };
    memoed.clearCache = function(){
        cache = {} ;
        return memoed ;
    };
    return memoed ;
};

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

function cleanCaches() {
    var now = Date.now();
    caches.forEach(function(c){
        Object.keys(c).forEach(function(k){
            if (c[k].expires && c[k].expires < now)
                delete c[k] ;
        }) ;
    }) ;
}

setInterval(cleanCaches,60000).unref() ;
