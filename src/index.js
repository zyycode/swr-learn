import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import deepEqual from 'deep-equal';
import { throttle } from 'lodash';

import defaultConfig from './config';

let isHydration = true;

function useHydration() {
  useEffect(() => {
    setTimeout(() => {
      isHydration = false;
    }, 1);
  }, []);
  return isHydration;
}

// 缓存
const __Cache = new Map();

function cacheGet(key) {
  return __Cache.get(key) || undefined;
}

function cacheSet(key, value) {
  return __Cache.set(key, value);
}

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

  // 内部使用的 key
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

  // 定义内部使用状态
  // state: get from cache
  const [data, setData] = useState(useHydration() ? undefined : cacheGet(key));
  const [error, setError] = useState();
  const [isValidating, setIsValidating] = useState(false);

  // 上一次的请求状态
  // errorRef 在 revalidate 函数中使用（是否是上一次请求的的错误）
  const errorRef = useRef(false);
  const keyRef = useRef();
  const unmountedRef = useRef(false);
  const dataRef = useRef(data);

  // revalidate 函数(重要)
  // 发起请求、处理响应的主要过程
  const revalidate = () =>
    useCallback(() => {
      // callback;
    }, [key]);

  const forceRevalidate = useCallback(() => revalidate({ noDedupe: true })[revalidate]);

  // 处理逻辑
  useLayoutEffect(() => {
    // 卸载操作
    return () => {};
  }, [key]);

  return {
    error,
    // key 可能会在即将到来的钩子重新渲染中更改，但上一个状态会保持，所以需要匹配最新的 key 和 data
    data: keyRef.current === key ? data : undefined,
    revalidate: forceRevalidate,
    isValidating
  };
}

export default useSWR;
