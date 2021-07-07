# swr-learn

Note for reading swr source code

## 主要流程

- 初始化阶段
  - config 的获取
  - 自定义变量 data、error、isValidating...
  - 数据更新 revalidate (核心)
- mounted 阶段
  - 处理数据更新
  - (自动)发起数据更新
  - 处理窗口聚焦时重新取数
  - 全局监听数据更新
  - 轮询
- mutate API
- trigger API

### 参数处理阶段

函数重载处理不同入参逻辑

```js
// 函数重载
// function useSWR(key)
// function useSWR(key, config)
// function useSWR(key, fn, config)
function useSWR(...args) {
  let _key;
  let fn;
  let config = {};

  // 处理参数
  // 根据传入的不同参数进行处理
  if (args.length >= 1) {
    _key = args[0];
  }
  if (typeof args[1] === 'function') {
    fn = args[1];
  } else if (typeof args[1] === 'object') {
    config = args[1];
  }
  if (typeof args[2] === 'object') {
    config = args[2];
  }

  // ......
}
```

### 变量

config
### revalidate 函数（重要）

### 更新缓存

## 错误处理

```js
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
```

## 请求去重（dedupe）

避免某个时间段重复请求发起过多。
原理：每次执行 revalidate 时，判断是否去重。
检验 CONCURRENT_PROMISE 中有没有 key 对应进行中的请求，以及传入的 noDedupe 参数。

```js
let originalRequest = !!(
  CONCURRENT_PROMISES[key] === undefined || revalidateOpts.noDedupe
);
```

## 请求依赖（dependent fetching）

第二个请求依赖于第一个请求。
当 user 为 undefined 时，获取 id 出错，key 为空字符。串，在 revalidate 函数中会直接返回。
当第一个请求得到响应时，会使组件重绘，第二个请求就能发出了。


## Mutate

Mutate 是 swr 暴露给用户操作本地缓存的方法。
Revalidate 函数会在执行时记录发起请求的时间。
当请求得到响应时，会判断 mutate 函数调用时间和发起请求时间的前后关系，发起请求时间早于函数调用时间，说明请求已经过期，就抛弃这个请求不做处理。

## 自动轮询（refetch on interval）

## Config Context

## Suspense
