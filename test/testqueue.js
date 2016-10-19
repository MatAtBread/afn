"use nodent" ;

async function sleep(t) {
    setTimeout(function(){ async return }, t) ;
}
debugger ;
var afn = require('..')() ;
var AsyncQueue = afn.queue ;

var q = new AsyncQueue() ;

var n = 0 ;
setInterval(function(){
    n += 1 ;
    q.add(n);
    q.add(n);
    q.add(n);
},500) ;

for (var x of q) {
    console.log(await x) ;
    await sleep(100) ;
}
