import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  addMonthsToMonthPrefix,
  buildCalendarGridDays,
  formatCalendarMonthLabel,
  getCalendarDaySummaries,
  getClampedDateInMonth,
  getCurrentDateString,
  getMonthPrefix,
} from '@/services/calendar';
import { bottomNavMetrics } from '@/styles/navigation.styles';
import { photographerStyles as styles } from '@/styles/photographer.styles';
import { type CalendarDaySummary } from '@/types/calendar';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const initialSelectedDate = getCurrentDateString();

export default function PhotographerCalendarScreen() {
  const insets = useSafeAreaInsets();
  const [calendarMonth, setCalendarMonth] = useState(getMonthPrefix(initialSelectedDate));
  const [daySummaries, setDaySummaries] = useState<CalendarDaySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const bottomPadding = bottomNavMetrics.height + insets.bottom + 24;
  const calendarDays = useMemo(() => buildCalendarGridDays(calendarMonth, true), [calendarMonth]);
  const summariesByDate = useMemo(() => {
    const map = new Map<string, CalendarDaySummary>();

    for (const summary of daySummaries) {
      map.set(summary.date, summary);
    }

    return map;
  }, [daySummaries]);

  async function changeMonth(monthOffset: number) {
    const nextMonth = addMonthsToMonthPrefix(calendarMonth, monthOffset);
    const preferredDay = Number(selectedDate.slice(-2));
    const nextSelectedDate = getClampedDateInMonth(nextMonth, preferredDay);
    const summaries = await getCalendarDaySummaries(nextMonth);

    setCalendarMonth(nextMonth);
    setSelectedDate(nextSelectedDate);
    setDaySummaries(summaries);
  }

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      getCalendarDaySummaries(calendarMonth).then((summaries) => {
        if (isMounted) {
          setDaySummaries(summaries);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [calendarMonth]),
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.adminCalendarHero, { paddingTop: insets.top }]}>
        <Image
          contentFit="cover"
          source={require('@/assets/images/admin-calendar-banner.png')}
          style={styles.adminCalendarHeroTexture}
        />
        <View style={styles.adminCalendarBrand}>
          <Text style={styles.adminCalendarBrandText}>PhotoSync</Text>
          <Image
            contentFit="contain"
            source={require('@/assets/images/admin-calendar-logo.png')}
            style={styles.adminCalendarBrandLogo}
          />
        </View>
      </View>
      <Image
        contentFit="cover"
        source={require('@/assets/images/admin-calendar-background.png')}
        style={styles.adminCalendarBackground}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.adminCalendarContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.calendarHeaderRow}>
          <View>
            <Text style={styles.adminPageTitle}>Calendar</Text>
            <Text style={styles.adminPageSubtitle}>Manage your schedule.</Text>
          </View>
        </View>

        <View style={styles.calendarMonthCard}>
          <View style={styles.calendarMonthHeader}>
            <Pressable accessibilityLabel="Previous month" accessibilityRole="button" hitSlop={10} onPress={() => changeMonth(-1)} style={styles.calendarArrowButton}>
              <ChevronLeft />
            </Pressable>
            <View style={styles.calendarPickerGroup}>
              <View style={styles.calendarPickerPill}>
                <Text style={styles.calendarMonthText}>{formatCalendarMonthLabel(calendarMonth, 'short')}</Text>
                <ChevronDown />
              </View>
              <View style={styles.calendarPickerPill}>
                <Text style={styles.calendarMonthText}>{getCalendarYear(calendarMonth)}</Text>
                <ChevronDown />
              </View>
            </View>
            <Pressable accessibilityLabel="Next month" accessibilityRole="button" hitSlop={10} onPress={() => changeMonth(1)} style={styles.calendarArrowButton}>
              <ChevronRight />
            </Pressable>
          </View>

          <View style={styles.calendarGrid}>
            {weekDays.map((day) => (
              <Text key={day} style={styles.calendarWeekText}>{day}</Text>
            ))}
            {calendarDays.map((calendarDay, index) => {
              const date = calendarDay.date;
              const isSelected = date === selectedDate;
              const daySummary = calendarDay.isCurrentMonth ? summariesByDate.get(calendarDay.date) : undefined;
              const isUnavailable = Boolean(daySummary?.hasUnavailable);
              const isAvailable = Boolean(daySummary?.hasAvailable);
              const isBooked = Boolean(daySummary?.hasBooked);

              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={!calendarDay.isCurrentMonth}
                  key={`${calendarDay.date}-${index}`}
                  onPress={async () => {
                    if (!calendarDay.isCurrentMonth) return;

                    setSelectedDate(date);
                  }}
                  style={[styles.calendarDayCell, isSelected && styles.selectedCalendarDay]}>
                  <Text
                    style={[
                      styles.calendarDayText,
                      !calendarDay.isCurrentMonth && styles.outsideCalendarDayText,
                      calendarDay.isCurrentMonth && isAvailable && styles.availableDayText,
                      calendarDay.isCurrentMonth && isBooked && styles.bookedDayText,
                      calendarDay.isCurrentMonth && isUnavailable && styles.unavailableDayText,
                      isSelected && styles.selectedDayText,
                    ]}>
                    {calendarDay.day}
                  </Text>
                  {calendarDay.isCurrentMonth && (isAvailable || isBooked || isUnavailable) ? (
                    <View style={styles.calendarDots}>
                      {isAvailable && <View style={[styles.calendarDot, styles.availableDot]} />}
                      {isBooked && <View style={[styles.calendarDot, styles.bookedDot]} />}
                      {isUnavailable && <View style={[styles.calendarDot, styles.unavailableDot]} />}
                    </View>
                  ) : (
                    <View style={styles.calendarDots} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.calendarLegendRow}>
          <LegendItem color="#19B18A" label="Available" sublabel="Open for booking" />
          <LegendItem color="#3B70D5" label="Booked" sublabel="With appointment" />
          <LegendItem color="#F04B5E" label="Unavailable" sublabel="Not available" />
        </View>

        <Pressable
          accessibilityLabel="View time slots"
          accessibilityRole="button"
          onPress={() => router.push(`/photographer/calendar-slots?date=${selectedDate}` as never)}
          style={({ pressed }) => [styles.viewTimeSlotsButton, pressed && { opacity: 0.86 }]}>
          <Text style={styles.viewTimeSlotsText}>View Time Slots</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function getCalendarYear(monthPrefix: string) {
  return monthPrefix.slice(0, 4);
}

function LegendItem({ color, label, sublabel }: { color: string; label: string; sublabel: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View style={styles.legendCopy}>
        <Text style={styles.legendText}>{label}</Text>
        <Text style={styles.legendSubtext}>{sublabel}</Text>
      </View>
    </View>
  );
}

function ChevronLeft() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5L8 12L15 19" stroke="#4C77A5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5L16 12L9 19" stroke="#4C77A5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
    </Svg>
  );
}

function ChevronDown() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d="M4 6L8 10L12 6" stroke="#142C4C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} />
    </Svg>
  );
}
