import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { signInWithPhotoSync, signUpClientAccount } from '@/services/auth';
import { authRouteStyles as styles } from '@/styles/auth-route.styles';

const FIGMA_WIDTH = 412;
const FIGMA_HEIGHT = 918;

type AuthRouteVariant = 'create' | 'login';

type AuthRouteScreenProps = {
  variant: AuthRouteVariant;
};

const screenConfig = {
  create: {
    actionLabel: 'CREATE ACCOUNT',
    fields: ['Username', 'Email', 'Password', 'Confirm Password'],
    footerLabel: 'Already have an account? Login',
    footerRoute: '/login',
    icon: 'create',
    logo: { height: 110.833, left: 139, top: 94, width: 133 },
    panel: { height: 576, left: 29, top: 284, width: 354 },
    tagline: { fontSize: 23.368, height: 37, left: 97, lineHeight: 37, top: 247, width: 231.088 },
    wordmark: { fontSize: 62.81, height: 36.639, left: 125, lineHeight: 47, top: 187, width: 176 },
  },
  login: {
    actionLabel: 'LOGIN',
    fields: ['Email / Username', 'Password'],
    footerLabel: "Don’t have an account? Create One",
    footerRoute: '/create-account',
    icon: 'login',
    logo: { height: 147, left: 118, top: 90, width: 176.4 },
    panel: { height: 420, left: 29, top: 374, width: 354 },
    tagline: { fontSize: 32.211, height: 51, left: 54, lineHeight: 51, top: 299, width: 318.526 },
    wordmark: { fontSize: 85.714, height: 50, left: 100, lineHeight: 64, top: 221, width: 240.179 },
  },
} as const;

