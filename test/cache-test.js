const caches = require('./test_caches');

function sleep(t) {
  return new Promise(resolve => setTimeout(resolve, t));
}

async function delay(x) {
  await sleep(100);
  return x ;
}

async function runTests(implemenattion){
  var cacheNames = Object.keys(caches);
  for (var i = 0; i < cacheNames.length; i++) {
    var name = cacheNames[i];
    var opts = caches[name];

    var memo = implemenattion(Object.assign({}, opts, { TTL: '1s', asyncTimeOut: 2 }));
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

    var cache = memo({name:name}) ;

    async function combinations(notEmpty) {
      // await with concrete values 
      await testExpected('A',
      [false,true],
      async (log,x) => (
        log(await cache.set(x,x)),
        log(await cache.get(x))
      ));

      await testExpected('A1',
      [false,true],
      async (log,x) => (
        log(await cache.set(x,x)),
        cache._flushLocal(), 
        log(await cache.get(x))
      ));

      await testExpected('B',
      [notEmpty,true],
      async (log,x) => (
        log(await cache.get(x)),
        await cache.set(x,x),
        log(await cache.get(x))
      ));

      // await with promises
      await testExpected('C',
      [false,true],
      async (log,x) => (
        log(await cache.set(x,delay(x))),
        log(await cache.get(x))
      ));

      await testExpected('D',
      [notEmpty,true],
      async (log,x) => (
        log(await cache.get(x)),
        await cache.set(x,delay(x)),
        log(await cache.get(x))
      ));

      // then with concrete values
      await testExpected('E',
      [false,true],
      (log,x) => cache.set(x,x).then(log).then(_ => cache.get(x)).then(log,log));

      await testExpected('F',
      [notEmpty,true],
      (log,x) => cache.get(x).then(log).then(_ => cache.set(x,x)).then(_ => cache.get(x)).then(log,log));

      // then with promises 
      await testExpected('G',
      [false,true],
      (log,x) => cache.set(x,delay(x)).then(log).then(_ => cache.get(x)).then(log,log));

      await testExpected('H',
      [notEmpty,true],
      (log,x) => cache.get(x).then(log).then(_ => cache.set(x,delay(x))).then(_ => cache.get(x)).then(log,log))
    }

    async function races(notEmpty) {
      await testExpected('race1',
      [ true, true, false, notEmpty ],
      async (log,x) => {
        let a = cache.get(x);
        let b = cache.get(x);
        let c = cache.set(x,delay(x))
        let d = cache.get(x);
        log(await b);
        log(await d);
        log(await c);
        log(await a);
      })

      await testExpected('race2',
      [ true, true, false, notEmpty ],
      async (log,x) => {
        let a = cache.get(x);
        let b = cache.get(x);
        let c = cache.set(x,x)
        let d = cache.get(x);
        log(await b);
        log(await d);
        log(await c);
        log(await a);
      })
    }

    async function conditional(notEmpty) {
      async function reEnter(log,x) {
        let a = await cache.get(x);
        await sleep(10);
        log(a);
        if (a === undefined) {
          await cache.set(x,x)
        }
        await sleep(10);
        log(await cache.get(x))
      }

      await testExpected('cond1',
      [ notEmpty, true ],
      async (log,x) => reEnter(log,x))

      await testExpected('cond2',
      notEmpty
        ? [ '+', '-', '+', '+', '-', '+' ]
        : [ undefined, undefined, '+', '+', '-', '+' ],
      async (log,x) => {
        await Promise.all([reEnter(log,"+"),reEnter(log,"-"),reEnter(log,"+")])
      })

    }

    async function timeouts() {
      await testExpected('t1',
      [ undefined, 0, undefined, 10 ],
      async (log,x) => {
        let t = Date.now();
        let a = cache.get(x) ;
        let b = cache.get(x) ;
        log(await a,(Date.now() - t)/200 |0);
        log(await b,(Date.now() - t)/200 |0);
      })
    }

    await cache.clear() ;
    await timeouts() ;

    await cache.clear() ;
    await conditional() ;
    await sleep(200);
    await conditional(true) ;

    await cache.clear() ;
    await races() ;
    await sleep(200);
    await races(true) ;

    await cache.clear() ;
    await combinations() ;
    await sleep(200);
    await combinations(true) ;
  }
  console.log("done");
}

(async () => {
  console.log("../memo")
  await runTests(require('../memo'))
  console.log("../dist/memo")
  await runTests(require('../dist/memo'))
  process.exit(0);
})();
