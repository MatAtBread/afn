'use nodent';
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
        ttl:60000, 
        key:function(self, args, asyncFunction) { return args[0] }  
    }) ;
    
    async function test(x) {
        log("run") ;
        if (x[0] === '!')
        throw ("NoCache-"+x) ;
        await sleep(delay) ;
        return x ;
    }
    
    const localTest = memo(test,{
        ttl:60000, 
        key:function(self, args, asyncFunction) { return args[0] }  
    }) ;
    
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

// Test the "local" (default) in-object cache
await memoize('local',memo()) ;
// Test afn-redis-cache
try {
    const redisCache = require('afn-redis-cache')({
        //        log(){console.log('afn-redis-cache',Array.prototype.slice.call(arguments).toString())},
        redis:"redis://127.0.0.1/13",
        defaultTTL:120,
        asyncTimeOut:30
    }) ;
    await memoize('redis',memo(redisCache)) ;
} catch (ex) {
    console.warn("To test 'afn-redis-cache': cd test ; npm i afn-redis-cache ; cd .. ; npm test") ;
}
// Test a simple JS Map()
await memoize('map',memo({
    createCache:function(id){
        return new Map() ;
    }
})) ;

// Test a basic JS object
await memoize('object',memo({
    createCache:function(id){
        var o = Object.create(null) ;
        return {
            get(key) { return o[key] },
            set(key,value) { o[key] = value },
            keys() { return Object.keys(o) },
            clear() { o = Object.create(null) },
            'delete'(key) { delete o[key] }
        }
    }
})) ;

//Test a basic JS object with an async api
await memoize('async',memo({
    createCache:function(id){
        var o = Object.create(null) ;
        return {
            async get(key) { return o[key] },
            async set(key,value) { o[key] = value },
            async keys() { return Object.keys(o) },
            async clear() { o = Object.create(null) },
            async 'delete'(key) { delete o[key] }
        }
    }
})) ;

//Test a file-based cache
await memoize('file',memo({
    crypto:"basicCreateHash",
    createCache:function(id){
        const fs = require('fs') ;
        const root = "./afn-data/" ;
        const dir = root+id+"/" ;

        var fileCache = {
            get(key) { 
                try { 
                    return JSON.parse(fs.readFileSync(dir+encodeURIComponent(key))) 
                } catch (ex) {
                    if (ex.code==="ENOENT") return ; 
                    else throw ex ; 
                } 
            },
            set(key,value) { fs.writeFileSync(dir+encodeURIComponent(key),JSON.stringify(value)) },
            keys() { try { return fs.readdirSync(dir).map(n => decodeURIComponent(n)) } catch (ex) { return [] }},
            clear() { fileCache.keys().forEach(fn => fileCache.delete(fn)) },
            'delete'(key) {
                try {
                    fs.unlinkSync(dir+encodeURIComponent(key)) ;
                } catch (ex) {
                    if (ex.code==="ENOENT") return ;
                    throw ex ;
                }
            }
        }
        
        console.log("Deleting old file cache",id);
        fileCache.keys().forEach(fn => fileCache.delete(fn)) ;
        try { fs.mkdirSync(root) ; } catch(ex) {}
        try { fs.mkdirSync(dir) ; } catch(ex) {}
        return fileCache ;
    }
})) ;

console.log("TESTS COMPLETE. Passes:",passes," Fails:",fails) ;
process.exit(fails ? -1:0) ;
