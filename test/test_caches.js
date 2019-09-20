
function sleep(t) {
    return new Promise(resolve => setTimeout(resolve, t));
  }
  
module.exports = {
    local: { origin:true },
    async:{
        origin:true,
        createCache:function(id){
            var o = Object.create(null) ;
            return {
                async get(key) { return o[key] },
                async set(key,value) { o[key] = value },
                async keys() { return Object.keys(o) },
                async clear() { o = Object.create(null) },
                async 'delete'(key) { delete o[key] }
            }
        }
    },
    slowAsync:{
        origin:true,
        createCache:function(id){
            var o = Object.create(null) ;
            return {
                async get(key) { await sleep(50) ; return o[key] },
                async set(key,value) { await sleep(50) ; o[key] = value },
                async keys() { await sleep(50) ; return Object.keys(o) },
                async clear() { await sleep(50) ; o = Object.create(null) },
                async 'delete'(key) { await sleep(50) ; delete o[key] }
            }
        }
    },
    redis: (function(){
        try {
            const redisCache = require('afn-redis-cache')({
                //log(msg,key,timeOffset,data) {console.log('afn-redis-cache',msg,key,timeOffset,data)},
                redis:"redis://127.0.0.1/13",
                defaultTTL:10,
                asyncTimeOut:5
            }) ;
            return {...redisCache, origin: true};
        } catch (ex) {
            console.warn("To test 'afn-redis-cache': cd test ; npm i afn-redis-cache ; cd .. ; npm test") ;
            return { origin:true } ; // Just use a local cache instead
        }
    })(),
    map:{
        origin:true,
        createCache:function(id){
            return new Map() ;
        }
    },
    object:{
        origin:true,
        createCache:function(id){
            var o = Object.create(null) ;
            return {
                get(key) { return o[key] },
                set(key,value) { o[key] = value },
                keys() { return Object.keys(o) },
                clear() { o = Object.create(null) },
                'delete'(key) { delete o[key] }
            }
        }
    },
    fileSync:{
        crypto:"basicCreateHash",
        origin:true,
        createCache:function(id){
            const fs = require('fs') ;
            const root = "./afn-data" ;
            const dir = root+"/"+id ;
    
            require('rimraf').sync(dir);

            try { fs.mkdirSync(root) ; } catch(ex) { }
            try { fs.mkdirSync(dir) ; } catch(ex) { }
            function name(key) { return dir+"/"+encodeURIComponent(key)+".json" }
            var fileCache = {
                async get(key) { 
                    try { 
                        return JSON.parse(fs.readFileSync(name(key))) 
                    } catch (ex) {
                        if (ex.code==="ENOENT") return ; 
                        else throw ex ; 
                    } 
                },
                set(key,value) { fs.writeFileSync(name(key),JSON.stringify(value)) },
                keys() { 
                    try { 
                        return fs.readdirSync(dir).map(n => decodeURIComponent(n).replace(/\.json$/,"")) 
                    } catch (ex) { return [] }},
                clear() { fileCache.keys().forEach(fn => fileCache.delete(fn)) },
                'delete'(key) {
                    try {
                        fs.unlinkSync(name(key)) ;
                    } catch (ex) {
                        if (ex.code==="ENOENT") return ;
                        console.log('fileAsync',ex) ;                             
                        throw ex ;
                    }
                }
            }
            return fileCache ;
        }
    },
    fileAsync: {
        crypto:"basicCreateHash",
        origin:true,
        createCache:function(id){
            const _fs = require('fs') ;
            const fs = _fs.promises;
            const root = "./afn-data" ;
            const dir = root+"/"+id ;
    
            require('rimraf').sync(dir);

            try { _fs.mkdirSync(root) ; } catch(ex) {}
            try { _fs.mkdirSync(dir) ; } catch(ex) {}
    
            function name(key) { return dir+"/"+encodeURIComponent(key)+".json" }
            var fileCache = {
                async get(key) { 
                    try { 
                        return JSON.parse(await fs.readFile(name(key))) 
                    } catch (ex) {
                        if (ex.code==="ENOENT")
                            return ;
                        console.log('fileAsync',ex) ;                             
                        throw ex ; 
                    } 
                },
                async set(key,value) { await fs.writeFile(name(key),JSON.stringify(value)) },
                async keys() {
                    try {
                        return (await fs.readdir(dir)).map(n => decodeURIComponent(n).replace(/\.json$/,"")) 
                    } catch (ex) { return [] }},
                async clear() { return Promise.all((await fileCache.keys()).map(fn => fileCache.delete(fn))) },
                async 'delete'(key) {
                    try {
                        await fs.unlink(name(key)) ;
                    } catch (ex) {
                        if (ex.code==="ENOENT") return ;
                        throw ex ;
                    }
                }
            }
            return fileCache ;
        }
    }
};
    