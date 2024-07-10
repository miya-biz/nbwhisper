import { useRef, useCallback, useEffect } from 'react';

const useThrottle = <T extends any[]>(
  callback: (...args: T) => void,
  delay: number
) => {
  const waitingRef = useRef<boolean>(false);
  const timeoutRef = useRef<any | null>(null);
  const lastArgsRef = useRef<T | null>(null);

  const throttledFunction = useCallback(
    (...args: T) => {
      if (waitingRef.current) {
        lastArgsRef.current = args;
        return;
      }
      callback(...args);
      // 最新の引数でコールバックを実行したので、保持中の引数はクリア
      lastArgsRef.current = null;
      waitingRef.current = true;
      timeoutRef.current = setTimeout(() => {
        waitingRef.current = false;
        if (lastArgsRef.current !== null) {
          // 最後の引数でコールバックを実行する
          callback(...lastArgsRef.current);
          lastArgsRef.current = null;
        }
      }, delay);
    },
    [callback, delay]
  );

  useEffect(() => {
    return () => {
      if (!timeoutRef.current) {
        return;
      }
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return throttledFunction;
};

export default useThrottle;
