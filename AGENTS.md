# EnglishAI - Agent Instructions

## Current phase

The current phase is **FASE 8 — Validação pré-mobile**. Do not start React Native or future phases without an explicit request.

Before work, read ROADMAP.md, ARCHITECTURE.md, DEVELOPMENT.md and, when relevant, API_V1_CONTRACT.md, STABILITY_PERFORMANCE_REPORT.md and ADMIN_GUIDE.md.

Preserve public endpoints, DTOs and authentication. Use incremental Flyway migrations and keep ddl-auto=validate. Keep controllers thin and keep the domain dependent on LlmProvider. Whisper is STT and Piper is TTS; audio and WAV are not persisted. The Backend is the source of truth for persistent conversations and history. Admin routes under /api/v1/admin/** require role ADMIN. Never log secrets, tokens, prompts, messages, audio or images.

After Backend changes run mvn test. For the web UI run node --check dev-auth-ui/app.js.

Role policy: USER < ADMIN < SUPER_ADMIN is cumulative. ADMIN and SUPER_ADMIN retain all normal user capabilities. Only SUPER_ADMIN may manage user roles; SUPER_ADMIN is assigned only by SUPER_ADMIN_BOOTSTRAP_EMAIL, never through the admin API.

Bootstrap safety: there may be at most one SUPER_ADMIN. Never create or transfer it automatically, never assign it through the admin API, and preserve the existing-account-only behavior of SUPER_ADMIN_BOOTSTRAP_EMAIL.
