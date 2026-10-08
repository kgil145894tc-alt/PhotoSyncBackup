import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps } from 'react-native';
import { useClientNavScrollController } from '@/components/client-nav-scroll-provider';
import type { ScrollMetrics } from '@/navigation/scroll-navigation';

export type ClientNavScrollProps = Pick<ScrollViewProps,
  'onScroll' | 'onLayout' | 'onContentSizeChange' | 'scrollEventThrottle'>;
const visibleSnapshot = () => false;
const noSubscription = () => () => {};

export function useClientNavHidden() {
  const controller = useClientNavScrollController();
  return useSyncExternalStore(controller?.subscribe ?? noSubscription,
    controller?.getSnapshot ?? visibleSnapshot, controller?.getServerSnapshot ?? visibleSnapshot);
}

export function useClientNavScroll(): ClientNavScrollProps {
  const controller = useClientNavScrollController();
  const [owner] = useState(() => ({}));
  const metrics = useRef<ScrollMetrics>({ offsetY: 0, contentHeight: 0, viewportHeight: 0 });

  useFocusEffect(useCallback(() => {
    controller?.activate(owner, metrics.current);
    return () => { controller?.deactivate(owner); };
  }, [controller, owner]));

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    metrics.current = { offsetY: contentOffset.y,
      contentHeight: contentSize?.height ?? metrics.current.contentHeight,
      viewportHeight: layoutMeasurement?.height ?? metrics.current.viewportHeight };
    controller?.scroll(owner, metrics.current);
  }, [controller, owner]);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    metrics.current.viewportHeight = event.nativeEvent.layout.height;
    controller?.resize(owner, metrics.current);
  }, [controller, owner]);
  const onContentSizeChange = useCallback((_width: number, height: number) => {
    metrics.current.contentHeight = height;
    controller?.resize(owner, metrics.current);
  }, [controller, owner]);

  return useMemo(() => ({ onScroll, onLayout, onContentSizeChange, scrollEventThrottle: 16 }),
    [onScroll, onLayout, onContentSizeChange]);
}
