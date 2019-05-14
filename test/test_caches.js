module.exports = {
    local: { origin:true },
    redis: (function(){
        try {
            const redisCache = require('afn-redis-cache')({
                // log(){console.log('afn-redis-cache',Array.prototype.slice.call(arguments).toString())},
                redis:"redis://127.0.0.1/13",
                defaultTTL:120,
                asyncTimeOut:30
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
    fileSync:{
        crypto:"basicCreateHash",
        origin:true,
        createCache:function(id){
            const fs = require('fs') ;
            const root = "./afn-data/" ;
            const dir = root+id+"/" ;
    
            var fileCache = {
                async get(key) { 
                    try { 
                        return JSON.parse(fs.readFileSync(dir+encodeURIComponent(key))) 
                    } catch (ex) {
                        if (ex.code==="ENOENT") return ; 
                        else throw ex ; 
                    } 
                },
                set(key,value) { fs.writeFileSync(dir+encodeURIComponent(key),JSON.stringify(value)) },
                keys() { try { return fs.readdirSync(dir).map(n => decodeURIComponent(n)) } catch (ex) { return [] }},
                clear() { fileCache.keys().forEach(fn => fileCache.delete(fn)) },
                'delete'(key) {
                    try {
                        fs.unlinkSync(dir+encodeURIComponent(key)) ;
                    } catch (ex) {
                        if (ex.code==="ENOENT") return ;
                        throw ex ;
                    }
                }
            }
            
            //console.log("Deleting old file cache",id);
            fileCache.keys().forEach(fn => fileCache.delete(fn)) ;
            try { fs.mkdirSync(root) ; } catch(ex) {}
            try { fs.mkdirSync(dir) ; } catch(ex) {}
            return fileCache ;
        }
    },
    fileAsync: {
        crypto:"basicCreateHash",
        origin:true,
        createCache:function(id){
            const _fs = require('fs') ;
            const fs = _fs.promises;
            const root = "./afn-data/" ;
            const dir = root+id+"/" ;
    
            //console.log("Deleting old file cache",id);
            require('rimraf').sync(dir);
            debugger;
            try { _fs.mkdirSync(root) ; } catch(ex) {}
            try { _fs.mkdirSync(dir) ; } catch(ex) {}
    
            var fileCache = {
                async get(key) { 
                    try { 
                        return JSON.parse(await fs.readFile(dir+encodeURIComponent(key))) 
                    } catch (ex) {
                        if (ex.code==="ENOENT") return ; 
                        else throw ex ; 
                    } 
                },
                async set(key,value) { await fs.writeFile(dir+encodeURIComponent(key),JSON.stringify(value)) },
                async keys() { try { return (await fs.readdir(dir)).map(n => decodeURIComponent(n)) } catch (ex) { return [] }},
                async clear() { return Promise.all((await fileCache.keys()).map(fn => fileCache.delete(fn))) },
                async 'delete'(key) {
                    try {
                        await fs.unlink(dir+encodeURIComponent(key)) ;
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
    