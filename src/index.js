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
}

export default useSWR;
