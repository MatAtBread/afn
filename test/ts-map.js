const afn = require('afn');
const { map } = afn({
  map: { throwOnError: false }
});

(async function () {
  function sleep(t) {
    return new Promise(resolve => setTimeout(resolve, t * 1000));
  }

  const src = {
    a: Promise.resolve(1),
    b: 'b',
    c: {
      nested: Promise.resolve('nested')
    },
    d: sleep(1).then(_ => Promise.resolve('d')),
    e: Promise.reject(Object.assign(new Error('e'),{toJSON(){ return "Error:"+this.message }})),
    f: ()=>1
  };

  var expected = [ 
    '[1,2,3,4,5,6,7,8,9,10]',
    '["H","E","L","L","O"]',
    '["X","Y","Z"]',
    '{"b":"b","c":{"nested":{}},"a":1,"e":"Error:e","d":"d"}',
    '{"a":"object","b":"string","c":"object","d":"object","e":"object","f":"function"}'
  ];
  var result = [
    (await map(10, async i => i + 1)),
    (await map('hello'.split(''), async (ch) => ch.toUpperCase())),
    (await map([Promise.resolve('X'), Promise.resolve('Y'), Promise.resolve('Z')])),
    (await map(src)),
    (await map(src, async (k, e, x) => typeof src[k]))];

  var check = result.map(r => JSON.stringify(r));
  var pass = true;
  for (var i=0; i< expected.length; i++) {
    if (check[i] != expected[i]) {
      pass = false;
      console.log("FAIL",check[i],expected[i])
    }
  }
  if (pass) console.log("pass",pass);
})();
