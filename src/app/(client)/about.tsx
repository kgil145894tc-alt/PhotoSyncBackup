import { Image, ImageBackground } from 'expo-image';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { bottomNavMetrics } from '@/styles/navigation.styles';
import { aboutStyles as styles } from '@/styles/about.styles';

type ServiceCardProps = {
  height?: number;
  image: number;
  label: string;
};

type ContactCardProps = {
  children: React.ReactNode;
  lines: string[];
  onPress?: () => void;
  title: string;
};

type WhyChooseRowProps = {
  children: React.ReactNode;
  description: string;
  title: string;
};

const services = [
  { image: require('@/assets/images/about/about-portraits.png'), label: 'Portraits' },
  { image: require('@/assets/images/about/about-weddings.png'), label: 'Weddings' },
  { height: 220, image: require('@/assets/images/about/about-events.png'), label: 'Events' },
  { image: require('@/assets/images/about/about-graduation.png'), label: 'Graduation' },
  { image: require('@/assets/images/about/about-family.png'), label: 'Family' },
  { image: require('@/assets/images/about/about-videography.png'), label: 'Videography' },
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 40;

  return (
    <View style={styles.root}>
      <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.topBarTitle}>PhotoSync</Text>
          <Image contentFit="contain" source={require('@/assets/images/about/about-logo.png')} style={styles.topBarLogo} />
        </View>

        <ImageBackground contentFit="cover" source={require('@/assets/images/about/about-hero.png')} style={styles.hero}>
          <View style={styles.heroOverlay}>
            <Text style={styles.heroEyebrow}>ABOUT US</Text>
            <Text style={styles.heroTitle}>
              Behind every <Text style={styles.heroScript}>frame</Text>
            </Text>
            <Text style={styles.heroTitle}>
              is a <Text style={[styles.heroScript, styles.heroScriptSmall]}>story</Text>.
            </Text>
            <Text style={styles.heroTagline}>PEOPLE   MOMENTS   MEMORIES</Text>
          </View>
        </ImageBackground>

        <View style={styles.sheet}>
          <View style={styles.quoteCard}>
            <Text style={styles.quoteText}>
              &quot;We believe that photography is more than just taking pictures - it&apos;s about capturing real moments,
              real people, and real stories.&quot;
            </Text>
          </View>

          <Text style={styles.eyebrow}>OUR STORY</Text>
          <Text style={styles.sectionTitle}>A Story Built on Passion</Text>
          <Text style={styles.bodyText}>
            PhotoSync was built on a simple belief - that every moment is worth remembering.
          </Text>
          <Image contentFit="cover" source={require('@/assets/images/about/about-story-main.png')} style={styles.storyImage} />
          <Text style={styles.bodyText}>
            What started as a love for photography has grown into a studio dedicated to capturing authentic
            stories through timeless images. We value people, creativity, and the moments that matter, and we
            continue to strive to make photography a meaningful experience for everyone.
          </Text>
          <Image
            contentFit="cover"
            source={require('@/assets/images/about/about-story-secondary.png')}
            style={[styles.storyImage, styles.storyImageTall]}
          />
          <Text style={styles.scriptQuote}>Real People{'\n'}Real Moments{'\n'}Real Stories</Text>

          <Text style={[styles.eyebrow, styles.centerText]}>OUR SERVICES</Text>
          <Text style={[styles.sectionTitle, styles.centerText]}>What We Do</Text>
          <Text style={[styles.bodyText, styles.centerText]}>
            Turning moments into lasting memories. We provide photography services designed for different
            occasions and milestones. From personal portraits to important celebrations, our goal is to capture
            every moment naturally and beautifully.
          </Text>

          {services.map((service) => (
            <ServiceCard height={service.height} image={service.image} key={service.label} label={service.label} />
          ))}

          <Text style={styles.moreThanPhotos}>MORE THAN JUST PHOTOS</Text>
          <Text style={styles.scriptQuoteCenter}>We capture the moments you&apos;ll cherish forever.</Text>
          <Image contentFit="cover" source={require('@/assets/images/about/about-thank-you.png')} style={styles.wideImage} />
        </View>

        <View style={styles.lowerSection}>
          <Text style={[styles.sectionTitleLarge, styles.centerText]}>Why Choose Us</Text>

          <WhyChooseRow
            description="Quality photography for every session."
            title="Professional Service">
            <HeadsetIcon />
          </WhyChooseRow>
          <WhyChooseRow
            description="Photos that preserve meaningful experiences."
            title="Memorable Moments">
            <BookIcon />
          </WhyChooseRow>
          <WhyChooseRow
            description="Sessions suited to each client and occasion."
            title="Personalized Experience">
            <AlbumsIcon />
          </WhyChooseRow>

          <Image contentFit="cover" source={require('@/assets/images/about/about-studio-visit.png')} style={styles.wideImage} />

          <Text style={[styles.eyebrow, styles.centerText, { marginTop: 40 }]}>CONTACT US</Text>
          <Text style={[styles.sectionTitleLarge, styles.centerText]}>We&apos;d love to hear from you!</Text>
          <Text style={[styles.bodyText, styles.centerText]}>
            Have a question, a special request, or want to book a session?{'\n\n'}We&apos;re here to help.
          </Text>

          <View style={styles.contactCardsWrap}>
            <ContactCard
              lines={["We're just a call away.", '+63 912 345 6789']}
              onPress={() => Linking.openURL('tel:+639123456789')}
              title="Call Us">
              <PhoneIcon />
            </ContactCard>
            <ContactCard
              lines={['Send us a message anytime.', 'photosync.studio@gmail.com']}
              onPress={() => Linking.openURL('mailto:photosync.studio@gmail.com')}
              title="Email Us">
              <MailIcon />
            </ContactCard>
            <ContactCard
              lines={['Stay updated with our latest works.', '@photosync.studio']}
              title="Follow Us">
              <ShareIcon />
            </ContactCard>
            <ContactCard
              lines={["We'd be happy to meet you in person.", '123 Lens Street', 'Tagum City, Davao del Norte']}
              title="Visit Our Studio">
              <LocationIcon />
            </ContactCard>
            <ContactCard
              lines={['Mon - Sat: 8:00 AM - 6:00 PM', 'Sunday: By Appointment']}
              title="Business Hours">
              <TimeIcon />
            </ContactCard>
          </View>

          <Text style={styles.footerText}>
            PhotoSync Photography Studio{'\n'}Lacor Building, Doors 1-3, Sobrecary St. Brgy. Magugpo Poblacion,
            Tagum City.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ServiceCard({ height = 300, image, label }: ServiceCardProps) {
  return (
    <View style={[styles.serviceCard, { height }]}>
      <Image contentFit="cover" source={image} style={styles.serviceImage} />
      <Text style={styles.serviceLabel}>{label}</Text>
    </View>
  );
}

function WhyChooseRow({ children, description, title }: WhyChooseRowProps) {
  return (
    <View style={styles.whyRow}>
      <View style={styles.iconCircle}>{children}</View>
      <View style={styles.whyTextWrap}>
        <Text style={styles.whyTitle}>{title}</Text>
        <Text style={styles.whyDescription}>{description}</Text>
      </View>
    </View>
  );
}

function ContactCard({ children, lines, onPress, title }: ContactCardProps) {
  const content = (
    <>
      <View style={[styles.iconCircle, styles.contactIconCircle]}>{children}</View>
      <View style={styles.contactTextWrap}>
        <Text style={styles.contactTitle}>{title}</Text>
        {lines.map((line) => (
          <Text key={line} style={styles.contactLine}>{line}</Text>
        ))}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.contactCard}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.contactCard}>{content}</View>;
}

