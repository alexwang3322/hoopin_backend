/**
 * Local/dev fixture data — same user ids, run ids, and story as
 * frontend/src/mock/{profiles,runs}.ts, so manual testing here lines up
 * with what the frontend and mobile-ios mocks already demonstrate. Ported
 * to a real relational shape: unlike the frontend's mock (which fakes a
 * `baseGoingCount` for unnamed pre-seeded attendees), every attendee here
 * is a real `join_requests` row — going_count is always a true count, never
 * padded.
 */
import type { UserRow, RunRow, JoinRequestRow } from "../lib/viewer";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export function buildSeedUsers(): UserRow[] {
  const now = new Date().toISOString();
  const raw: Array<[string, string, string]> = [
    ["u_jamie", "Jamie Tran", "Runs the Wednesday lunch crew · plays out of Kezar most weeks"],
    ["u_marcus", "Marcus Bell", "Hosts the Rosa Parks Sunday run"],
    ["u_priya", "Priya Nair", "Hosts Dolores Park 3v3"],
    ["u_deshawn", "Deshawn Carter", "West Oakland Tuesday night regular"],
    ["u_aiko", "Aiko Sato", "Point guard, plays Wednesdays"],
    ["u_noah", "Noah Delgado", "Runs a laid-back Sunday morning session at Bernal · brings the spare ball"],
    ["u_kai", "Kai Fujimoto", "Plays center, tall enough to prove it"],
    ["u_tyler", "Tyler Nguyen", "Plays at the Presidio wall most weekends"],
    ["u_sam", "Sam Okafor", "New to the city, ran pickup in Chicago"],
  ];
  return raw.map(([id, name, bio]) => ({
    id,
    email: `${id}@dev.hoopin.local`,
    name,
    bio,
    createdAt: now,
  }));
}

export function buildSeedRuns(): RunRow[] {
  return [
    {
      id: "ev_kezar_lunch",
      title: "Kezar Pavilion Lunch Run",
      description:
        "Full-court, next-basket-wins, call your own fouls. Bring a light shirt and a dark shirt — we split teams by colour when everyone's in. Doors unlock 15 minutes early.",
      startsAt: "2026-09-09T12:00:00-07:00",
      endsAt: "2026-09-09T13:00:00-07:00",
      timezone: "America/Los_Angeles",
      format: "5v5_full_court",
      venueName: "Kezar Pavilion",
      exactAddress: "755 Frederick St, San Francisco, CA 94117",
      city: "SF",
      hostId: "u_jamie",
      capacity: 10,
      visibility: "public",
      autoApprove: false,
      isDraft: false,
      createdAt: ago(25 * DAY),
    },
    {
      id: "ev_rosa_parks",
      title: "Rosa Parks Sunday Run",
      description: "Full-court Sunday morning run, coffee after for whoever's still got legs. Casual pace, all levels welcome.",
      startsAt: "2026-09-06T08:00:00-07:00",
      endsAt: "2026-09-06T10:00:00-07:00",
      timezone: "America/Los_Angeles",
      format: "5v5_full_court",
      venueName: "Rosa Parks Fields",
      exactAddress: "600 John F Shelley Dr, San Francisco, CA 94134",
      city: "SF",
      hostId: "u_marcus",
      capacity: 10,
      visibility: "public",
      autoApprove: false,
      isDraft: false,
      createdAt: ago(20 * DAY),
    },
    {
      id: "ev_dolores_3v3",
      title: "Dolores Park 3v3",
      description: "Half-court 3v3 at the Dolores Park courts. Winners stay on, losers grab water for the next game.",
      startsAt: "2026-09-07T18:00:00-07:00",
      endsAt: "2026-09-07T20:00:00-07:00",
      timezone: "America/Los_Angeles",
      format: "3v3_half_court",
      venueName: "Dolores Park Courts",
      exactAddress: "19th & Dolores St, San Francisco, CA 94114",
      city: "SF",
      hostId: "u_priya",
      capacity: 6,
      visibility: "public",
      autoApprove: false,
      isDraft: false,
      createdAt: ago(15 * DAY),
    },
    {
      id: "ev_west_oakland",
      title: "West Oakland Tuesday Run",
      description: "Full-court Tuesday night run at DeFremery. Regulars fill this one fast — it's already at capacity.",
      startsAt: "2026-09-15T18:30:00-07:00",
      endsAt: "2026-09-15T20:30:00-07:00",
      timezone: "America/Los_Angeles",
      format: "5v5_full_court",
      venueName: "DeFremery Park",
      exactAddress: "1651 Adeline St, Oakland, CA 94607",
      city: "OAK",
      hostId: "u_deshawn",
      capacity: 7,
      visibility: "public",
      autoApprove: false,
      isDraft: false,
      createdAt: ago(30 * DAY),
    },
    {
      id: "ev_presidio",
      title: "Presidio Wednesday Pickup",
      description: "Half-court wall-ball at the Presidio courts. Small group, high rep count — good for getting shots up.",
      startsAt: "2026-09-16T18:00:00-07:00",
      endsAt: "2026-09-16T19:30:00-07:00",
      timezone: "America/Los_Angeles",
      format: "3v3_half_court",
      venueName: "Presidio Wall Courts",
      exactAddress: "Presidio Blvd & Anza St, San Francisco, CA 94129",
      city: "SF",
      hostId: "u_aiko",
      capacity: 6,
      visibility: "public",
      autoApprove: false,
      isDraft: false,
      createdAt: ago(12 * DAY),
    },
    {
      id: "ev_bernal",
      title: "Bernal Rec Center Run",
      description: "Full-court Sunday morning run at Bernal. New run, still finding its regulars — come early to grab a side.",
      startsAt: "2026-09-20T09:00:00-07:00",
      endsAt: "2026-09-20T11:00:00-07:00",
      timezone: "America/Los_Angeles",
      format: "5v5_full_court",
      venueName: "Bernal Heights Rec Center",
      exactAddress: "500 Cortland Ave, San Francisco, CA 94110",
      city: "SF",
      hostId: "u_noah",
      capacity: 10,
      visibility: "public",
      autoApprove: true, // exercises the auto-approve-on-request path
      isDraft: false,
      createdAt: ago(3 * DAY),
    },
    {
      id: "ev_downtown_scrimmage",
      title: "Downtown Oakland Scrimmage",
      description: "Invite-only weeknight run — link only, not listed in Discover.",
      startsAt: "2026-09-18T19:00:00-07:00",
      endsAt: "2026-09-18T21:00:00-07:00",
      timezone: "America/Los_Angeles",
      format: "5v5_full_court",
      venueName: "Downtown Oakland Courts",
      exactAddress: "123 Broadway, Oakland, CA 94612",
      city: "OAK",
      hostId: "u_kai",
      capacity: 8,
      visibility: "private",
      autoApprove: false,
      isDraft: false,
      createdAt: ago(10 * DAY),
    },
    {
      id: "ev_sunday_skills_draft",
      title: "Sunday Skills Clinic",
      description: "Ball-handling and shooting drills before the run — still figuring out logistics.",
      startsAt: "2026-10-04T10:00:00-07:00",
      endsAt: "2026-10-04T10:00:00-07:00",
      timezone: "America/Los_Angeles",
      format: "5v5_full_court",
      venueName: "",
      exactAddress: "",
      city: "SF",
      hostId: "u_jamie",
      capacity: null,
      visibility: "public",
      autoApprove: false,
      isDraft: true,
      createdAt: ago(2 * DAY),
    },
  ];
}

