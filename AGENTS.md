# AGENTS.md

## Project

Photo Inbox V1.0.0 — React Native + Expo local-first photo manager.

## Rules

1. Keep photo processing local by default.
2. Do not add upload code without explicit product approval.
3. Screens must not execute raw SQL.
4. MediaLibrary calls live in service layer.
5. AI SDK calls live behind `src/services` or future `src/ai` interfaces.
6. Destructive deletion requires explicit user confirmation.
7. Do not auto-delete system photos.
8. Large photo lists must be virtualized.
9. Do not load full-resolution images for batch AI processing.
10. Add migrations when changing SQLite schema after V1.0.0.

## Core paths

```text
app/                       routes
src/db/database.ts         persistence
src/services/photoIndexer.ts media library
src/services/aiService.ts  AI abstraction
src/services/searchService.ts search
src/store/useAppStore.ts   global state
```

## Before completing a change

Run:

```bash
npm run typecheck
npm run doctor
```

For media/delete changes, validate on a physical Android/iOS device.

## Roadmap priority

1. pHash
2. OCR
3. Embedding search
4. DB pagination
5. background analysis
6. memory/trip clustering
