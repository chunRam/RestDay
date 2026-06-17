import { useState, useEffect } from 'react';
import * as Calendar from 'expo-calendar';

export function useCalendar() {
  const [events, setEvents] = useState<Calendar.ExpoCalendarEvent[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const { status } = await Calendar.requestCalendarPermissions();
      if (status === 'granted') {
        setHasPermission(true);
        await fetchHolidays();
      }
      setLoading(false);
    })();
  }, []);

  const fetchHolidays = async () => {
    try {
      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      // 필터링: 읽기 가능하고 기기에 동기화된 캘린더 (Samsung Calendar, Google Calendar 포함)
      const visibleCalendars = calendars.map(c => c.id);

      if (visibleCalendars.length > 0) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + 30); // 향후 30일 데이터 가져오기

        const allEvents = await Calendar.listEvents(visibleCalendars, startDate, endDate);
        
        // 종일 일정(allDay)이거나 제목에 '휴가', '연차', '휴일' 등이 포함된 일정 필터링
        const holidayEvents = allEvents.filter(event => {
          const title = event.title.toLowerCase();
          return event.allDay || title.includes('휴가') || title.includes('연차') || title.includes('휴일');
        });

        // 날짜순 정렬
        holidayEvents.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        setEvents(holidayEvents);
      }
    } catch (e) {
      console.warn("Failed to fetch calendars: ", e);
    }
  };

  return { events, hasPermission, loading, fetchHolidays };
}
