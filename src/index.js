import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import deepEqual from 'deep-equal';
import { throttle } from 'lodash';

import defaultConfig, {
  cacheGet,
  cacheSet,
  CACHE_REVALIDATORS,
  CONCURRENT_PROMISES,
  CONCURRENT_PROMISES_TS,
  FOCUS_REVALIDATORS,
  MUTATION_TS
} from './config';

import useHydration from './libs/use-hydration';
import isDocumentVisible from './libs/is-document-visible';

// 根据传入的key找到相应的 update handler 队列、从cache中取出key对应的 state, 遍历并执行 update handler,
// 从而实现将最新的 state 更新到组件视图
const trigger = function (key, shouldRevalidate = true) {
  const updaters = CACHE_REVALIDATORS[key];
  if (updaters) {
    for (let i = 0; i < updaters.length; ++i) {
      updaters[i](shouldRevalidate);
    }
  }
};

// 本地更新（local mutation）cache 中存储的 state
const mutate = function (key, data, shouldRevalidate = true) {
  // update timestamp
  MUTATION_TS[key] = Date.now() - 1;

  // update cached data
  cacheSet(key, data);

  // update existing SWR Hooks' state
  const updaters = CACHE_REVALIDATORS[key];
  if (updaters) {
    for (let i = 0; i < updaters.length; ++i) {
      updaters[i](shouldRevalidate);
    }
  }
};

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

  // 假定 key 作为请求的标志符
  // key 可以改变但是 fn 不能
  // key 作为 revalidate 函数的依赖
  let key;
  if (typeof _key === 'function') {
    try {
      key = _key();
    } catch (error) {
      key = '';
    }
  }

  // 配置对象
  config = Object.assign({}, defaultConfig, config);

  // useSWR自定义 rerender 部分
  // state: get from cache
  const [data, setData] = useState(useHydration() ? undefined : cacheGet(key));
  const [error, setError] = useState();
  const [isValidating, setIsValidating] = useState(false);

  // 上一次的请求状态
  // errorRef 在 revalidate 函数中使用（是否是上一次请求的的错误）
  const errorRef = useRef(false);
  // key 的引用，useSWR 允许在运行时修改传入的 key
  const keyRef = useRef();
  // 当前组件是否已经 unmount
  const unmountedRef = useRef(false);
  const dataRef = useRef(data);

  // revalidate 函数(重要)
  // 发起请求、处理响应的主要过程
  const revalidate = () =>
    useCallback(
      async (revalidateOpts = {}) => {
        if (!key) return false;
        if (unmountedRef.current) return false;

        let loading = true;

        try {
          setIsValidating(true);

          let newData;
          let originalRequest = !!(
            CONCURRENT_PROMISES[key] === undefined || revalidateOpts.noDedupe
          );
          let ts;

          if (!originalRequest) {
            // 不同组件，请求去重
            // 获取新数据
            ts = CONCURRENT_PROMISES_TS[key];
            newData = await CONCURRENT_PROMISES[key];
          } else {
            // 没有缓存数据渲染页面
            // 触发加载缓慢事件
            if (!cacheGet(key)) {
              setTimeout(() => {
                if (loading) config.onLoadingSlow(key, config);
              }, config.loadingTimeout);
            }
            CONCURRENT_PROMISES[key] = fn(key);
            CONCURRENT_PROMISES_TS[key] = ts = Date.now();
            setTimeout(() => {
              delete CONCURRENT_PROMISES[key];
              delete CONCURRENT_PROMISES_TS[key];
            }, config.dedupingInterval);
            newData = await CONCURRENT_PROMISES[key];

            // 触发成功事件（只有在第一次请求）
            config.onSuccess(newData, key, config);
          }

          // 请求结果和本地更新优先级
          if (MUTATION_TS[key] && ts <= MUTATION_TS[key]) {
            setIsValidating(false);
            return false;
          }

          errorRef.current = false;

          unstable_batchedUpdates(() => {
            setIsValidating(false);
            setError(undefined);
            if (dataRef.current && deepEqual(dataRef.current, newData)) {
              // 深度比较，避免额外的重复渲染
            } else {
              // 数据更新
              setData(newData);
              cacheSet(key, newData);
              if (originalRequest) {
                // 同样更新其它更新队列
                trigger(key, false);
              }
              keyRef.current = key;
              dataRef.current = newData;
            }
          });
        } catch (err) {
          delete CONCURRENT_PROMISES[key];
          unstable_batchedUpdates(() => {
            setIsValidating(false);
            setError(err);
          });

          config.onError(err, key, config);
          errorRef.current = true;

          if (config.shouldRetryOnError) {
            const retryCount = (revalidateOpts.retryCount || 0) + 1;
            config.onErrorRetry(
              err,
              key,
              config,
              revalidate,
              Object.assign({}, revalidateOpts, { retryCount })
            );
          }

          loading = false;
          return true;
        }
      },
      [key]
    );

  const forceRevalidate = useCallback(() => revalidate({ noDedupe: true })[revalidate]);

  useLayoutEffect(() => {
    if (!key) return undefined;

    // 当 key 更新后，需要标记为 mounted
    unmountedRef.current = false;

    // 从缓存中获取数据
    const _newData = cacheGet(key);

    // 如果缓存数据或 key 发生变化，则更新 state
    if ((_newData && deepEqual(data, _newData)) || keyRef.current !== key) {
      setData(_newData);
      dataRef.current = data;
      keyRef.current = key;
    }

    // （自动）发起数据更新
    // mounted 之后执行 revalidate 函数
    if (_newData && window['requestIdleCallback']) {
      // 如果有缓存则延迟执行 revalidate
      // 不阻塞渲染
      window['requestIdleCallback'](revalidate);
    } else {
      revalidate();
    }

    // 处理窗口聚焦时重新取数
    // 如果窗口聚焦，执行 revalidate
    // throttle: 节流函数，毕竟多次调用，标签页频繁切换
    const onFocus = throttle(revalidate, config.focusThrottleInterval);

    if (config.revalidateOnFocus) {
      if (!FOCUS_REVALIDATORS[key]) {
        FOCUS_REVALIDATORS[key] = [onFocus];
      } else {
        FOCUS_REVALIDATORS[key].push(onFocus);
      }
    }

    // 全局监听数据更新
    // updater handler
    const onUpdate = (shouldRevalidate = true) => {
      // 从缓存中获取数据
      const newData = cacheGet(key);
      if (!deepEqual(data, newData)) {
        unstable_batchedUpdates(() => {
          setError(undefined);
          setData(newData);
        });
        dataRef.current = newData;
        keyRef.current = key;
      }

      if (shouldRevalidate) {
        return revalidate();
      }

      return false;
    };
    // 全局更新队列
    if (!CACHE_REVALIDATORS[key]) {
      CACHE_REVALIDATORS[key] = [onUpdate];
    } else {
      CACHE_REVALIDATORS[key].push(onUpdate);
    }

    // 轮询
    let id = null;
    async function tick() {
      if ((!errorRef.current && config.refreshWhenHidden) || isDocumentVisible()) {
        // 只有当页面可见时执行
        // 如果发生错误则停止轮询，并让错误函数执行
        await revalidate();
      }

      const interval = config.refreshInterval;
      id = setTimeout(tick, interval);
    }
    if (config.refreshInterval) {
      id = setTimeout(tick, config.refreshInterval);
    }

    // 卸载操作
    return () => {
      // 清除
      setData = () => null;
      setError = () => null;
      setIsValidating = () => null;

      unmountedRef.current = true;

      if (FOCUS_REVALIDATORS[key]) {
        const index = FOCUS_REVALIDATORS[key].indexOf(onFocus);
        if (index >= 0) FOCUS_REVALIDATORS.splice(index, 1);
      }
      if (CACHE_REVALIDATORS[key]) {
        const index = CACHE_REVALIDATORS[key].indexOf(onUpdate);
        if (index >= 0) CACHE_REVALIDATORS.splice(index, 1);
      }

      if (id !== null) {
        clearTimeout(id);
      }
    };
  }, [key, config.refreshInterval, revalidate]);

  // suspense (client side only)
  if (config.suspense && !data) {
    if (typeof window !== 'undefined') {
      if (!CONCURRENT_PROMISES[key]) {
        // need to trigger revalidate immediately
        // to throw the promise
        revalidate();
      }
      throw CONCURRENT_PROMISES[key];
    }
  }

  return {
    error,
    // key 可能会在即将到来的钩子重新渲染中更改，但上一个状态会保持，所以需要匹配最新的 key 和 data
    data: keyRef.current === key ? data : undefined,
    revalidate: forceRevalidate,
    isValidating
  };
}

export default useSWR;
