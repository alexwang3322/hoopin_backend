PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`phone` text,
	`name` text NOT NULL,
	`bio` text,
	`created_at` text NOT NULL,
	CONSTRAINT "users_has_identifier_check" CHECK("__new_users"."email" IS NOT NULL OR "__new_users"."phone" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "phone", "name", "bio", "created_at") SELECT "id", "email", "phone", "name", "bio", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);