const cluster = require('cluster');
const afn = require('afn');
const afnRedisCache = require('afn-redis-cache');
const now = Date.now();
if (cluster.isMaster) {
  for (let i = 0; i < 4; i++) {
    cluster.fork();
  }
} else {
  log('forked')
  test();
}

function sleep(t) {
  return new Promise(resolve => setTimeout(resolve, t * 1000));
}
function log(...a) {
  console.log(process.pid,(Date.now()-now)/1000,...a);
}

async function test() {
  const redisCache = afnRedisCache({
    log(...a) { log('afn-redis',...a) },
    redis: "redis://127.0.0.1/13",
    defaultTTL: 20,
    asyncTimeOut: 10,
    link: 'memo'
  });

  const { memo } = afn({
    memo: {
      TTL: 30,
      origin: true,
      ...redisCache
    }
  });

  async function stuff() { await sleep(3) }

  const fn = memo(async function longRunning(run) {
    log("Start",run);
    await stuff();
    log("Done",run);
    return process.pid
  }, {
    TTL: "15s",
    asyncTimeOut: 7,
    key() { return "test" }
  });

  for (let ch of "ABCDE") {
    let p;
    log(await (p=fn(ch)) === process.pid, p.origin.join());
    await sleep(5);
  }
  process.exit(0);
}
