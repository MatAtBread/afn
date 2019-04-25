'use nodent-promise {"noRuntime":true}' ;

global.Promise = global.Promise || require('nodent').Thenable ;
function sleep(t){
    return new Promise(resolve => setTimeout(resolve,t)) ;
}
debugger ;
var afn = require('..')({queue:null}) ;
var AsyncQueue = afn.queue ;

var theQueue = new AsyncQueue() ;

async function handle() {
    for (var x of theQueue) {
        console.log(await x) ;
        await sleep(100) ;
    }
}

handle(theQueue) ;
var n = 0 ;
function addItems(){
    theQueue.add(n++);
    theQueue.add(n++);
    theQueue.add(n++);
    if (n < 20)
        setTimeout(addItems,5 * Math.pow(n,2)) ;
}
addItems() ;

