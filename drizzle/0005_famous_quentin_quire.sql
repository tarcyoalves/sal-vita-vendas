CREATE TABLE `chat_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`message` text NOT NULL,
	`context` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`fileUrl` varchar(500),
	`category` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_id` PRIMARY KEY(`id`)
);
