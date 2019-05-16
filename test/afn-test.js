const caches = require('./test_caches');

function sleep(t) {
  return new Promise(resolve => setTimeout(resolve, t));
}

async function delay(x) {
  await sleep(100);
  return x ;
}

(async () => {
  var cacheNames = Object.keys(caches);
  for (var i = 0; i < cacheNames.length; i++) {
    var name = cacheNames[i];
    var opts = caches[name];

    var memo = require('../memo')(Object.assign({}, opts, { TTL: '1s' }));
    console.log("Testing: ", name)

    var counter = 1000;
    const increment = memo(async function _increment() {
      return ++counter ;
    });

    async function testExpected(s,expected,r) {
      const cacheName = name;
      const l = [] ;
      const f = function(m) {
        l.push(m);
      }
      debugger;
      await r(f,s) ;
      expected = expected.map(e => typeof e === "boolean" ? (e ? s : undefined) : e)
      const pass = l.length === expected.length && l.every((_,i) => l[i] === expected[i] ? s : undefined) ;
      if (pass) {
        // console.log("pass",cacheName,s)
      } else {
        console.log("FAIL",cacheName,s,l,expected)
      }
    }

    async function f1(log,x) {
      let a = increment() ;
      let b = increment() ;
      log(await a) ;
      log(await b) ;
      await sleep(100);
      let c = increment() ;
      log(await c) ;
      console.log(name,x,a.origin.slice(1));
      console.log(name,x,b.origin.slice(1));
      console.log(name,x,c.origin.slice(1));
    }

    counter = 0 ;
    await testExpected('f1',[1,1,1],f1);
    await sleep(1500);
    await testExpected('f2',[2,2,2],f1);
    debugger;
    increment._flushLocal();
    await testExpected('f3',[2,2,2],f1);

    await sleep(1100);
    counter = 0 ;
    await testExpected('i1',[1,1,2,2],async (log,x) => {
      log(await increment());
      log(await increment()); 
      await sleep(1100);
      log(await increment());
      log(await increment());
    });
  }
  console.log("done");
  process.exit(0);
})();
