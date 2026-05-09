import { router } from '../trpc';
import { authRouter } from './auth';
import { driversRouter } from './drivers';
import { freightsRouter } from './freights';
import { freightInterestsRouter } from './freightInterests';
import { locationsRouter } from './locations';
import { freightChatsRouter } from './freightChats';
import { freightDocumentsRouter } from './freightDocuments';

export const appRouter = router({
  auth: authRouter,
  drivers: driversRouter,
  freights: freightsRouter,
  freightInterests: freightInterestsRouter,
  locations: locationsRouter,
  freightChats: freightChatsRouter,
  freightDocuments: freightDocumentsRouter,
});

export type AppRouter = typeof appRouter;
