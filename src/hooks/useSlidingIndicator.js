import { useLayoutEffect, useRef, useState } from 'react';

export const useSlidingIndicator = (activeSelector, activeKey) => {
  const containerRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ opacity: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateIndicator = () => {
      const activeElement = container.querySelector(activeSelector);
      if (!activeElement) {
        setIndicatorStyle({ opacity: 0 });
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      const verticalBleed = 2;
      setIndicatorStyle({
        opacity: 1,
        width: `${activeRect.width}px`,
        height: `${activeRect.height + verticalBleed * 2}px`,
        transform: `translate(${activeRect.left - containerRect.left - container.clientLeft}px, ${activeRect.top - containerRect.top - container.clientTop - verticalBleed}px)`
      });
    };

    updateIndicator();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateIndicator);
    resizeObserver?.observe(container);
    window.addEventListener('resize', updateIndicator);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [activeSelector, activeKey]);

  return { containerRef, indicatorStyle };
};
