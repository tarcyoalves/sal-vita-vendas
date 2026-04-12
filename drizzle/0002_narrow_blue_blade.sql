CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cnpj` varchar(18),
	`name` varchar(255) NOT NULL,
	`contact` varchar(255),
	`phone` varchar(20) NOT NULL,
	`city` varchar(100) NOT NULL,
	`state` varchar(2) NOT NULL,
	`email` varchar(320),
	`status` enum('active','inactive','prospect') DEFAULT 'prospect',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`sellerId` int,
	`importBatchId` varchar(64),
	`status` enum('new','assigned','contacted','converted','lost') DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
