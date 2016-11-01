'use nodent-promise {"noRuntime":true}' ;

global.Promise = require('nodent').Thenable ;
async function sleep(t) {
    setTimeout(function(){ async return }, t) ;
}
debugger ;
var afn = require('..')() ;
var AsyncQueue = afn.queue ;

var theQueue = new AsyncQueue() ;

async function handle() {
    for (var x of theQueue) {
        console.log(await x) ;
//        await sleep(10) ;
    }
}

handle(theQueue) ;
var n = 0 ;
setInterval(function(){
    theQueue.add(n++);
    theQueue.add(n++);
    theQueue.add(n++);
},50) ;

