/**
 * Lays friends' calendars and the common free time out in one day column. Pure functions: the
 * calendar hands in what it fetched, this decides where each piece is drawn.
 */

/** At most this many friends side by side: past four, a lane is too narrow to read. */
export const MAX_OVERLAID_FRIENDS = 4;

/**
 * One colour per lane, in the order friends were mentioned. The first friend gets the brand
 * orange; the brand blue is left out, being the colour of the user's own events.
 */
export const OVERLAY_COLORS: readonly string[] = ['#f97316', '#8b5cf6', '#0d9488', '#e11d48'];

const HOUR_MS = 3_600_000;

/**
 * Common free time only counts between these hours, local time: free at 3 am is true and useless,
 * and over a week it buried the evenings that matter. The server cannot apply it, not knowing
 * the user's time zone.
 */
export const USEFUL_FROM_HOUR = 8;
export const USEFUL_TO_HOUR = 23;

/** In the month view, a day is marked as free together from this long a common stretch. */
export const MIN_COMMON_FREE_MS = 2 * HOUR_MS;
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

/** How much of one friend's useful hours a day takes, for the month view. */
export interface FriendLoad {
    friendName: string;
    color: string;
    /** Busy share of 8:00–23:00, from 0 to 1. */
    ratio: number;
}

/** A month cell's view of the overlay: each friend's load, and the longest common free stretch. */
export interface DaySummary {
    loads: FriendLoad[];
    /**
     * Null unless it lasts at least {@link MIN_COMMON_FREE_MS}, and null too when it is the whole of
     * 8:00–23:00: on a day nobody has plans, the pill said « 8–23 h » on nearly every cell of the
     * month and stood out on none. The empty load bars already say that day is open.
     */
    commonFree: Period | null;
}

function startOfDay(day: Date): Date {
    const date = new Date(day);
    date.setHours(0, 0, 0, 0);
    return date;
}

/** 8:00 to 23:00 of the given day, local time. */
export function usefulHours(day: Date): Period {
    const start = startOfDay(day);
    start.setHours(USEFUL_FROM_HOUR);
    const end = startOfDay(day);
    end.setHours(USEFUL_TO_HOUR);
    return { start, end };
}

/** The part of a period inside a window, or null when they do not overlap. */
function clip(period: Period, window: Period): Period | null {
    const start = period.start > window.start ? period.start : window.start;
    const end = period.end < window.end ? period.end : window.end;
    return start < end ? { start, end } : null;
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

    const useful = usefulHours(day);
    const bands = free.flatMap(period => {
        const inUsefulHours = clip(period, useful);
        const placed = inUsefulHours && place(inUsefulHours, dayStart, dayEnd, hourHeight);
        return placed ? [placed] : [];
    });

    return { blocks, free: bands };
}

/** Total time covered by periods that may overlap, counted once. */
function coveredMs(periods: Period[]): number {
    const sorted = [...periods].sort((a, b) => a.start.getTime() - b.start.getTime());
    let total = 0;
    let reach = -Infinity;
    for (const { start, end } of sorted) {
        const from = Math.max(start.getTime(), reach);
        if (end.getTime() > from) {
            total += end.getTime() - from;
        }
        reach = Math.max(reach, end.getTime());
    }
    return total;
}

export function summarizeDay(day: Date, lanes: readonly FriendLane[], free: readonly Period[]): DaySummary {
    const useful = usefulHours(day);
    const usefulMs = useful.end.getTime() - useful.start.getTime();

    const loads = lanes.map(lane => ({
        friendName: lane.friendName,
        color: lane.color,
        ratio: coveredMs(lane.periods.flatMap(period => clip(period, useful) ?? [])) / usefulMs
    }));

    const longest = free
        .flatMap(period => clip(period, useful) ?? [])
        .reduce<Period | null>((best, period) =>
            !best || period.end.getTime() - period.start.getTime() > best.end.getTime() - best.start.getTime()
                ? period : best, null);
    const length = longest ? longest.end.getTime() - longest.start.getTime() : 0;
    const commonFree = longest && length >= MIN_COMMON_FREE_MS && length < usefulMs ? longest : null;

    return { loads, commonFree };
}
