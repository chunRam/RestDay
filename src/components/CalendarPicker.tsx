import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, shadows } from '../theme/theme';

interface CalendarPickerProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  minDate?: string; // YYYY-MM-DD, defaults to today
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getTodayKey(): string {
  const d = new Date();
  return formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let current = 1;

  // Fill weeks
  for (let w = 0; current <= daysInMonth; w++) {
    const week: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (w === 0 && d < firstDay) {
        week.push(null);
      } else if (current > daysInMonth) {
        week.push(null);
      } else {
        week.push(current);
        current++;
      }
    }
    weeks.push(week);
  }

  return weeks;
}

const MONTH_NAMES = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];

export default function CalendarPicker({ selectedDate, onSelectDate, minDate }: CalendarPickerProps) {
  const todayKey = getTodayKey();
  const effectiveMinDate = minDate ?? todayKey;

  // Parse selectedDate to initialise the viewed month
  const initialYear = parseInt(selectedDate.slice(0, 4), 10);
  const initialMonth = parseInt(selectedDate.slice(5, 7), 10) - 1;

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  const weeks = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  return (
    <View style={styles.card}>
      {/* Month header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goToPrevMonth} style={styles.arrowBtn} activeOpacity={0.6}>
          <Text style={styles.arrowText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{viewYear}년 {MONTH_NAMES[viewMonth]}</Text>
        <TouchableOpacity onPress={goToNextMonth} style={styles.arrowBtn} activeOpacity={0.6}>
          <Text style={styles.arrowText}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.weekRow}>
        {DAY_HEADERS.map((label, i) => (
          <View key={i} style={styles.dayHeaderCell}>
            <Text style={[styles.dayHeaderText, i === 0 && styles.sundayText]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Date grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, di) => {
            if (day === null) {
              return <View key={di} style={styles.dayCell} />;
            }

            const dateKey = formatDateKey(viewYear, viewMonth, day);
            const isSelected = dateKey === selectedDate;
            const isToday = dateKey === todayKey;
            const isDisabled = dateKey < effectiveMinDate;

            return (
              <View key={di} style={styles.dayCell}>
                <TouchableOpacity
                  disabled={isDisabled}
                  onPress={() => onSelectDate(dateKey)}
                  activeOpacity={0.7}
                  style={[
                    styles.dayBtn,
                    isToday && !isSelected && styles.todayBtn,
                    isSelected && styles.selectedBtn,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      di === 0 && styles.sundayText,
                      isDisabled && styles.disabledText,
                      isSelected && styles.selectedText,
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL_SIZE = 44;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeBg,
  },
  arrowText: {
    fontSize: 18,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayHeaderCell: {
    width: CELL_SIZE,
    alignItems: 'center',
    paddingBottom: 8,
  },
  dayHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtn: {
    width: CELL_SIZE - 4,
    height: CELL_SIZE - 4,
    borderRadius: (CELL_SIZE - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  sundayText: {
    color: '#FF3B30',
  },
  todayBtn: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  selectedBtn: {
    backgroundColor: colors.primaryAction,
    transform: [{ scale: 1.05 }],
  },
  selectedText: {
    color: colors.primaryActionText,
    fontWeight: '700',
  },
  disabledText: {
    color: colors.textSecondary,
    opacity: 0.3,
  },
});
