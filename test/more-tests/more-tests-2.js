const caches = require('./test_caches');

const log = console.log.bind(console);

function sleep(t) {
  return new Promise(resolve => setTimeout(resolve, t));
}

(async () => {
  var cacheNames = Object.keys(caches);
  for (var i = 0; i < cacheNames.length; i++) {
    var name = cacheNames[i];
    var opts = caches[name];

    var memo = require('../memo')(Object.assign({}, opts, { TTL: '1s' }));
    log("Testing: ", name)

    async function testSequence(fn, arg, expected) {
      async function run(arg) {
        var p = fn(arg);
        var q = await p;
        return { result: q, origin: p.origin };
      }

      var q = [];
      q.push(run(arg));
      q.push(run(arg));
      await sleep(100);
      q.push(run(arg));
      fn._flushLocal();
      q.push(run(arg));

      var cmp = await Promise.all(q);

      await sleep(1000);
      var expired = await run(arg);
      expired.result -= 1;
      cmp.push(expired)

      function noBrackets(s) {
        return s.split('(')[0];
      }

      var state = {
        resultsMatch: !cmp.find(c => c.result !== cmp[0].result),
        badOrigins: cmp.map((c, i) => c.origin.map(noBrackets).join() !== expected[i].map(noBrackets).join() && [
          c.origin.map(noBrackets).join(),
          expected[i].map(noBrackets).join()
        ]).filter(n => n !== false)
      };
      if (!state.resultsMatch || state.badOrigins.length)
        log(state.resultsMatch ? "pass: ": "FAIL: ", state)
      else
        log("pass")
    }


    var testCounter = 1000;
    async function test(x) {
      if (x[0] === '!')
        throw ("NoCache-" + x);
      await sleep(1);
      return testCounter++;
    }
    var fn = memo(test, {
      key(_self, [x], _asyncFunction) { return x }
    });

    const expected = require('./x_expect.json')
    await testSequence(fn, "A", expected[0]);
    await testSequence(fn, "A", expected[1]);
  }
  process.exit(0);

})();
