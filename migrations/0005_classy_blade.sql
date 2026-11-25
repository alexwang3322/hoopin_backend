ALTER TABLE `users` ADD `location` text DEFAULT 'SD' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `gender` text DEFAULT 'Prefer not to say' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `position` text DEFAULT 'Flexible' NOT NULL;