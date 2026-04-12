CREATE TABLE `ai_analysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`analysisDate` timestamp NOT NULL,
	`performanceScore` decimal(5,2),
	`fraudRiskScore` decimal(5,2),
	`insights` text,
	`recommendations` text,
	`suspiciousPatterns` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_analysis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `call_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`clientPhone` varchar(20),
	`clientEmail` varchar(320),
	`scheduledDate` timestamp NOT NULL,
	`notes` text,
	`status` enum('pending','completed','cancelled','rescheduled') DEFAULT 'pending',
	`priority` enum('low','medium','high') DEFAULT 'medium',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `call_reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `call_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reminderId` int NOT NULL,
	`resultType` enum('realizada','nao_atendida','reagendada','convertida') NOT NULL,
	`notes` text,
	`nextScheduledDate` timestamp,
	`isFraud` boolean DEFAULT false,
	`completedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `call_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`metricsDate` timestamp NOT NULL,
	`totalReminders` int DEFAULT 0,
	`completedReminders` int DEFAULT 0,
	`convertedCalls` int DEFAULT 0,
	`conversionRate` decimal(5,2) DEFAULT '0.00',
	`notAttendedCalls` int DEFAULT 0,
	`rescheduledCalls` int DEFAULT 0,
	`goalMet` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text,
	`type` enum('reminder','alert','info') DEFAULT 'info',
	`reminderId` int,
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sellers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20),
	`department` varchar(100),
	`dailyGoal` int DEFAULT 10,
	`status` enum('active','inactive') DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sellers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','user') NOT NULL DEFAULT 'user';