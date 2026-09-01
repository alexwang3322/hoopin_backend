import type { InferSelectModel } from "drizzle-orm";
import type { users, runs, joinRequests } from "../db/schema";
import type {
  UserSummary,
  RunSummary,
  RunDetail,
  JoinRequest,
  ViewerAction,
  ViewerRunStatus,
} from "../contract-types";

export type UserRow = InferSelectModel<typeof users>;
export type RunRow = InferSelectModel<typeof runs>;
export type JoinRequestRow = InferSelectModel<typeof joinRequests>;

/** Server-computed so the frontend never reimplements this (API_CONTRACT.md
 *  §2's UserSummary.initials comment) — first letter of up to the first two
 *  whitespace-separated words, uppercased. */
export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/**
 * Deterministic id -> value hash (fnv1a), used so covers/avatars are
 * client-computable from `id` with no stored image/color state
 * (API_CONTRACT.md §6: "covers/avatars are client-derived from hashing
 * id"). This is a from-scratch fnv1a implementation matching that stated
 * design intent, not a port of ui/figma-plugin/code.js's specific
 * fnv1a/coverPaint/avatarPaint functions — if pixel-identical output to the
 * Figma kit matters later, port those directly instead of this.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const COVER_GRADIENTS = [
  "linear-gradient(120deg,#F0793A,#7A2E12)",
  "linear-gradient(115deg,#D9A05C,#6B4423)",
  "linear-gradient(125deg,#3E8161,#163A29)",
  "linear-gradient(110deg,#A4453D,#3D1414)",
  "linear-gradient(130deg,#3B4F70,#101820)",
  "linear-gradient(122deg,#6B4C7A,#241830)",
  "linear-gradient(118deg,#E0954B,#5C3A17)",
  "linear-gradient(128deg,#2E4A73,#101828)",
];

/** `cover_seed` (= id) is what the contract says ships to the client; this
 *  is the reference implementation of "FE hashes this client-side" so the
 *  seed→gradient mapping is documented and testable server-side too. */
export function coverGradientFor(seed: string): string {
  return COVER_GRADIENTS[fnv1a(seed) % COVER_GRADIENTS.length]!;
}

export function avatarColorFor(seed: string): string {
  const hue = fnv1a(`avatar:${seed}`) % 360;
  return `hsl(${hue}, 45%, 42%)`;
}

export function toUserSummary(row: UserRow): UserSummary {
  return { id: row.id, name: row.name, initials: computeInitials(row.name), bio: row.bio ?? null };
}

export function toJoinRequest(row: JoinRequestRow, requester: UserRow): JoinRequest {
  return {
    id: row.id,
    run_id: row.runId,
    requester: toUserSummary(requester),
    message: row.message ?? null,
    status: row.status,
    created_at: row.createdAt,
    decided_at: row.decidedAt ?? null,
    ...(row.declineReason !== null ? { decline_reason: row.declineReason } : {}),
  };
}

/** The 7-branch action-panel state machine (API_CONTRACT.md §2's
 *  ViewerAction doc comment) — computed here, server-side, so no client
 *  ever re-derives it from raw status + capacity. */
export function viewerActionFor(
  run: RunRow,
  goingCount: number,
  viewerId: string | null,
  myActiveRequest: JoinRequestRow | undefined,
): ViewerAction {
  if (!viewerId) return "signed_out";
  if (run.hostId === viewerId) return "host";
  if (myActiveRequest) {
    if (myActiveRequest.status === "pending") return "pending";
    if (myActiveRequest.status === "approved") return "approved";
    if (myActiveRequest.status === "declined") return "declined";
    // "withdrawn" falls through — no active relationship anymore.
  }
  if (run.capacity !== null && goingCount >= run.capacity) return "full";
  return "can_request";
}

export function viewerStatusFor(action: ViewerAction, myLatestRequestStatus: JoinRequestRow["status"] | undefined): ViewerRunStatus {
  if (action === "host") return "host";
  if (action === "pending") return "pending";
  if (action === "approved") return "approved";
  if (action === "declined") return "declined";
  if (myLatestRequestStatus === "withdrawn") return "withdrawn";
  return null;
}

export function isAddressUnlocked(action: ViewerAction): boolean {
  return action === "host" || action === "approved";
}

export function toRunSummary(
  row: RunRow,
  host: UserRow,
  goingCount: number,
  viewerStatus: ViewerRunStatus,
): RunSummary {
  return {
    id: row.id,
    title: row.title,
    starts_at: row.startsAt,
    ends_at: row.endsAt,
    timezone: row.timezone,
    format: row.format,
    venue_name: row.venueName,
    city: row.city,
    host: toUserSummary(host),
    capacity: row.capacity,
    going_count: goingCount,
    is_full: row.capacity !== null && goingCount >= row.capacity,
    is_draft: row.isDraft,
    is_cancelled: row.cancelledAt !== null,
    cancelled_at: row.cancelledAt,
    visibility: row.visibility,
    viewer_status: viewerStatus,
    cover_seed: row.id,
  };
}

export interface RunDetailExtras {
  attendees: UserRow[];
  viewerAction: ViewerAction;
  viewerId: string | null;
  myActiveRequest?: JoinRequestRow;
  myRequester?: UserRow;
  pendingRequests?: { rows: JoinRequestRow[]; requesterById: Map<string, UserRow>; pendingCount: number };
}

export function toRunDetail(
  row: RunRow,
  host: UserRow,
  goingCount: number,
  viewerStatus: ViewerRunStatus,
  extras: RunDetailExtras,
): RunDetail {
  const summary = toRunSummary(row, host, goingCount, viewerStatus);
  const unlocked = isAddressUnlocked(extras.viewerAction);

  const detail: RunDetail = {
    ...summary,
    description: row.description,
    auto_approve: row.autoApprove,
    created_at: row.createdAt,
    attendees: extras.attendees.map(toUserSummary),
    viewer_action: extras.viewerAction,
    ...(unlocked
      ? { exact_address: row.exactAddress }
      : { address_locked_reason: extras.viewerId ? ("not_approved" as const) : ("signed_out" as const) }),
  };

  if (extras.myActiveRequest && extras.myRequester) {
    detail.viewer_request = toJoinRequest(extras.myActiveRequest, extras.myRequester);
  }

  if (extras.pendingRequests) {
    detail.pending_requests = {
      items: extras.pendingRequests.rows.map((r) => toJoinRequest(r, extras.pendingRequests!.requesterById.get(r.requesterId)!)),
      pending_count: extras.pendingRequests.pendingCount,
    };
  }

  return detail;
}
