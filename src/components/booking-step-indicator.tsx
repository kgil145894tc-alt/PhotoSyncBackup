import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const STEP_SIZE = 26;
const STEP_RADIUS = STEP_SIZE / 2;
const STEP_GAP = 91;
const STEP_LEFT = 109;
const LINE_LEFT = 135;
const LINE_TOP = 130;
const LINE_WIDTH = 156;
const ACTIVE_COLOR = '#142C4C';
const INACTIVE_COLOR = '#D1E2F7';

type BookingStepIndicatorProps = {
  currentStep: 1 | 2 | 3;
  previousStep?: 1 | 2 | 3;
  px: (value: number) => number;
  x: (value: number) => number;
  y: (value: number) => number;
};

export function BookingStepIndicator({
  currentStep,
  previousStep = currentStep,
  px,
  x,
  y,
}: BookingStepIndicatorProps) {
  const [progress] = useState(() => new Animated.Value(getProgressValue(previousStep)));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    progress.setValue(getProgressValue(previousStep));
    pulse.setValue(0);

    Animated.parallel([
      Animated.timing(progress, {
        duration: 360,
        toValue: getProgressValue(currentStep),
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(pulse, {
          duration: 150,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 170,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [currentStep, previousStep, progress, pulse]);

  const activeLineWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, px(LINE_WIDTH)],
  });
  const activeScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });

  return (
    <>
      <View style={[styles.line, { left: x(LINE_LEFT), top: y(LINE_TOP), width: px(LINE_WIDTH), height: px(2) }]} />
      <Animated.View
        style={[
          styles.activeLine,
          {
            left: x(LINE_LEFT),
            top: y(LINE_TOP),
            width: activeLineWidth,
            height: px(2),
          },
        ]}
      />

      {[1, 2, 3].map((step, index) => {
        const isCurrent = step === currentStep;
        const isComplete = step <= currentStep;

        return (
          <Animated.View
            key={step}
            style={[
              styles.circle,
              {
                left: x(STEP_LEFT + index * STEP_GAP),
                top: y(118),
                width: px(STEP_SIZE),
                height: px(STEP_SIZE),
                borderRadius: px(STEP_RADIUS),
                backgroundColor: isComplete ? ACTIVE_COLOR : INACTIVE_COLOR,
                transform: [{ scale: isCurrent ? activeScale : 1 }],
              },
            ]}>
            <Text
              style={[
                styles.text,
                {
                  color: isComplete ? '#ffffff' : ACTIVE_COLOR,
                  fontSize: px(15.6),
                  lineHeight: px(20),
                },
              ]}>
              {step}
            </Text>
          </Animated.View>
        );
      })}
    </>
  );
}

function getProgressValue(step: 1 | 2 | 3) {
  return (step - 1) / 2;
}

const styles = StyleSheet.create({
  activeLine: {
    backgroundColor: ACTIVE_COLOR,
    position: 'absolute',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  line: {
    backgroundColor: INACTIVE_COLOR,
    position: 'absolute',
  },
  text: {
    fontFamily: 'Jomolhari',
    includeFontPadding: false,
    textAlign: 'center',
  },
});
