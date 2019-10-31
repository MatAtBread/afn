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

    const increment = memo(async function(counter) {
      await sleep(counter * 500);
      return counter ;
    },{
      TTL(_self, _args, result) {
        if (result) {
          return 1;
        } else {
          return 2;
        }
      }
  });

    async function f1(log,x) {
      log(await increment(1)) ;
      log(await increment(3)) ;
      log(await increment(5)) ;
    }

    await testExpected('f1',[1,3,5],f1);
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
