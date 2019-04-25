declare module 'afn' {
    /* hash.js */

    interface HashConfig {
        unOrderedArrays?: boolean,
        crypto?: ({createHash(any:any):any}),
        hashEncoding?: string,
    }

    /* memo.js (memoization) */

    interface BaseConfig {
        createCache?: (id: string) => Map<any, any>;
        createLocalCache?: (id: string) => Map<any, any>;
    }

    interface CacheConfig extends BaseConfig {
        TTL: number | string;
    }

    interface MemoFactoryConfig extends HashConfig, CacheConfig {
        origin?: boolean;
    }

    type MemoAsyncFunction<Return, Args extends any[]> = (...args: Args) => Promise<Return>;

    interface MemoConfig<R, A extends any[]> extends BaseConfig {
        link?: string;
        key?: (self: any, args: any[], fn: MemoAsyncFunction<R, A>, memo: any) => any;
        MRU?: number | string | ((afn: MemoAsyncFunction<R, A>, args: any[], result: R | null | undefined) => number | string);
        TTL?: number | string | ((afn: MemoAsyncFunction<R, A>, args: any[], result: R | null | undefined) => number | string);
    }

    /* memo.js (async maps) */

    interface AsyncMap<K, V> {
        get(key: K): Promise<V | undefined>;
        set(key: K, value: V): Promise<void>;
        set(key: K, value: V, ttl: number): Promise<void>;
        clear(): Promise<void>;
        keys(): Promise<K[]>;
        delete(key: K): Promise<void>;
        expireKeys(now: number): Promise<void>;
    }

    /* memo.js - entry */

    interface MemoizerOrAsyncMapper {
        <R, A extends any[]>(afn: MemoAsyncFunction<R, A>, opts?: MemoConfig<R, A>) : MemoAsyncFunction<R, A>;
        <K, V>(id: { name: string, key?: K, value?: V }, opts?: CacheConfig) : AsyncMap<K, V>;
        hash: (source: any) => string;
    }

    /* map.js */

    interface AsyncMapper<R,S> {
        (arg: S) : Promise<R>;
    }

    interface MapFunction {
        // Async counter
        <R>(i: number, mapper: AsyncMapper<R,number>): Promise<Array<R>>;
        // Async object field mapper
        <R, S extends object>(a: S, mapper: AsyncMapper<string, R>): Promise<R>;
        // Async array mapper
        <R, S>(a: Array<S>, mapper: AsyncMapper<R,S>): Promise<Array<R>>;
        // Async object field resolver
        <T extends object>(a: T): Promise<T>;
        // Generalized list (like Promise.all)
        <T>(args:Array<T>): Promise<Array<T>>;
        MapError:Error;
    }

    interface MapFactoryConfig {
        throwOnError?: boolean;
        Promise?: any; // TODO: A function/class that constructs a Promise (eg: the global identifier "Promise")
    }

    /* queue.js */
    interface AsyncQueue {
        add(item:any):void;
        length():number;
        clear():void;
    }

    interface AsyncQueueConstructor {
        ():AsyncQueue
    }

    /* afn.js */
    type AfnLoader = (config: {
        memo?: MemoFactoryConfig;
        map?: MapFactoryConfig;
        hash?: HashConfig;
        queue?: any;
    }) => {
        memo: MemoizerOrAsyncMapper;
        map: MapFunction;
        hash: (source: any) => string;
        queue():AsyncQueueConstructor;
    };

    const defaultExport:AfnLoader ;
    export default defaultExport;
}