let reqCounter = 0;
function req(
  runId: string,
  requesterId: string,
  status: JoinRequestRow["status"],
  createdAgoMs: number,
  opts: { message?: string | null; declineReason?: string | null; decidedAgoMs?: number } = {},
): JoinRequestRow {
  reqCounter += 1;
  return {
    id: `req_seed_${reqCounter}`,
    runId,
    requesterId,
    message: opts.message ?? null,
    status,
    declineReason: opts.declineReason ?? null,
    createdAt: ago(createdAgoMs),
    decidedAt: opts.decidedAgoMs !== undefined ? ago(opts.decidedAgoMs) : status === "pending" ? null : ago(createdAgoMs / 2),
  };
}

export function buildSeedJoinRequests(): JoinRequestRow[] {
  return [
    // ev_kezar_lunch — 5 approved, 2 pending (host: u_jamie)
    req("ev_kezar_lunch", "u_marcus", "approved", 6 * DAY),
    req("ev_kezar_lunch", "u_aiko", "approved", 5 * DAY),
    req("ev_kezar_lunch", "u_priya", "approved", 5 * DAY),
    req("ev_kezar_lunch", "u_noah", "approved", 4 * DAY),
    req("ev_kezar_lunch", "u_kai", "approved", 3 * DAY),
    req("ev_kezar_lunch", "u_tyler", "pending", 4 * HOUR, {
      message:
        "Looking for a lunch run closer to my office — used to run at the Presidio on weekends but the commute's rough midweek.",
    }),
    req("ev_kezar_lunch", "u_sam", "pending", 1 * DAY, {
      message: "Just moved from Chicago, used to run at the park district gyms there. Can vouch I show up on time and pass the ball.",
    }),

    // ev_rosa_parks — 4 approved, incl. u_jamie (host: u_marcus)
    req("ev_rosa_parks", "u_priya", "approved", 9 * DAY),
    req("ev_rosa_parks", "u_deshawn", "approved", 9 * DAY),
    req("ev_rosa_parks", "u_aiko", "approved", 8 * DAY),
    req("ev_rosa_parks", "u_jamie", "approved", 10 * DAY, { decidedAgoMs: 9 * DAY }),

    // ev_dolores_3v3 — 2 approved, u_jamie pending (host: u_priya)
    req("ev_dolores_3v3", "u_marcus", "approved", 7 * DAY),
    req("ev_dolores_3v3", "u_noah", "approved", 6 * DAY),
    req("ev_dolores_3v3", "u_jamie", "pending", 2 * DAY),

    // ev_west_oakland — 7 approved (== capacity, full), u_jamie has none (host: u_deshawn)
    req("ev_west_oakland", "u_marcus", "approved", 20 * DAY),
    req("ev_west_oakland", "u_priya", "approved", 19 * DAY),
    req("ev_west_oakland", "u_aiko", "approved", 18 * DAY),
    req("ev_west_oakland", "u_noah", "approved", 17 * DAY),
    req("ev_west_oakland", "u_kai", "approved", 16 * DAY),
    req("ev_west_oakland", "u_tyler", "approved", 15 * DAY),
    req("ev_west_oakland", "u_sam", "approved", 14 * DAY),

    // ev_presidio — u_jamie + u_kai approved (host: u_aiko)
    req("ev_presidio", "u_jamie", "approved", 9 * DAY, { decidedAgoMs: 8 * DAY }),
    req("ev_presidio", "u_kai", "approved", 8 * DAY),

    // ev_bernal — none yet (host: u_noah, auto_approve: true)

    // ev_downtown_scrimmage — u_jamie declined, with a reason (host: u_kai, private)
    req("ev_downtown_scrimmage", "u_jamie", "declined", 14 * DAY, {
      declineReason: "Full this month — try the October run.",
      decidedAgoMs: 13 * DAY,
    }),
  ];
}
