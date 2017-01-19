module.exports = function(config){
    config = config || {} ;
    var crypto = config.crypto || (typeof require==="function" && require('crypto')) || { createHash:basicCreateHash };

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
    
    return hash ;
} ;