function HeadsetIcon() {
  return (
    <Svg width={31} height={31} viewBox="0 0 31 31" fill="none">
      <Path d="M5.5 17.1V14.8C5.5 9.3 10 4.8 15.5 4.8S25.5 9.3 25.5 14.8V17.1" stroke="#142C4C" strokeLinecap="round" strokeWidth={2.2} />
      <Rect x={3.8} y={16.5} width={5.2} height={8.2} rx={2.2} stroke="#142C4C" strokeWidth={2.2} />
      <Rect x={22} y={16.5} width={5.2} height={8.2} rx={2.2} stroke="#142C4C" strokeWidth={2.2} />
      <Path d="M21.8 24.4C20.7 26.1 18.7 27.2 16.2 27.2H14.1" stroke="#142C4C" strokeLinecap="round" strokeWidth={2.2} />
    </Svg>
  );
}

function BookIcon() {
  return (
    <Svg width={31} height={31} viewBox="0 0 31 31" fill="none">
      <Path d="M6.2 6.2H13.6C14.7 6.2 15.5 7 15.5 8.1V25.2C15 24.3 14.1 23.8 13 23.8H6.2V6.2Z" stroke="#142C4C" strokeLinejoin="round" strokeWidth={2.2} />
      <Path d="M24.8 6.2H17.4C16.3 6.2 15.5 7 15.5 8.1V25.2C16 24.3 16.9 23.8 18 23.8H24.8V6.2Z" stroke="#142C4C" strokeLinejoin="round" strokeWidth={2.2} />
      <Path d="M9.2 11.4H12.3M18.7 11.4H21.8M9.2 16H12.3M18.7 16H21.8" stroke="#142C4C" strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

function AlbumsIcon() {
  return (
    <Svg width={31} height={31} viewBox="0 0 31 31" fill="none">
      <Rect x={6.5} y={7} width={18} height={18} rx={2.5} stroke="#142C4C" strokeWidth={2.2} />
      <Path d="M10 6V4.8H26.2V21" stroke="#142C4C" strokeLinecap="round" strokeWidth={2.2} />
      <Circle cx={13} cy={13.2} r={2.1} stroke="#142C4C" strokeWidth={2} />
      <Path d="M8.2 22L13.5 17.4L16.8 20.3L19.1 18.2L22.8 22" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </Svg>
  );
}

function PhoneIcon() {
  return (
    <Svg width={27} height={27} viewBox="0 0 27 27" fill="none">
      <Path d="M7.2 4.8L10.3 4.1L12.5 9.3L10.4 11C11.8 13.8 13.8 15.8 16.6 17.1L18.3 15L23.4 17.2L22.8 20.4C22.5 22 21 23 19.4 22.6C11.8 20.8 6.4 15.4 4.5 7.9C4.1 6.3 5.2 5.1 7.2 4.8Z" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg width={27} height={27} viewBox="0 0 27 27" fill="none">
      <Rect x={4.5} y={7} width={18} height={13} rx={2.2} stroke="#142C4C" strokeWidth={2.2} />
      <Path d="M5.5 8.4L13.5 14.1L21.5 8.4" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}

function ShareIcon() {
  return (
    <Svg width={27} height={27} viewBox="0 0 27 27" fill="none">
      <Circle cx={19.6} cy={7.6} r={3} stroke="#142C4C" strokeWidth={2.2} />
      <Circle cx={7.4} cy={13.7} r={3} stroke="#142C4C" strokeWidth={2.2} />
      <Circle cx={19.6} cy={20} r={3} stroke="#142C4C" strokeWidth={2.2} />
      <Path d="M10.2 12.3L16.8 9M10.2 15L16.8 18.5" stroke="#142C4C" strokeLinecap="round" strokeWidth={2.2} />
    </Svg>
  );
}

function LocationIcon() {
  return (
    <Svg width={27} height={27} viewBox="0 0 27 27" fill="none">
      <Path d="M13.5 23.3C13.5 23.3 21 16.4 21 10.9C21 6.8 17.6 3.5 13.5 3.5S6 6.8 6 10.9C6 16.4 13.5 23.3 13.5 23.3Z" stroke="#142C4C" strokeLinejoin="round" strokeWidth={2.2} />
      <Circle cx={13.5} cy={10.9} r={2.8} stroke="#142C4C" strokeWidth={2.2} />
    </Svg>
  );
}

function TimeIcon() {
  return (
    <Svg width={27} height={27} viewBox="0 0 27 27" fill="none">
      <Circle cx={13.5} cy={13.5} r={9} stroke="#142C4C" strokeWidth={2.2} />
      <Path d="M13.5 8.3V14L17.3 16.2" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
    </Svg>
  );
}
