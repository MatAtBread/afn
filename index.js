/* Async FunctioN utilities */

/* Each function is in a separate file for easy pulling apart if you only want a subset */

module.exports = function(config){
    if (!config) config = {} ;
    var result = Object.create(null) ;
    ['map','memo'].forEach(function(f){
        result[f] = require('./'+f)(config[f])
    }) ;
    return result ;
} ;
