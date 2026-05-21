import { pgTable, serial, text, integer, boolean, timestamp, real, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('driver'), // 'admin' | 'driver'
  status: text('status').notNull().default('active'), // 'active' | 'blocked'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const drivers = pgTable('drivers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  cpf: text('cpf').notNull().unique(),
  plate: text('plate').notNull(),
  phone: text('phone').notNull(),
  status: text('status').notNull().default('pending'), // pending | approved | rejected
  vehicleType: text('vehicle_type'),  // 'truck' | 'toco' | 'bitruck' | 'carreta' | 'outros'
  pixKey: text('pix_key'),
  score: real('score').default(0),
  totalFreights: integer('total_freights').notNull().default(0),
  isFavorite: boolean('is_favorite').notNull().default(false),
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
  loadDate: text('load_date'),       // ISO date string (pickup date)
  deliveryDate: text('delivery_date'), // ISO date string
  direction: text('direction').notNull().default('ida'), // 'ida' | 'retorno' | 'ambos'
  freightType: text('freight_type').notNull().default('completo'), // 'completo' | 'complemento'
  vehicleTypes: text('vehicle_types'), // JSON array e.g. '["carreta","toco"]'
  needsTarp: boolean('needs_tarp').notNull().default(false),
  needsTracker: boolean('needs_tracker').notNull().default(false),
  hasInsurance: boolean('has_insurance').notNull().default(true),
  paymentMethod: text('payment_method'), // 'pix' | 'avista' | 'prazo30' | 'prazo60' | 'a-combinar'
  valueNegotiable: boolean('value_negotiable').notNull().default(false),
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
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'rejected'
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
  type: text('type').notNull().default('comprovante'), // 'comprovante' | 'canhoto'
  validated: boolean('validated').notNull().default(false),
  validatedAt: timestamp('validated_at'),
  validatedBy: integer('validated_by'),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Freight = typeof freights.$inferSelect;
export type FreightInterest = typeof freightInterests.$inferSelect;
export type DriverLocation = typeof driverLocations.$inferSelect;
export type FreightChat = typeof freightChats.$inferSelect;
export type FreightDocument = typeof freightDocuments.$inferSelect;
