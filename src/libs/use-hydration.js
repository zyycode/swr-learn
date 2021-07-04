let isHydration = true;

function useHydration() {
  useEffect(() => {
    setTimeout(() => {
      isHydration = false;
    }, 1);
  }, []);
  return isHydration;
}

export default useHydration;
