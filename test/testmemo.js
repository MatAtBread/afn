"use nodent";

var afn = require('..')() ;

async function sleep(t) {
    setTimeout(function(){ async return },t) ;
}

async function doubleArg1(n) {
    console.log("doubleArg1(",n,")") ;
    await sleep(500) ;
    return n*2 ;
}

/* memo */
var memo = afn.memo(doubleArg1,{ttl:2000, key(self,args,fn){ return args[0] }})
console.log("Test memoized") ;

console.log(await memo(10,"a")) ;
console.log(await memo(10,"b")) ;
console.log(await memo(11,"a")) ;
await sleep(100);
console.log(await memo(11,"b")) ;
await sleep(3000);
console.log(await memo(10,"a")) ;
console.log(await memo(11,"a")) ;
console.log(await memo(10,"a")) ;
console.log(await memo(11,"a")) ;

console.log(await afn.map({
   a10:memo(10,"a"),                               
   a10again:memo(10,"again"),                               
   a11:memo(11,"a"),                               
   a11again:memo(11,"again")                               
})) ;
