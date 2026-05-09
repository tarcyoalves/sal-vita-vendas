import { pgTable, serial, text, integer, boolean, timestamp, real, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('driver'), // 'admin' | 'driver'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const drivers = pgTable('drivers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  cpf: text('cpf').notNull().unique(),
  plate: text('plate').notNull(),
  phone: text('phone').notNull(),
  status: text('status').notNull().default('pending'), // pending | approved | rejected
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const freights = pgTable('freights', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  cargoType: text('cargo_type').notNull().default('bigbag'), // bigbag | sacaria | granel
  originCity: text('origin_city').notNull(),
  originState: text('origin_state').notNull(),
  destinationCity: text('destination_city').notNull(),
  destinationState: text('destination_state').notNull(),
  distance: real('distance'),
  value: integer('value').notNull().default(0), // centavos
  weight: real('weight'),
  status: text('status').notNull().default('available'), // available | in_progress | completed | validated | paid
  createdBy: integer('created_by').notNull(),
  assignedDriverId: integer('assigned_driver_id'),
  validatedAt: timestamp('validated_at'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const freightInterests = pgTable(
  'freight_interests',
  {
    id: serial('id').primaryKey(),
    freightId: integer('freight_id').notNull(),
    driverId: integer('driver_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({ uniq: uniqueIndex('freight_interests_uniq').on(t.freightId, t.driverId) }),
);

export const driverLocations = pgTable('driver_locations', {
  id: serial('id').primaryKey(),
  driverId: integer('driver_id').notNull(),
  freightId: integer('freight_id').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

export const freightChats = pgTable('freight_chats', {
  id: serial('id').primaryKey(),
  freightId: integer('freight_id').notNull(),
  senderId: integer('sender_id').notNull(),
  senderRole: text('sender_role').notNull(), // admin | driver
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const freightDocuments = pgTable('freight_documents', {
  id: serial('id').primaryKey(),
  freightId: integer('freight_id').notNull(),
  driverId: integer('driver_id').notNull(),
  fileUrl: text('file_url').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Freight = typeof freights.$inferSelect;
export type FreightInterest = typeof freightInterests.$inferSelect;
export type DriverLocation = typeof driverLocations.$inferSelect;
export type FreightChat = typeof freightChats.$inferSelect;
export type FreightDocument = typeof freightDocuments.$inferSelect;
