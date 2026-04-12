-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."call_status" AS ENUM('pending', 'completed', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive', 'prospect');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'assigned', 'contacted', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('reminder', 'alert', 'info');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."result_type" AS ENUM('realizada', 'nao_atendida', 'reagendada', 'convertida');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."seller_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "ai_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" serial NOT NULL,
	"analysis_date" timestamp NOT NULL,
	"performance_score" numeric(5, 2),
	"fraud_risk_score" numeric(5, 2),
	"insights" text,
	"recommendations" text,
	"suspicious_patterns" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" serial NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"client_phone" varchar(20),
	"client_email" varchar(320),
	"scheduled_date" timestamp NOT NULL,
	"notes" text,
	"status" "call_status" DEFAULT 'pending',
	"priority" "priority" DEFAULT 'medium',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"reminder_id" serial NOT NULL,
	"result_type" "result_type" NOT NULL,
	"notes" text,
	"next_scheduled_date" timestamp,
	"is_fraud" boolean DEFAULT false,
	"completed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" serial NOT NULL,
	"role" "chat_role" NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"cnpj" varchar(18),
	"name" varchar(255) NOT NULL,
	"contact" varchar(255),
	"phone" varchar(20) NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(2) NOT NULL,
	"email" varchar(320),
	"status" "client_status" DEFAULT 'prospect',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"metrics_date" timestamp NOT NULL,
	"total_reminders" integer DEFAULT 0,
	"completed_reminders" integer DEFAULT 0,
	"converted_calls" integer DEFAULT 0,
	"conversion_rate" numeric(5, 2) DEFAULT '0.00',
	"not_attended_calls" integer DEFAULT 0,
	"rescheduled_calls" integer DEFAULT 0,
	"goal_met" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"file_url" varchar(500),
	"category" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"seller_id" integer,
	"import_batch_id" varchar(64),
	"status" "lead_status" DEFAULT 'new',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text,
	"type" "notification_type" DEFAULT 'info',
	"reminder_id" integer,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(20),
	"department" varchar(100),
	"daily_goal" integer DEFAULT 10,
	"status" "seller_status" DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"notes" text,
	"reminder_date" timestamp,
	"reminder_enabled" boolean DEFAULT true,
	"status" "task_status" DEFAULT 'pending',
	"priority" "priority" DEFAULT 'medium',
	"assigned_to" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);

*/