'use strict';

const delay = 500 ;

function sleep(t) {
    return new Promise(resolve => setTimeout(resolve, t));
}

var passes = 0, fails = 0 ;
async function memoize(name,memo) {
    var output = [] ;
    
    function log(s) {
        output.push(s) ;
        if (s==='done') {
            var testOut = output.join("_") ;
            if (testOut.length !== "run_run_immediately-first_first_first_second_first_second_run_NoCache-!_immediately-first_run_run_NoCache-!_NoCache-!_done".length) {
                console.log(testOut,"\nFAILED",name,"(maybe the cache wasn't empty at startup?)") ;
                fails += 1 ;
            } else {
                console.log("PASS",name) ;
                passes += 1 ;
            }
            async return ;
        }
    }
    
    const immediateTest = memo(async function immediateTest(x) {
        return "immediately-"+x ;
    },{
        TTL:60, 
        key:function(self, args, asyncFunction) { return args[0] }  
    }) ;
    
    async function test(x) {
        log("run") ;
        if (x[0] === '!')
            throw ("NoCache-"+x) ;
        await sleep(delay) ;
        return x ;
    }
    
    const _localTest = memo(test,{
        origin:true,
        TTL:60, 
        key:function(self, args, asyncFunction) { return args[0] }  
    }) ;
    

    const localTest = _localTest  ;//(...args) => { let p = _localTest(...args) ; return p.then(_ => console.log(p.origin)) }
    immediateTest("first").then(log,log) ;
    
    localTest("first").then(log,log) ;
    localTest("second").then(log,log) ;
    localTest("first").then(log,log) ;
    await sleep(delay*1.2);
    localTest("first").then(log,log) ;
    localTest("second").then(log,log) ;
    
    localTest("!").then(log,log) ;
    await sleep(delay*1.2);
    localTest("!").then(log,log) ;
    localTest("!").then(log,log) ;
    
    immediateTest("first").then(log,log) ;
    
    localTest("done").then(log,log) ;
}

var memo = require('../memo') ;
var caches = require('./test_caches');

(async ()=>{

var cacheNames = Object.keys(caches) ;
for (var i=0; i<cacheNames.length; i++){
    var name = cacheNames[i] ;
    var options = caches[name] ;
    await memoize(name,memo(options)) ;

}

console.log("TESTS COMPLETE. Passes:",passes," Fails:",fails) ;
process.exit(fails ? -1:0) ;

})();
