import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { authRouteStyles as styles } from '@/styles/auth-route.styles';
import { authColors } from '@/styles/auth-theme';

export function AuthTextField({ label, value, onChangeText, creating, disabled }: {
  label: string; value: string; onChangeText: (text: string) => void;
  creating: boolean; disabled: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const password = label.includes('Password');
  const email = label === 'Email';
  const placeholder = email ? 'you@example.com' : label === 'Username' ? 'Enter your username'
    : label === 'Confirm Password' ? 'Enter your password again'
    : password ? creating ? 'At least 6 characters' : 'Enter your password' : 'Email or username';
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputFocused, disabled && styles.disabled]}>
        <TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false}
          autoComplete={password ? creating ? 'new-password' : 'current-password' : email ? 'email' : 'username'}
          editable={!disabled} keyboardType={label.includes('Email') ? 'email-address' : 'default'}
          onChangeText={onChangeText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder} placeholderTextColor={authColors.placeholder} secureTextEntry={password && !visible}
          selectionColor={authColors.blue} style={styles.input} value={value} />
        {password ? <Pressable accessibilityRole="button" disabled={disabled}
          accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          accessibilityState={{ checked: visible, disabled }}
          onPress={() => setVisible((current) => !current)} style={styles.passwordToggle}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={authColors.muted}
            strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M2 12S5.6 5 12 5S22 12 22 12S18.4 19 12 19S2 12 2 12Z" />
            <Circle cx={12} cy={12} r={3} />
            {visible ? <Path d="M3 3L21 21" /> : null}
          </Svg>
        </Pressable> : null}
      </View>
    </View>
  );
}
