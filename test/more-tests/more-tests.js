const {memo} = require('afn')({ memo: { TTL: 1, origin: true, hashEncoding: 'base64' }});

function sleep(t) {
  return new Promise(resolve => setTimeout(resolve, t*1000));
}

async function fn() {
  console.log("enter fn()");
  await sleep(4);
  let x = Math.random() * 1000 |0 ; 
  console.log("exit fn()",{'return':x});
  return x;
}

const _mfn = memo(fn);
function mfn(...args) {
  console.log("mfn()");
  return _mfn(...args) ;
}


(async function(){
  let a,b,c;
  
  a = mfn();
  b = mfn();
  console.log(a, await a);
  console.log(b, await b);
  c = mfn();
  console.log(c, await c);

  await sleep(2);

  a = mfn();
  b = mfn();
  console.log(a, await a);
  console.log(b, await b);
  c = mfn();
  console.log(c, await c);

})();