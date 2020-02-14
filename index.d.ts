  /* hash.js */

  interface HashConfig {
    unOrderedArrays?: boolean,
    crypto?: string | ({createHash(algorithm:string):any /*{ update:()=>, digest(encoding:string)=>}*/}),
    hashEncoding?: string,
  }

  /* memo.js (memoization) */

  interface BaseConfig {
    createCache?: (id: string) => Map<any, any>;
    createLocalCache?: (id: string) => Map<any, any>;
  }

  interface CacheConfig extends BaseConfig {
    TTL: number | string;
    log?: (...args:any[]) => void;
  }

  interface MemoFactoryConfig extends HashConfig, CacheConfig {
    origin?: boolean;
  }

  interface MemoAsyncFunction<Return, Args extends any[]> {
    (...args: Args) : Promise<Return>;
  } 
  
  interface MemoConfig<R, A extends any[]> extends BaseConfig {
    link?: string;
    key?: (self: any, args: A, fn: MemoAsyncFunction<R, A>, memo: MemoizerOrAsyncMapper) => any;
    MRU?: number | string | ((self: any | undefined, args: A | undefined, result: R | undefined) => number | string);
    TTL?: number | string | ((self: any | undefined, args: A | undefined, result: R | undefined) => number | string);
    asyncTimeOut?: number;
  }

  /* memo.js (async maps) */

  interface AsyncMap<K, V> {
    get(key: K): Promise<V | undefined>;
    has(key: K): Promise<boolean>;
    ttl(key: K): Promise<number | undefined>;
    set(key: K, value: V): Promise<void>;
    set(key: K, value: V, ttl: number): Promise<void>;
    clear(): Promise<void>;
    keys(): Promise<K[]>;
    delete(key: K): Promise<void>;
    expireKeys(now: number): Promise<void>;
  }

  /* memo.js - entry */
  interface MemoizedAsyncFunction<R, A extends any[]> extends MemoAsyncFunction<R,A> {
    clearCache(): Promise<any>;
    peek(...args:A): undefined | null | Promise<undefined | null | { expires: number, value?: R }>;
  }

  interface MemoizerOrAsyncMapper {
    <R, A extends any[]>(afn: MemoAsyncFunction<R, A>, opts?: MemoConfig<R, A>) : MemoizedAsyncFunction<R, A>;
    <K, V>(id: { name: string, key?: K, value?: V }, opts?: CacheConfig) : AsyncMap<K, V>;
    hash: (source: any) => string;
  }

  /* map.js */
  type UnPromise<X, RejectionType> = X extends Promise<never> ? RejectionType | never : X extends Promise<infer Y> ? Y : X ;

  interface MapErrorType extends Error {}
  interface MapFunction {
    // Async counter
    <R>(i: number, mapper: (n:number)=>Promise<R>): Promise<Array<R | MapErrorType>>;
  
    // Async array mapper (default mapper is simply resolution)
    <R, S>(a: Array<S>, mapper?: (s:S)=>Promise<R>): Promise<Array<R | MapErrorType>>;
  
    // Async object field resolver
    <S extends {}>(a: S): Promise<{[k in keyof S]:UnPromise<S[k], MapErrorType>}>;
  
    // Async object field resolver
    <S extends {}, R>(a: S, mapper:(key:keyof S, index:number, keys:string[]) => R): Promise<{[k in keyof S]:R | MapErrorType}>;
  
    MapError:MapErrorType;
  }
  
  interface MapFactoryConfig {
    throwOnError?: boolean;
    Promise?: any; // TODO: A function/class that constructs a Promise (eg: the global identifier "Promise")
  }

  /* queue.js */
  declare class AsyncQueue<T = any> implements Iterable<Promise<T>> {
    constructor();
    add(item: T | Promise<T>):void;
    length():number;
    clear():void;
    [Symbol.iterator](): Iterator<Promise<T>> ;
}

  /* afn.js */
  interface AfnLoader { 
    (config: {
      memo?: MemoFactoryConfig;
      map?: MapFactoryConfig;
      hash?: HashConfig;
      queue?: any;
    }) : {
      memo: MemoizerOrAsyncMapper;
      map: MapFunction;
      hash: (source: any) => string;
      queue: typeof AsyncQueue;
    };
    afn:AfnLoader;
  }

  export const afn:AfnLoader ;
