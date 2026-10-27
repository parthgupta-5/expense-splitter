import { useEffect, useState } from 'react';

const matches = (query) => {
  try { return Boolean(window.matchMedia?.(query).matches); } catch { return false; }
};

/** Live result of a CSS media query; false where matchMedia is unavailable. */
export function useMediaQuery(query) {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list?.addEventListener) return undefined;
    const update = () => setValue(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return value;
}

/** Whether the browser believes it has a network connection. It is a hint, not a guarantee. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
