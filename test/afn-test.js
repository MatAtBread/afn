const caches = require('./test_caches');

function sleep(t) {
  return new Promise(resolve => setTimeout(resolve, t));
}

async function delay(x) {
  await sleep(100);
  return x ;
}

async function runTests(implementation) {
  var cacheNames = Object.keys(caches);
  for (var i = 0; i < cacheNames.length; i++) {
    var name = cacheNames[i];
    var opts = caches[name];

    var memo = implementation(Object.assign({}, opts, { TTL: '1s', asyncTimeOut: 2 }));
    console.log("\nTesting: ", name)

    async function testExpected(s,expected,r) {
      const cacheName = name;
      const l = [] ;
      const log = l.push.bind(l);

      await r(log,s) ;
      expected = expected.map(e => typeof e === "boolean" ? (e ? s : undefined) : e)
      const pass = l.length === expected.length && l.every((_,i) => l[i] === expected[i] ? s : undefined) ;
      if (pass) {
        console.log("pass "+cacheName+" "+s+"                         \u001b[1A")
      } else {
        console.log("FAIL",cacheName,s,l,expected)
      }
    }

    var counter = 1000;

    async function _increment(oops) {
      counter += 1;
      if (oops) {
        throw new Error("X"+oops);
      }
      return counter ;
    }
    const increment = memo(_increment);
    const increment2 = memo(_increment,{
      key(self,[oops]) { return oops|| "nothing" }
    });

    async function f1(log,x) {
      let a = increment() ;
      let b = increment() ;
      log(await a) ;
      log(await b) ;
      await sleep(100);
      let c = increment() ;
      log(await c) ;
//      console.log(name,x,a.origin.slice(1));
//      console.log(name,x,b.origin.slice(1));
//      console.log(name,x,c.origin.slice(1));
    }

    counter = 0 ;
    await testExpected('f1',[1,1,1],f1);
    await sleep(1500);
    await testExpected('f2',[2,2,2],f1);
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

    counter = 10 ;
    await testExpected('r1',[11,12,13,12,14,12,15,12],async (log,x) => {
      log(await increment(undefined,'a'));
      log(await increment2(undefined,'a'));
      log(await increment(undefined,'b'));
      log(await increment2(undefined,'b'));
      log(await increment(undefined,'c'));
      log(await increment2(undefined,'c'));
      log(await increment(undefined,'d'));
      log(await increment2(undefined,'d'));
    });

    counter = 10 ;

    await increment.clearCache();
    await testExpected('x1',[11,name,11],async (log,x) => {
      try {
        log(await increment());
        log(await increment(name)); 
      } catch (ex) {
        log(ex.message);
      }
      log(await increment()); 
    });
  }
  console.log("done");
}

(async () =>{
  console.log("../memo")
  await runTests(require('../memo'))
  console.log("../dist/memo")
  await runTests(require('../dist/memo'))
  process.exit(0);
})()
