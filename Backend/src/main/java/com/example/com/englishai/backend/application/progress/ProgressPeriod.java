package com.example.com.englishai.backend.application.progress;

import java.time.*;

public enum ProgressPeriod {
    ALL_TIME, LAST_7_DAYS, CURRENT_MONTH, LAST_30_DAYS;

    public Bounds bounds(Clock clock, ZoneId zone) {
        Instant now = clock.instant();
        if (this == ALL_TIME) return new Bounds(null, now, null, null);
        ZonedDateTime end = now.atZone(zone);
        ZonedDateTime start;
        ZonedDateTime previousStart;
        ZonedDateTime previousEnd;
        if (this == CURRENT_MONTH) {
            start = end.withDayOfMonth(1).toLocalDate().atStartOfDay(zone);
            YearMonth previous = YearMonth.from(start).minusMonths(1);
            int day = Math.min(end.getDayOfMonth(), previous.lengthOfMonth());
            previousStart = previous.atDay(1).atStartOfDay(zone);
            previousEnd = previous.atDay(day).plusDays(1).atStartOfDay(zone);
        } else {
            int days = this == LAST_7_DAYS ? 7 : 30;
            start = end.minusDays(days);
            previousEnd = start;
            previousStart = start.minusDays(days);
        }
        return new Bounds(start.toInstant(), now, previousStart.toInstant(), previousEnd.toInstant());
    }

    public record Bounds(Instant start, Instant end, Instant previousStart, Instant previousEnd) {}
}
