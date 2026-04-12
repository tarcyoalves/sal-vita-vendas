import { scheduleNotificationJobs } from "../notification-service";

let jobsInitialized = false;

export function initializeBackgroundJobs() {
  if (jobsInitialized) {
    console.log("[Jobs] Background jobs already initialized");
    return;
  }

  try {
    console.log("[Jobs] Initializing background jobs...");
    scheduleNotificationJobs();
    jobsInitialized = true;
    console.log("[Jobs] Background jobs initialized successfully");
  } catch (error) {
    console.error("[Jobs] Error initializing background jobs:", error);
  }
}
