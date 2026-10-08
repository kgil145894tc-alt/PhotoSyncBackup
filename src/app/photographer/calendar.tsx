import { useBottomNavHeight } from '@/hooks/use-bottom-nav-height';
import { useClientNavScroll as useNavScroll } from '@/hooks/use-client-nav-scroll';
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { AdminBrandHeader } from "@/components/admin-brand-header";
import { useAdminCalendarMonth } from "@/hooks/use-admin-calendar";
import {
  addMonthsToMonthPrefix,
  buildCalendarGridDays,
  formatCalendarMonthLabel,
  getClampedDateInMonth,
  getMonthPrefix,
} from "@/services/calendar";
import { getStudioDateTime } from '@/services/calendar-date-guards';
import { photographerStyles as styles } from "@/styles/photographer.styles";
import { type CalendarDaySummary } from "@/types/calendar";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function PhotographerCalendarScreen() {
  const navHeight = useBottomNavHeight('admin');
  const navScroll = useNavScroll();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const stackPickers = width / fontScale < 300;
  const [{ calendarMonth, selectedDate }, setSelection] = useState(() => {
    const date = getStudioDateTime().date;
    return { calendarMonth: getMonthPrefix(date), selectedDate: date };
  });
  const [openPicker, setOpenPicker] = useState<'month' | 'year' | null>(null);
  const { items: daySummaries, error, isLoading, isRefreshing, refresh } = useAdminCalendarMonth(calendarMonth);
  const bottomPadding = navHeight + insets.bottom + 24;
  const calendarDays = useMemo(
    () => buildCalendarGridDays(calendarMonth, true),
    [calendarMonth],
  );
  const summariesByDate = useMemo(() => {
    const map = new Map<string, CalendarDaySummary>();

    for (const summary of daySummaries) {
      map.set(summary.date, summary);
    }

    return map;
  }, [daySummaries]);

  function changeMonth(monthOffset: number) {
    setOpenPicker(null);
    setSelection((current) => {
      const nextMonth = addMonthsToMonthPrefix(current.calendarMonth, monthOffset);
      return {
        calendarMonth: nextMonth,
        selectedDate: getClampedDateInMonth(nextMonth, Number(current.selectedDate.slice(-2))),
      };
    });
  }

  function selectCalendarMonth(nextMonth: string) {
    setSelection((current) => ({
      calendarMonth: nextMonth,
      selectedDate: getClampedDateInMonth(nextMonth, Number(current.selectedDate.slice(-2))),
    }));
    setOpenPicker(null);
  }

  const pickerOptions = openPicker === 'month'
    ? months.map((label, index) => ({ label, value: `${getCalendarYear(calendarMonth)}-${String(index + 1).padStart(2, '0')}` }))
    : Array.from({ length: 21 }, (_, index) => {
      const year = Number(getCalendarYear(calendarMonth)) - 10 + index;
      return { label: String(year), value: `${year}-${calendarMonth.slice(5, 7)}` };
    });

  return (
    <View style={[styles.container, styles.adminCurvedHeaderScreen]}>
      <StatusBar style="light" />
      <AdminBrandHeader
        textureSource={require("@/assets/images/admin-calendar-banner.png")}
        topInset={insets.top}
      />
      <View style={styles.adminCalendarSurface}>
        <ScrollView
          {...navScroll}
          alwaysBounceVertical
          contentContainerStyle={[
            styles.adminCalendarContent,
            { paddingBottom: bottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { void refresh(); }} />}
        >
          <View style={styles.calendarHeaderRow}>
            <View>
              <Text style={styles.adminPageTitle}>Calendar</Text>
              <Text style={styles.adminPageSubtitle}>Manage your schedule.</Text>
            </View>
          </View>

          {isLoading || error ? (
            <Text accessibilityLiveRegion="polite" style={styles.adminPageSubtitle}>
              {error ?? 'Loading schedule...'}
            </Text>
          ) : null}

          <View style={styles.calendarMonthCard}>
            <View style={styles.calendarMonthHeader}>
              <Pressable
                accessibilityLabel="Previous month"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => changeMonth(-1)}
                style={styles.calendarArrowButton}
              >
                <ChevronLeft />
              </Pressable>
              <View style={[styles.calendarPickerGroup, stackPickers && { flexDirection: 'column' }]}>
                <Pressable
                  accessibilityLabel="Select month"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openPicker === 'month' }}
                  hitSlop={5}
                  onPress={() => setOpenPicker((current) => current === 'month' ? null : 'month')}
                  style={styles.calendarPickerPill}
                >
                  <Text style={styles.calendarMonthText}>
                    {formatCalendarMonthLabel(calendarMonth, "short")}
                  </Text>
                  <ChevronDown />
                </Pressable>
                <Pressable
                  accessibilityLabel="Select year"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openPicker === 'year' }}
                  hitSlop={5}
                  onPress={() => setOpenPicker((current) => current === 'year' ? null : 'year')}
                  style={styles.calendarPickerPill}
                >
                  <Text style={styles.calendarMonthText}>
                    {getCalendarYear(calendarMonth)}
                  </Text>
                  <ChevronDown />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="Next month"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => changeMonth(1)}
                style={styles.calendarArrowButton}
              >
                <ChevronRight />
              </Pressable>
            </View>

            {openPicker ? (
              <>
              <Pressable
                accessibilityLabel="Close calendar dropdown"
                accessibilityRole="button"
                onPress={() => setOpenPicker(null)}
                style={{ position: 'absolute', top: 77, bottom: 0, left: 0, right: 0, zIndex: 1 }}
              />
              <View style={{
                position: 'absolute',
                top: 65,
                ...(openPicker === 'month' ? { left: 48 } : { right: 48 }),
                width: 160,
                padding: 8,
                backgroundColor: '#FFFFFF',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: 'rgba(76, 94, 118, 0.25)',
                zIndex: 2,
                elevation: 8,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18,
                shadowRadius: 8,
              }}>
                <Text style={styles.adminPageSubtitle}>Select {openPicker}</Text>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                  {pickerOptions.map((option) => (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: option.value === calendarMonth }}
                      onPress={() => selectCalendarMonth(option.value)}
                      style={({ pressed }) => ({
                        minHeight: 44,
                        justifyContent: 'center',
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: option.value === calendarMonth ? '#DCEAF8' : pressed ? '#F0F4F8' : '#FFFFFF',
                      })}
                    >
                      <Text style={styles.calendarMonthText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              </>
            ) : null}

            <View style={styles.calendarGrid}>
              <View style={styles.calendarWeekRow}>
              {weekDays.map((day) => (
                <Text key={day} style={styles.calendarWeekText}>
                  {day}
                </Text>
              ))}
              </View>
              {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIndex) => (
                <View key={weekIndex} style={styles.calendarWeekRow}>
                  {calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7).map((calendarDay, index) => {
                    const date = calendarDay.date;
                    const isSelected = date === selectedDate;
                    const daySummary = calendarDay.isCurrentMonth
                      ? summariesByDate.get(calendarDay.date)
                      : undefined;
                    const isUnavailable = Boolean(daySummary?.hasUnavailable);
                    const isAvailable = Boolean(daySummary?.hasAvailable);
                    const isBooked = Boolean(daySummary?.hasBooked);

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${calendarDay.date}${isAvailable ? ', available slots' : ''}${isBooked ? ', booked sessions' : ''}${isUnavailable ? ', unavailable' : ''}`}
                        accessibilityState={{ selected: isSelected, disabled: !calendarDay.isCurrentMonth }}
                        disabled={!calendarDay.isCurrentMonth}
                        key={`${calendarDay.date}-${index}`}
                        onPress={() => {
                          if (!calendarDay.isCurrentMonth) return;

                          setSelection((current) => ({ ...current, selectedDate: date }));
                        }}
                        style={[
                          styles.calendarDayCell,
                          isSelected && styles.selectedCalendarDay,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            !calendarDay.isCurrentMonth &&
                              styles.outsideCalendarDayText,
                            calendarDay.isCurrentMonth &&
                              isAvailable &&
                              styles.availableDayText,
                            calendarDay.isCurrentMonth &&
                              isBooked &&
                              styles.bookedDayText,
                            calendarDay.isCurrentMonth &&
                              isUnavailable &&
                              styles.unavailableDayText,
                            isSelected && styles.selectedDayText,
                          ]}
                        >
                          {calendarDay.day}
                        </Text>
                        {calendarDay.isCurrentMonth &&
                        (isAvailable || isBooked || isUnavailable) ? (
                          <View style={styles.calendarDots}>
                            {isAvailable && (
                              <View
                                style={[styles.calendarDot, styles.availableDot]}
                              />
                            )}
                            {isBooked && (
                              <View style={[styles.calendarDot, styles.bookedDot]} />
                            )}
                            {isUnavailable && (
                              <View
                                style={[styles.calendarDot, styles.unavailableDot]}
                              />
                            )}
                          </View>
                        ) : (
                          <View style={styles.calendarDots} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.calendarLegendRow}>
            <LegendItem
              color="#19B18A"
              label="Available"
              sublabel="Open for booking"
            />
            <LegendItem
              color="#3B70D5"
              label="Booked"
              sublabel="With appointment"
            />
            <LegendItem
              color="#F04B5E"
              label="Unavailable"
              sublabel="Not available"
            />
          </View>

          <Pressable
            accessibilityLabel="View time slots"
            accessibilityRole="button"
            onPress={() =>
              router.push(
                `/photographer/calendar-slots?date=${selectedDate}` as never,
              )
            }
            style={({ pressed }) => [
              styles.viewTimeSlotsButton,
              pressed && { opacity: 0.86 },
            ]}
          >
            <Text style={styles.viewTimeSlotsText}>View Time Slots</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

function getCalendarYear(monthPrefix: string) {
  return monthPrefix.slice(0, 4);
}

function LegendItem({
  color,
  label,
  sublabel,
}: {
  color: string;
  label: string;
  sublabel: string;
}) {
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
      <Path
        d="M15 5L8 12L15 19"
        stroke="#4C77A5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.6}
      />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5L16 12L9 19"
        stroke="#4C77A5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.6}
      />
    </Svg>
  );
}

function ChevronDown() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path
        d="M4 6L8 10L12 6"
        stroke="#142C4C"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
      />
    </Svg>
  );
}
