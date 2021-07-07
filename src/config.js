import isDocumentVisible from './libs/is-document-visible';

// 简易的缓存对象
const __Cache = new Map();

function cacheGet(key) {
  return __Cache.get(key) || undefined;
}

function cacheSet(key, value) {
  return __Cache.set(key, value);
}

function cacheClear() {
  __cache.clear();
}

// state managers
const CONCURRENT_PROMISES = {}; // 全局变量，存储当前 key 发起的数据请求 promise 实例
const CONCURRENT_PROMISES_TS = {}; // 全局变量，存储当前 key 发起的数据请求时间戳
const FOCUS_REVALIDATORS = {}; // 全局变量，以 key 为键名存储 focus handler 队列，在窗口聚焦时会顺序调用 focus handler 队列（执行数据更新）
const CACHE_REVALIDATORS = {}; // 全局变量，以 key 为键名存储 useSWR hook 的 updater 队列，可用于在 React 组件外更新组件
const MUTATION_TS = {}; // 全局变量，存储当前 key 发起的 mutate 更新时间戳

// error retry
function onErrorRetry(
  _,
  __,
  config,
  revalidate,
  opts
) {
  if (!isDocumentVisible()) {
    // if it's hidden, stop
    // it will auto revalidate when focus
    return
  }

  // 指数级退避算法
  // https://cloud.google.com/memorystore/docs/redis/exponential-backoff?hl=zh-cn
  // exponential backoff
  // ~~ 对于浮点数，替代 parseInt
  // 1 << count 指 2 ^ count
  const count = Math.min(opts.retryCount || 0, 8)
  const timeout =
    ~~((Math.random() + 0.5) * (1 << count)) * config.errorRetryInterval
  setTimeout(revalidate, timeout, opts)
}

// 内置配置，可以通过useSWR的第 2 或第 3 个参数传入覆盖
const defaultConfig = {
  // 事件
  onLoadingSlow: () => { },
  onSuccess: () => { },
  onError: () => { },
  onErrorRetry,

  errorRetryInterval: 5000,
  focusThrottleInterval: 5000,
  dedupingInterval: 2000,
  loadingTimeout: 3000

  refreshInterval: 0,
  revalidateOnFocus: true,
  refreshWhenHidden: false,
  shouldRetryOnError: true,
  suspense: false
};
export {
  CONCURRENT_PROMISES,
  CONCURRENT_PROMISES_TS,
  FOCUS_REVALIDATORS,
  CACHE_REVALIDATORS,
  MUTATION_TS,
  cacheGet,
  cacheSet,
  cacheClear
};
export default defaultConfig;
