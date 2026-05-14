---
last_mapped: 2026-05-14
project: FRETEPRIME
---

# CONCERNS.md — Issues, Debt & Missing Features

## Critical Missing Features

### 1. Driver Portal (NO web frontend)
- Backend has `auth.registerDriver`, `auth.loginMobile`, `freightInterests`, `freightChats`, `freightDocuments` — but NO web UI for drivers
- Drivers can't self-register or login via web browser
- Mobile app assumed but doesn't exist yet

### 2. Admin Cannot Create Drivers Manually
- `drivers.ts` only has approve/reject/list — no `create` for admin
- If a driver doesn't have internet, admin can't add them

### 3. No Financial Page
- `freights.stats` exists but only counts by status
- No revenue report, total paid, pending payments

## Medium Priority Issues

### 4. Mobile Responsiveness Bug in App.tsx
- `window.innerWidth` called during render (not reactive to resize)
- Sidebar/bottom-nav don't adapt when screen resizes

### 5. No Pagination
- All freights and drivers fetched in one query — will be slow at scale

### 6. Map Tab is Placeholder
- FreightDetail "Map" tab shows lat/lng text, no actual Leaflet map

### 7. Document Validation Not Wired
- `freightDocuments.validate` exists in schema but not in router

### 8. AI Router Potential Issues
- `groqChat` has no timeout — could hang indefinitely
- `getOperationContext` fetches ALL freights on every AI call (expensive)

## Security Observations
- JWT secret must be set in Vercel env vars (GROQ_API_KEY also needed)
- `loginMobile` returns Bearer token — stored where in driver app? (localStorage = XSS risk)
- CORS limited to vercel.app + explicit ALLOWED_ORIGINS

## Tech Debt
- `FreightNew.tsx` `loadDate` and `direction` fields exist in schema but not in form
- FreightDetail `4-col grid` breaks on mobile
- No error boundaries — a crash in any page crashes the whole admin SPA
