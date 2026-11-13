import { tz } from "@date-fns/tz";
import { compareAsc, format, isValid, parseISO } from "date-fns";

/** Dates are written and displayed in this zone, regardless of where the site is built. */
export const SITE_TIME_ZONE = "Asia/Singapore";

const inSiteZone = tz(SITE_TIME_ZONE);

/**
 * Parses an ISO 8601 string. Date-only values (`2025-02-01`) mean that calendar day in the
 * site's time zone; values with an offset (`2025-02-01T10:00:00+08:00`) keep their instant.
 * Throws on anything that isn't a valid ISO date.
 */
export const parseDate = (value: string): Date => {
	const date = parseISO(value, { in: inSiteZone });

	if (!isValid(date)) {
		throw new RangeError(`Invalid ISO date: "${value}"`);
	}

	return date;
};

/** "February 1, 2025" */
export const formatLongDate = (date: Date) => format(date, "MMMM d, yyyy", { in: inSiteZone });

/** "01/02/2025" */
export const formatShortDate = (date: Date) => format(date, "dd/MM/yyyy", { in: inSiteZone });

/** "01/02/25" */
export const formatCompactDate = (date: Date) => format(date, "dd/MM/yy", { in: inSiteZone });

/** Oldest first. */
export const byDateAsc = (a: Date, b: Date) => compareAsc(a, b);
