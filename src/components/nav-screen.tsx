import { Text, View } from 'react-native';

import { navScreenStyles as styles } from '@/styles/navigation.styles';

type NavScreenProps = {
  title: string;
};

export function NavScreen({ title }: NavScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}
