CREATE TABLE `board_event` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_event_board_revision_idx` ON `board_event` (`board_id`,`revision`);--> statement-breakpoint
ALTER TABLE `board` ADD `revision` integer DEFAULT 0 NOT NULL;