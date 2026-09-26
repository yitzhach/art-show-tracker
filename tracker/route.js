/* ============================================================================
   route.js — the season planner (idea 17): the legs between shows, the days
   between them, and the weekends with nothing on.
   Publishes `ASTRoute`. DOM-free like calendar.js and pipeline.js.

   Three rules.

   1. STRAIGHT-LINE MILES ARE A FLOOR, NOT THE DRIVE. The road is always at
      least as long as the straight line, so a straight line can prove a leg
      is too far — never that it is fine. The verdicts are one-sided on
      purpose: 'too-far' is proven, 'fits-straight-line' only says the floor
      fits, and the page has to say that road miles will be more.

   2. NO DAILY DRIVING LIMIT SHIPS WITH THE APP. How far someone will drive
      in a day with a loaded van is theirs to say, the same way the mileage
      rate is. With no limit set, no leg is judged at all.

   3. ONLY SHOWS YOU MIGHT ACTUALLY BE AT. Accepted, applied and wait-listed
      shows make the plan; interested, declined and not-applying do not, and
      neither do hidden shows or alternates. The page names the rule.
   ==========================================================================*/
var ASTRoute = (function () {
  'use strict';

  var PLANNED = ['accepted', 'applied', 'waitlist'];
  var EARTH_MI = 3958.8;

  function parse(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var p = iso.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  var DAY = 86400000;

  function hasCoords(s) { return typeof s.lat === 'number' && typeof s.lng === 'number'; }

  /** Great-circle miles. Null when either end has no coordinates. */
  function straightMiles(a, b) {
    if (!a || !b || !hasCoords(a) || !hasCoords(b)) return null;
    var r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** The shows the plan is built from, in date order. */
  function planned(shows) {
    return (shows || []).filter(function (s) {
      return s && !s.deletedAt && !s.hidden && !s.isAlternate &&
        PLANNED.indexOf(s.status) !== -1 && parse(s.startDate) != null;
    }).sort(function (a, b) { return a.startDate.localeCompare(b.startDate); });
  }

  /**
   * One hop per consecutive pair. `daysBetween` counts the whole days
   * between the last day of one show and the first day of the next: Sunday
   * to the following Friday is 4. Negative means the shows overlap.
   *
   * verdict:
   *   'overlap'            the dates collide — you cannot be at both
   *   'too-far'            even the straight line is beyond your limit
   *   'fits-straight-line' the floor fits; road miles will be more
   *   'not-judged'         no limit set, or a stop has no coordinates
   */
  function legs(shows, opts) {
    opts = opts || {};
    var limit = typeof opts.maxMilesPerDay === 'number' && opts.maxMilesPerDay > 0
      ? opts.maxMilesPerDay : null;
    var list = planned(shows);
    var out = [];
    for (var i = 1; i < list.length; i++) {
      var a = list[i - 1], b = list[i];
      var end = parse(a.endDate) != null ? parse(a.endDate) : parse(a.startDate);
      var gap = Math.round((parse(b.startDate) - end) / DAY) - 1;
      var miles = straightMiles(a, b);
      /* Travel days: the days between, plus the evening of teardown counted
         as nothing. A back-to-back weekend (gap 4) gives four days. A gap of
         zero still allows the night drive some artists do, so it counts as
         one — generous on purpose, because the floor is already generous. */
      var days = Math.max(1, gap);
      var verdict;
      if (gap < 0) verdict = 'overlap';
      else if (limit == null || miles == null) verdict = 'not-judged';
      else if (miles > limit * days) verdict = 'too-far';
      else verdict = 'fits-straight-line';
      out.push({ from: a, to: b, daysBetween: gap, straightMiles: miles,
                 travelDays: days, verdict: verdict });
    }
    return out;
  }

  /**
   * Weekends inside the planned season with no planned show on the Saturday
   * or the Sunday. The season runs from the first planned show to the last;
   * a weekend outside it is not "dead", it is off-season.
   */
  function deadWeekends(shows) {
    var list = planned(shows);
    if (list.length < 2) return [];
    var first = parse(list[0].startDate);
    var last = list.reduce(function (m, s) {
      var e = parse(s.endDate) != null ? parse(s.endDate) : parse(s.startDate);
      return Math.max(m, e);
    }, first);
    var busy = {};
    list.forEach(function (s) {
      var a = parse(s.startDate), e = parse(s.endDate) != null ? parse(s.endDate) : a;
      for (var t = a; t <= e; t += DAY) busy[iso(t)] = true;
    });
    var out = [];
    /* First Saturday on or after the season opens. */
    var sat = first + ((6 - new Date(first).getUTCDay() + 7) % 7) * DAY;
    for (; sat <= last; sat += 7 * DAY) {
      if (!busy[iso(sat)] && !busy[iso(sat + DAY)]) out.push(iso(sat));
    }
    return out;
  }

  /** Totals, with the straight-line caveat built into the field name. */
  function summary(legList) {
    var known = legList.filter(function (l) { return l.straightMiles != null; });
    var count = function (v) { return legList.filter(function (l) { return l.verdict === v; }).length; };
    return {
      legs: legList.length,
      atLeastMiles: known.length
        ? known.reduce(function (t, l) { return t + l.straightMiles; }, 0) : null,
      milesComplete: known.length === legList.length,
      overlap: count('overlap'),
      tooFar: count('too-far'),
      notJudged: count('not-judged')
    };
  }

  return {
    PLANNED: PLANNED,
    straightMiles: straightMiles,
    planned: planned,
    legs: legs,
    deadWeekends: deadWeekends,
    summary: summary
  };
})();
if (typeof window !== 'undefined') window.ASTRoute = ASTRoute;
