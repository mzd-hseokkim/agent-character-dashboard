import { useState, useEffect, useMemo } from 'react';

const MOBILE_BREAKPOINT = 700;

export function useMediaQuery() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => setWindowWidth(window.innerWidth), 100);
    };

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handleMediaQueryChange = () => setWindowWidth(window.innerWidth);

    mediaQuery.addEventListener('change', handleMediaQueryChange);
    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      mediaQuery.removeEventListener('change', handleMediaQueryChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isMobile = useMemo(() => windowWidth < MOBILE_BREAKPOINT, [windowWidth]);
  const isTablet = useMemo(() => windowWidth >= MOBILE_BREAKPOINT && windowWidth < 1024, [windowWidth]);
  const isDesktop = useMemo(() => windowWidth >= 1024, [windowWidth]);

  return { windowWidth, isMobile, isTablet, isDesktop, MOBILE_BREAKPOINT };
}
