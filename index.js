/* Async FunctioN utilities */
require('nodent')();
/* Each function is in a separate file for easy pulling apart if you only want a subset */

function afn(config){
    if (!config) config = {} ;
    var result = Object.create(null) ;
    Object.keys(config).forEach(function(f){
        result[f] = require('./'+f)(config[f])
    }) ;
    return result ;
} ;

module.exports = afn ;
