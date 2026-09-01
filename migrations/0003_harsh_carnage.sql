DROP INDEX IF EXISTS `requests_one_active_per_viewer_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `requests_one_per_viewer_idx` ON `join_requests` (`run_id`,`requester_id`);