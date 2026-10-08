import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { MobilePage } from '@/components/mobile-page';
import { MotionPressable } from '@/components/motion-pressable';
import { getSelectedPackage } from '@/services/booking-draft';
import { responsiveStyles as styles } from '@/styles/responsive.styles';
export default function BookScreen() {
  const selectedPackage = getSelectedPackage();
  return (
    <MobilePage title="PhotoSync">
      <Image
        source={selectedPackage.image}
        contentFit="cover"
        style={styles.fullImage}
      />
      {selectedPackage.badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{selectedPackage.badge}</Text>
        </View>
      )}
      <Text style={styles.title}>{selectedPackage.name}</Text>
      <Text style={styles.text}>Your moment, your story.</Text>
      <View style={styles.card}>
        <Text style={styles.heading}>Package inclusions</Text>
        {selectedPackage.inclusions.map((label, index) => (
          <Text key={index} style={styles.text}>
            • {label}
          </Text>
        ))}
        <Text style={styles.text}>
          Inclusions may vary. You can discuss custom requests after booking.
        </Text>
      </View>
      <Text style={styles.price}>{selectedPackage.price}</Text>
      <MotionPressable
        accessibilityRole="button"
        onPress={() => router.push('/book/schedule')}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Book Now</Text>
      </MotionPressable>
    </MobilePage>
  );
}
