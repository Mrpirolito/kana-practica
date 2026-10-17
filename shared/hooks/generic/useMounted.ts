import { useEffect, useState } from 'react';

/** False during server render and the first client render; true after mount */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
