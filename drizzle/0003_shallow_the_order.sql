CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`notes` text,
	`reminderDate` timestamp,
	`reminderEnabled` boolean DEFAULT true,
	`status` enum('pending','completed','cancelled') DEFAULT 'pending',
  `priority` enum('low','medium','high') DEFAULT 'medium',
  `assignedTo` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
