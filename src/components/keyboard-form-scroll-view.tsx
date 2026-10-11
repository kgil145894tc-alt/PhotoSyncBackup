import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, type ScrollViewProps } from 'react-native';

// Resize the form with KeyboardAvoidingView, then reveal the focused field in
// the remaining viewport. Also handle switching fields while the keyboard is up.
export function KeyboardFormScrollView({ onFocus, onLayout, onScroll, ...props }: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  const focusedInput = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const offset = useRef(0);
  const frame = useRef<number | null>(null);

  const revealFocusedInput = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const input = focusedInput.current;
      const viewport = scroll.current;
      if (!input || !viewport || !Keyboard.isVisible() ||
          input !== TextInput.State.currentlyFocusedInput()) return;

      viewport.getNativeScrollRef()?.measureInWindow((_x, top, _width, height) => {
        input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
          if (scroll.current !== viewport || input !== TextInput.State.currentlyFocusedInput() ||
              !Keyboard.isVisible()) return;
          const bottom = Math.min(top + height, Keyboard.metrics()?.screenY ?? top + height) - 16;
          // Oversized multiline fields align at the top so their first lines
          // remain reachable; ordinary fields fit entirely above the keyboard.
          const delta = inputHeight > bottom - top
            ? inputTop - top
            : inputTop + inputHeight > bottom
              ? inputTop + inputHeight - bottom
              : inputTop < top ? inputTop - top : 0;
          if (delta !== 0) viewport.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
        });
      });
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener('keyboardDidShow', revealFocusedInput);
    return () => {
      show.remove();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [revealFocusedInput]);

  return (
    <ScrollView
      {...props}
      ref={scroll}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onFocus={(event) => {
        // Browser focus bubbles through the ScrollView too, but web has no
        // currentlyFocusedInput API and handles revealing fields itself.
        if (Platform.OS !== 'web') {
          focusedInput.current = TextInput.State.currentlyFocusedInput();
          revealFocusedInput();
        }
        onFocus?.(event);
      }}
      onLayout={(event) => {
        revealFocusedInput();
        onLayout?.(event);
      }}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      }}
    />
  );
}
