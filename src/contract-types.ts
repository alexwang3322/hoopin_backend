/**
 * Hand-mirrors API_CONTRACT.md §2 verbatim. This file (not a copy drifting
 * in frontend/ or mobile-ios) is the actual runtime source of truth once a
 * client is wired to this API — if this ever needs to diverge from
 * API_CONTRACT.md, update the contract doc in the same change.
 */

export type ZonedDateTimeString = string;
export type IanaTimezone = string;
export type RunFormat = "5v5_full_court" | "3v3_half_court";
export type RunVisibility = "public" | "private";
export type City = "SF" | "OAK" | "SJ" | "SD" | "NYC";

export type ViewerRunStatus = "host" | "pending" | "approved" | "declined" | "withdrawn" | null;

export type ViewerAction =
  | "signed_out"
  | "can_request"
  | "host"
  | "pending"
  | "approved"
  | "declined"
  | "full";

export type JoinRequestStatus = "pending" | "approved" | "declined" | "withdrawn";

export interface UserSummary {
  id: string;
  name: string;
  initials: string;
  bio: string | null;
}

export interface RunSummary {
  id: string;
  title: string;
  starts_at: ZonedDateTimeString;
  ends_at: ZonedDateTimeString;
  timezone: IanaTimezone;
  format: RunFormat;
  venue_name: string;
  city: City;
  host: UserSummary;
  capacity: number | null;
  going_count: number;
  is_full: boolean;
  is_draft: boolean;
  is_cancelled: boolean;
  cancelled_at: ZonedDateTimeString | null;
  visibility: RunVisibility;
  viewer_status: ViewerRunStatus;
  cover_seed: string;
}

export interface JoinRequest {
  id: string;
  run_id: string;
  requester: UserSummary;
  message: string | null;
  status: JoinRequestStatus;
  created_at: ZonedDateTimeString;
  decided_at: ZonedDateTimeString | null;
  decline_reason?: string | null;
}

export interface RunDetail extends RunSummary {
  description: string;
  auto_approve: boolean;
  created_at: ZonedDateTimeString;
  exact_address?: string;
  address_locked_reason?: "not_approved" | "signed_out";
  attendees: UserSummary[];
  viewer_action: ViewerAction;
  viewer_request?: JoinRequest;
  pending_requests?: {
    items: JoinRequest[];
    pending_count: number;
  };
}

export interface CreateRunRequest {
  title: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  timezone: IanaTimezone;
  format: RunFormat;
  venue_name: string;
  exact_address: string;
  city: City;
  capacity: number | null;
  visibility: RunVisibility;
  auto_approve: boolean;
  publish: boolean;
}

export type UpdateRunRequest = Partial<CreateRunRequest>;

export interface CreateJoinRequestRequest {
  message?: string;
}

export interface DeclineJoinRequestRequest {
  decline_reason?: string;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface JoinRequestWithRun extends JoinRequest {
  run: RunSummary;
}

export interface HeaderCounts {
  my_pending_requests: number;
  hosting_pending_requests: number;
}
