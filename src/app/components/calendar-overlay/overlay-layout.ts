/**
 * Lays friends' calendars and the common free time out in one day column. Pure functions: the
 * calendar hands in what it fetched, this decides where each piece is drawn.
 */

/** At most this many friends side by side: past four, a lane is too narrow to read. */
export const MAX_OVERLAID_FRIENDS = 4;

/** One colour per lane, in the order friends were mentioned. */
export const OVERLAY_COLORS: readonly string[] = ['#a855f7', '#f97316', '#0d9488', '#e11d48'];

const HOUR_MS = 3_600_000;
/** A block never gets thinner than this, so a short event still shows. */
const MIN_BLOCK_PX = 4;

/** A period, already in the viewer's dates. */
export interface Period {
    start: Date;
    end: Date;
}

/** What is known of one friend's period: always when, and the title or location if disclosed. */
export interface FriendPeriod extends Period {
    title: string | null;
    location: string | null;
}

/** One friend's lane: their name, colour and the periods that keep them busy. */
export interface FriendLane {
    friendName: string;
    color: string;
    periods: readonly FriendPeriod[];
}

/** A friend's period cut to one day and placed in that friend's lane of the column. */
export interface FriendBlock {
    top: number;
    height: number;
    /** Lane position, as percentages of the column width. */
    left: number;
    width: number;
    color: string;
    friendName: string;
    /** Null when the friendship does not disclose it: the block then reads "busy". */
    title: string | null;
    location: string | null;
}

/** A stretch of the day when everyone is free, across the whole column. */
export interface FreeBand {
    top: number;
    height: number;
}

export interface DayLayout {
    blocks: FriendBlock[];
    free: FreeBand[];
}

function startOfDay(day: Date): Date {
    const date = new Date(day);
    date.setHours(0, 0, 0, 0);
    return date;
}

/** The part of a period that falls on the day, in pixels from midnight; null if none does. */
function place(period: Period, dayStart: Date, dayEnd: Date, hourHeight: number): { top: number; height: number } | null {
    if (period.start >= dayEnd || period.end <= dayStart) {
        return null;
    }
    const from = Math.max(period.start.getTime(), dayStart.getTime());
    const to = Math.min(period.end.getTime(), dayEnd.getTime());
    return {
        top: (from - dayStart.getTime()) / HOUR_MS * hourHeight,
        height: Math.max((to - from) / HOUR_MS * hourHeight, MIN_BLOCK_PX)
    };
}

export function layoutDay(day: Date, lanes: readonly FriendLane[], free: readonly Period[], hourHeight: number): DayLayout {
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const width = lanes.length > 0 ? 100 / lanes.length : 100;

    const blocks = lanes.flatMap((lane, index) => lane.periods.flatMap(period => {
        const placed = place(period, dayStart, dayEnd, hourHeight);
        return placed ? [{
            ...placed,
            left: index * width,
            width,
            color: lane.color,
            friendName: lane.friendName,
            title: period.title,
            location: period.location
        }] : [];
    }));

    const bands = free.flatMap(period => {
        const placed = place(period, dayStart, dayEnd, hourHeight);
        return placed ? [placed] : [];
    });

    return { blocks, free: bands };
}
