import { afn } from 'afn';

const { memo, map, hash, queue } = afn({
    queue: null,
    memo:{ TTL: 60 },
    map:{ throwOnError: true },
    hash:{ unOrderedArrays: true, hashEncoding: 'base64' }
}) ;

(async function(){
    const z = new queue() ;

    z.add(Promise.resolve(1));
    z.add(2);
    setTimeout(()=>z.add(3),1000);

    const zz = z[Symbol.iterator]() ;

    console.log("Q",await zz.next().value);
    console.log("Q",await zz.next().value);
    console.log("Q",await zz.next().value);
})().then(console.log.bind(console), console.log.bind(console));

function sleep(t:number){
    return new Promise(resolve => setTimeout(resolve,t*1000)) ;
}

(async function () {
    async function inc(x:number) {
        console.log("inc: ",x) ;
        return x+1
    }

    const minc = memo(inc) ;

    let x = await inc(10) ;
    let y = await minc(11) ;
    await sleep(2) ;
    x = await inc(10) ;
    y = await minc(11) ;
    console.log(x,y) ;

    minc.clearCache();
    x = await inc(10) ;
    y = await minc(11) ;
    await sleep(2) ;
    x = await inc(10) ;
    y = await minc(11) ;
    console.log(x,y) ;

    const m = memo({name:'test', key:0, value:''}) ;
    await m.set(123,"abc") ;
    await m.set(456,"def", 1000) ;
    console.log(await m.keys(), await m.get(123), await m.get(456)) ;
    await sleep(2) ;
    console.log(await m.keys(), await m.get(123), await m.get(456)) ;

    let a ;
    a = await map(10,async (x:number) => x*3 ) ;
    console.log(a) ;
    a = await map([6,4,2],async (x:number) => x/2 ) ;
    console.log(a) ;
    let src = {abc:Promise.resolve(123),def:456} ;
    a = await map(src) ;
    console.log(a) ;
    a = await map(src,async (key:string) => key.toUpperCase()) ;
    console.log(a) ;

    a = await map([Promise.resolve("123"),inc(456),await inc(789),"hello"]) ;
    console.log(a) ;

    let obj = {a:'def',b:123,c:[12,34,56],d:{e:'f'}};
    console.log(hash(obj)) ;
    obj.c = [56,12,34] ;
    console.log(hash(obj)) ;
})() ;