export function AuthRouteScreen({ variant }: AuthRouteScreenProps) {
  const { height, width } = useWindowDimensions();
  const [authMessage, setAuthMessage] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const config = screenConfig[variant];
  const scale = Math.min(width / FIGMA_WIDTH, height / FIGMA_HEIGHT);
  const frameWidth = FIGMA_WIDTH * scale;
  const frameHeight = FIGMA_HEIGHT * scale;
  const left = (width - frameWidth) / 2;
  const top = (height - frameHeight) / 2;

  const px = (value: number) => value * scale;
  const x = (value: number) => left + px(value);
  const y = (value: number) => top + px(value);
  const fieldTopStart = variant === 'create' ? 369 : 469;
  const buttonTop = variant === 'create' ? 744 : 663;
  const footerTop = variant === 'create' ? 810 : 743;
  const footerLeft = variant === 'create' ? 89 : 72;
  const footerWidth = variant === 'create' ? 237 : 268;
  const showAuthMessage = (message: string) => {
    setAuthMessage(message);
    Alert.alert('PhotoSync', message);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        contentFit="cover"
        source={require('@/assets/images/splash-background.png')}
        style={StyleSheet.absoluteFill}
      />

      <Image
        contentFit="contain"
        source={require('@/assets/images/photosync-logo.png')}
        style={[
          styles.logo,
          {
            height: px(config.logo.height),
            left: x(config.logo.left),
            top: y(config.logo.top),
            width: px(config.logo.width),
          },
        ]}
      />

      <Text
        style={[
          styles.wordmark,
          {
            fontSize: px(config.wordmark.fontSize),
            height: px(config.wordmark.height),
            left: x(config.wordmark.left),
            lineHeight: px(config.wordmark.lineHeight),
            top: y(config.wordmark.top),
            width: px(config.wordmark.width),
          },
        ]}>
        Photo<Text style={styles.wordmarkAccent}>Sync</Text>
      </Text>

      <View
        style={[
          styles.tagline,
          {
            height: px(config.tagline.height),
            left: x(config.tagline.left),
            top: y(config.tagline.top),
            width: px(config.tagline.width),
          },
        ]}>
        <Text style={[styles.taglineText, { fontSize: px(config.tagline.fontSize), lineHeight: px(config.tagline.lineHeight) }]}>Capture</Text>
        <View style={[styles.dot, { width: px(4), height: px(4), borderRadius: px(2) }]} />
        <Text style={[styles.taglineText, { fontSize: px(config.tagline.fontSize), lineHeight: px(config.tagline.lineHeight) }]}>Book</Text>
        <View style={[styles.dot, { width: px(4), height: px(4), borderRadius: px(2) }]} />
        <Text style={[styles.taglineText, { fontSize: px(config.tagline.fontSize), lineHeight: px(config.tagline.lineHeight) }]}>Relive</Text>
      </View>

      <View
        style={[
          styles.panel,
          {
            borderRadius: px(20),
            height: px(config.panel.height),
            left: x(config.panel.left),
            top: y(config.panel.top),
            width: px(config.panel.width),
          },
        ]}
      />

      <View
        style={[
          styles.panelIcon,
          {
            height: px(variant === 'create' ? 57 : 45),
            left: x(variant === 'create' ? 180 : 185),
            top: y(variant === 'create' ? 297 : 406),
            width: px(variant === 'create' ? 57 : 45),
          },
        ]}>
        <AuthPanelIcon size={px(variant === 'create' ? 57 : 45)} type={config.icon} />
      </View>

      {config.fields.map((field, index) => {
        const fieldTop = fieldTopStart + index * 90;

        return (
          <View key={field}>
            <Text
              style={[
                styles.label,
                {
                  fontSize: px(20),
                  height: px(28),
                  left: x(63),
                  lineHeight: px(28),
                  top: y(fieldTop),
                  width: px(field === 'Confirm Password' ? 209 : field === 'Email / Username' ? 193 : 117),
                },
              ]}>
              {field}
            </Text>
            <TextInput
              autoCapitalize="none"
              keyboardType={field.includes('Email') ? 'email-address' : 'default'}
              onChangeText={(text) => setFieldValues((values) => ({ ...values, [field]: text }))}
              secureTextEntry={field.includes('Password')}
              style={[
                styles.input,
                {
                  borderRadius: px(10),
                  fontSize: px(18),
                  height: px(46),
                  left: x(60),
                  paddingHorizontal: px(12),
                  top: y(fieldTop + 28),
                  width: px(292),
                },
              ]}
              textContentType={field.includes('Password') ? 'password' : field.includes('Email') ? 'emailAddress' : 'username'}
              value={fieldValues[field] ?? ''}
            />
          </View>
        );
      })}

      {authMessage && (
        <Text
          style={[
            styles.authMessageText,
            {
              fontSize: px(12),
              left: x(63),
              lineHeight: px(16),
              top: y(variant === 'create' ? 710 : 610),
              width: px(289),
            },
          ]}>
          {authMessage}
        </Text>
      )}

      <Pressable
        accessibilityLabel={config.actionLabel}
        accessibilityRole="button"
        disabled={isSubmitting}
        onPress={async () => {
          setAuthMessage('');
          setIsSubmitting(true);

          try {
            if (variant === 'create' && fieldValues.Password !== fieldValues['Confirm Password']) {
              showAuthMessage('Passwords do not match.');
              return;
            }

            const result =
              variant === 'login'
                ? await signInWithPhotoSync(fieldValues['Email / Username'] ?? '', fieldValues.Password ?? '')
                : await signUpClientAccount({
                    email: fieldValues.Email ?? '',
                    fullName: fieldValues.Username ?? '',
                    password: fieldValues.Password ?? '',
                  });

            if (result.message) {
              showAuthMessage(result.message);
            }

            if (result.route) {
              router.replace(result.route as never);
            }
          } catch (error) {
            showAuthMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
          } finally {
            setIsSubmitting(false);
          }
        }}
        style={({ pressed }) => [
          styles.actionButton,
          {
            borderRadius: px(10),
            height: px(50),
            left: x(63),
            opacity: pressed || isSubmitting ? 0.82 : 1,
            top: y(buttonTop),
            width: px(289),
          },
        ]}>
        <Text style={[styles.actionButtonText, { fontSize: px(22), lineHeight: px(29) }]}>
          {isSubmitting ? 'PLEASE WAIT...' : config.actionLabel}
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel={config.footerLabel}
        accessibilityRole="button"
        onPress={() => router.replace(config.footerRoute)}
        style={({ pressed }) => [
          styles.footerButton,
          {
            height: px(28),
            left: x(footerLeft),
            opacity: pressed ? 0.72 : 1,
            top: y(footerTop),
            width: px(footerWidth),
          },
        ]}>
        <Text style={[styles.footerButtonText, { fontSize: px(15), lineHeight: px(21) }]}>
          {config.footerLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function AuthPanelIcon({ size, type }: { size: number; type: 'create' | 'login' }) {
  if (type === 'create') {
    return (
      <Svg width={size} height={size} viewBox="0 0 57 57" fill="none">
        <Path
          d="M4.81886 32.4187C10.6545 39.7174 17.2826 46.3455 24.5812 52.1811C26.7045 53.8555 30.2955 53.8555 32.4187 52.1811C39.7174 46.3455 46.3455 39.7174 52.1811 32.4187C53.8555 30.2955 53.8555 26.7045 52.1811 24.5812C46.3455 17.2826 39.7174 10.6545 32.4187 4.81886C30.2955 3.14449 26.7045 3.14449 24.5812 4.81886C17.2826 10.6545 10.6545 17.2826 4.81886 24.5812C3.14449 26.7045 3.14449 30.2955 4.81886 32.4187Z"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.1875}
        />
        <Path
          d="M13.3024 15.01L23.3095 20.7872L36.6677 28.5M36.6677 28.5L23.3095 36.2128M36.6677 28.5L49.3561 21.1743M23.3095 20.7872V36.2128M23.3095 36.2128V51.224"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.1875}
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 45 45" fill="none">
      <Path
        d="M31.5 22.5L18 11.25V18H2.25V27H18V33.75L31.5 22.5ZM38.25 38.25H20.25V42.75H38.25C40.725 42.75 42.75 40.725 42.75 38.25V6.75C42.75 4.275 40.725 2.25 38.25 2.25H20.25V6.75H38.25V38.25Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}
