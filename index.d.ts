import * as NodeHttp from 'http';
import { URL } from 'url';

/* hash.js */

interface HashConfig {
  unOrderedArrays?: boolean,
  crypto?: string | ({ createHash(algorithm: string): any /*{ update:()=>, digest(encoding:string)=>}*/ }),
  hashEncoding?: string,
  salt?: unknown
}

/* memo.js (memoization) */

interface BaseConfig {
  createCache?: (id: string) => Map<any, any>;
  createLocalCache?: (id: string) => Map<any, any>;
}

interface CacheConfig extends BaseConfig {
  TTL: number | string;
  log?: (...args: any[]) => void;
}

interface MemoFactoryConfig extends HashConfig, CacheConfig {
  origin?: boolean;
}

interface MemoAsyncFunction<Return, Args extends any[]> {
  (...args: Args): Promise<Return>;
}

interface MemoConfig<R, A extends any[]> extends BaseConfig {
  link?: string;
  key?: (self: any, args: A, fn: MemoAsyncFunction<R, A>, memo: MemoizerOrAsyncMapper) => any;
  MRU?: number | string | ((self: any | undefined, args: A | undefined, result: R | undefined) => number | string | undefined);
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
interface MemoizedAsyncFunction<R, A extends any[]> extends MemoAsyncFunction<R, A> {
  clearCache(): Promise<any>;
  peek(...args: A): undefined | null | Promise<undefined | null | { expires: number, value?: R }>;
}

interface MemoizerOrAsyncMapper {
  <R, A extends any[]>(afn: MemoAsyncFunction<R, A>, opts?: MemoConfig<R, A>): MemoizedAsyncFunction<R, A>;
  <K, V>(id: { name: string, key?: K, value?: V }, opts?: CacheConfig): AsyncMap<K, V>;
  hash(source: any): string;
  ttlInMs(value: undefined | string | number): number;
}

/* map.js */
type UnPromise<X, RejectionType> = X extends Promise<never> ? RejectionType | never : X extends Promise<infer Y> ? Y : X;

interface MapErrorType extends Error { }
interface MapFunction<Thrower = { throwOnError: false }> {
  // Async counter
  <R>(i: number, mapper: (n: number) => Promise<R>): Promise<Array<R | Thrower>>;

  // Async array mapper (default mapper is simply resolution)
  <R, S>(a: Array<S>, mapper?: (s: S) => Promise<R>): Promise<Array<R | Thrower>>;

  // Async object field resolver
  <S extends {}>(a: S): Promise<{ [k in keyof S]: UnPromise<S[k], Thrower> }>;

  // Async object field resolver
  <S extends {}, R>(a: S, mapper: (key: keyof S, index: number, keys: string[]) => R): Promise<{ [k in keyof S]: UnPromise<R, Thrower> | Thrower }>;

  MapError: MapErrorType;
}

interface MapFactoryConfig {
  throwOnError?: boolean;
  Promise?: any; // TODO: A function/class that constructs a Promise (eg: the global identifier "Promise")
}

/* queue.js */
declare class AsyncQueue<T = any> implements Iterable<Promise<T>> {
  constructor();
  add(item: T | Promise<T>): void;
  length(): number;
  clear(): void;
  [Symbol.iterator](): Iterator<Promise<T>>;
}

/* http.js */
interface AsyncHttpConfig {
  autoProtocol?: boolean
}

export interface WaitableEvent {
  wait(eventName: 'response'): Promise<NodeHttp.IncomingMessage & WaitableEvent>;
  wait(eventName: 'end'): Promise<void>;
  wait(eventName: string): Promise<unknown>;
}

declare namespace AsyncHttp {
  function request(options: NodeHttp.RequestOptions | string | URL): Promise<WaitableEvent & NodeHttp.ClientRequest>;
  //async request(url: string | URL, options: RequestOptions): Promise<WaitableEvent & NodeHttp.ClientRequest>;
  function get(options: NodeHttp.RequestOptions | string | URL): Promise<WaitableEvent & NodeHttp.IncomingMessage>;
  //async get(url: string | URL, options: NodeHttp.RequestOptions): Promise<WaitableEvent & NodeHttp.IncomingMessgae>;
  function getBody(options: NodeHttp.RequestOptions | string | URL): Promise<string>;

}

/* afn.js */
interface AfnConfig {
  memo?: MemoFactoryConfig;
  map?: MapFactoryConfig;
  hash?: HashConfig;
  queue?: any;
  http?: AsyncHttpConfig;
}

interface AfnLoader {
  <Config extends AfnConfig>(config: Config): {
    memo: MemoizerOrAsyncMapper;
    map: MapFunction<Config["map"] extends { throwOnError: true } ? never : MapErrorType>;
    hash: (source: any) => string;
    queue: typeof AsyncQueue;
    http: typeof AsyncHttp & typeof NodeHttp;
  };
  afn: AfnLoader;
}

export const afn: AfnLoader;
