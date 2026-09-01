CREATE TABLE `join_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`requester_id` text NOT NULL,
	`message` text,
	`status` text NOT NULL,
	`decline_reason` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `requests_run_status_idx` ON `join_requests` (`run_id`,`status`);--> statement-breakpoint
CREATE INDEX `requests_requester_idx` ON `join_requests` (`requester_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`timezone` text NOT NULL,
	`format` text NOT NULL,
	`venue_name` text NOT NULL,
	`exact_address` text NOT NULL,
	`city` text NOT NULL,
	`host_id` text NOT NULL,
	`capacity` integer,
	`visibility` text NOT NULL,
	`auto_approve` integer DEFAULT false NOT NULL,
	`is_draft` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_host_idx` ON `runs` (`host_id`);--> statement-breakpoint
CREATE INDEX `runs_city_format_idx` ON `runs` (`city`,`format`);--> statement-breakpoint
CREATE INDEX `runs_starts_at_idx` ON `runs` (`starts_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`bio` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);