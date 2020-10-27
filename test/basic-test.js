const caches = require('./test_caches');

function sleep(t) {
  return new Promise(resolve => setTimeout(resolve, t));
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

    async function exceptions() {
      await testExpected('basic', [ 
        '(1)', '=1', '(0)', 'X!0', '(3)', '=3', '(4)', '=4',
               '=1', '(0)', 'X!0',        '=3',        '=4'
      ],
      async (log,x) => {
        var a = memo(async function _a(f) {
          log('('+f+')');
          if (!f) 
           throw "!"+f;
          return "="+f;
        }) ;
        await a.clearCache() ;
        try {
          log(await a(1));
          log(await a(0));
          log(await a(2));
        } catch(ex) {
          log("X"+ex);
          log(await a(3));
        }
        log(await a(4));
        try {
          log(await a(1));
          log(await a(0));
          log(await a(2));
        } catch(ex) {
          log("X"+ex);
          log(await a(3));
        }
        log(await a(4));
      })
    }

    await exceptions() ;
  }
  console.log("done");
}

(async () => {
  console.log("../memo")
  await runTests(require('../memo'))
  process.exit(0);
})();
