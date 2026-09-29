This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

# EnglishAI Project Context

## Product

EnglishAI is a mobile application for learning and practicing English with
Artificial Intelligence.

The mobile application is being developed incrementally while the developer
learns React Native.

Do not generate large parts of the application at once.

Prefer small, understandable increments that can be reviewed and tested
before continuing.

The existing `dev-auth-ui` is a development client and a reference for
existing behavior and visual identity. Do not copy its DOM/CSS directly
into React Native.

---

## Existing Backend

The Backend already exists and is implemented with:

- Java 21
- Spring Boot
- PostgreSQL
- Flyway
- Spring Security
- JWT access tokens
- rotating refresh tokens
- Gemini and Ollama LLM providers
- Whisper Speech-to-Text
- Piper Text-to-Speech

The Backend is the source of truth for business rules.

Do not duplicate Backend business rules in the mobile application.

Do not modify the Backend unless the current mobile requirement demonstrates
a concrete need for a Backend change.

---

## Mobile stack

The mobile client uses:

- React Native
- Expo
- TypeScript
- StyleSheet initially
- fetch initially for HTTP
- Expo Router when navigation is introduced

Do not add Redux, Axios, form libraries, UI kits, or other dependencies
without a demonstrated need.

Before adding a dependency, explain:

1. what problem it solves;
2. why the existing platform APIs are insufficient;
3. whether it introduces native code;
4. whether a development build becomes necessary.

Follow the Expo SDK/version documentation requirements defined earlier in
this AGENTS.md.

---

## Learning-first development

The developer is learning React Native through this project.

When implementing a new React Native concept:

1. keep the increment small;
2. explain the concept;
3. show where it belongs;
4. implement only what the current task requires;
5. validate it;
6. stop before automatically implementing the next feature.

Prefer explicit code over premature abstractions.

Do not create folders, hooks, services, contexts, or components merely
because they may be useful later.

---

## Planned structure

Grow the structure only when needed.

As features are introduced, the application may evolve toward:

src/
  app/
  api/
  components/
  features/
  storage/
  theme/

Responsibilities:

- `src/app/`: Expo Router routes and layouts only.
- `src/api/`: Backend HTTP communication and HTTP-specific concerns.
- `src/components/`: genuinely reusable UI components.
- `src/features/`: feature-specific code.
- `src/storage/`: local persistence and secure session storage.
- `src/theme/`: shared visual tokens and theme configuration.

Do not create all directories in advance.

Keep business and HTTP logic out of Expo Router route files when it becomes
large enough to deserve separation.

---

## Development API

The Backend normally runs on port 8080.

Development addresses differ depending on where the app runs.

Examples:

Android emulator:
http://10.0.2.2:8080

Physical Android device:
http://<PC-LAN-IP>:8080

Do not assume `localhost` points to the development computer when the
application runs on Android.

The Backend base URL must eventually be configurable by environment.

Never put Backend secrets in the mobile application.

This includes:

- GEMINI_API_KEY
- JWT_SECRET
- PostgreSQL credentials
- SMTP credentials
- HMAC secrets

---

## Authentication

The Backend already provides:

- registration;
- e-mail verification;
- verification-code resend;
- login;
- token refresh;
- logout;
- password recovery;
- password reset;
- Google authentication.

The mobile client consumes these flows instead of reimplementing them.

Authentication should be implemented incrementally.

Initial order:

1. login UI;
2. local form state;
3. basic UX validation;
4. real login request;
5. authenticated request;
6. logout;
7. secure session storage;
8. refresh-token handling;
9. session restoration;
10. registration;
11. e-mail verification;
12. password recovery;
13. Google authentication later.

Do not implement all of these in one task.

---

## Session security

Planned session strategy:

- access token in memory;
- refresh token in secure device storage.

When secure persistence is introduced, prefer the appropriate
SDK-compatible Expo secure-storage solution after checking the current
Expo documentation as required by this file.

Never:

- persist passwords;
- persist verification/reset codes;
- log passwords;
- log access tokens;
- log refresh tokens;
- expose tokens in the UI.

The Backend rotates refresh tokens.

When refresh support is implemented, the client must replace the stored
refresh token after a successful refresh and must not intentionally reuse
the previous token.

Concurrent 401 responses must not trigger uncontrolled concurrent refresh
requests.

Do not implement this complexity before the session-management increment.

---

## HTTP behavior

Frontend validation exists for user experience only.

The Backend remains authoritative.

Handle HTTP failures according to the endpoint contract.

In particular, do not report every failure as invalid credentials.

Distinguish when possible between:

- validation errors;
- authentication errors;
- authorization errors;
- conflicts;
- rate limiting;
- server errors;
- network/connectivity errors.

Do not automatically retry non-idempotent operations after ambiguous
network failures unless the behavior is explicitly designed for it.

---

## Product flow

The intended high-level user flow is:

registration/login
→ e-mail verification when required
→ onboarding
→ home
→ practice
→ activity
→ evaluation
→ progress

Existing Backend capabilities include:

- authentication;
- profile;
- onboarding;
- predefined avatars;
- conversation scenarios;
- text conversation;
- conversation history;
- conversation evaluation;
- translation;
- correction;
- reading practice;
- vocabulary;
- progress;
- Speech-to-Text;
- Text-to-Speech;
- administration APIs.

The presence of a Backend feature does not mean it should be implemented
in the mobile client immediately.

Follow the current requested increment.

---

## Voice architecture

Whisper and Piper run on the server side in the current architecture.

The phone should not run those models locally.

The future voice flow is approximately:

microphone
→ mobile app
→ Backend
→ Whisper
→ conversation/LLM
→ Piper
→ Backend
→ mobile app audio playback

The mobile application will eventually handle:

- microphone permission;
- recording;
- upload;
- loading state;
- playback;
- temporary local files when necessary.

Before implementing audio, consult the Expo documentation matching the
installed SDK as required by the Expo rules above.

---

## UI and UX

EnglishAI is a language-learning application, not an administrative
dashboard.

Prefer:

- mobile-first layouts;
- clear visual hierarchy;
- touch-friendly controls;
- understandable loading states;
- useful error feedback;
- accessibility;
- keyboard-aware forms;
- consistent visual identity.

The application should eventually support light, dark, and system themes.

Do not attempt to reproduce the web development UI pixel-for-pixel.

---

## Forms

Forms should eventually:

- prevent duplicate submissions;
- expose loading state;
- display understandable validation errors;
- use appropriate mobile keyboard types;
- configure capitalization/autocorrection appropriately;
- support password visibility when useful;
- clear sensitive temporary state when appropriate.

Backend validation must still be respected.

---

## TypeScript

Avoid `any`.

Types representing API contracts should correspond to actual Backend DTOs.

Do not invent API fields.

When uncertain, inspect the real Backend request/response DTO before
implementing the mobile type.

Remember that TypeScript compile-time typing does not validate arbitrary
JSON received over the network.

---

## Git workflow

Keep changes focused on the current increment.

Before changes, inspect:

git status --short

Prefer explicit staging of the files involved in the task.

Do not automatically push unless explicitly requested.

Do not use force push during normal development.

---

## Definition of done

Before declaring an increment complete:

1. verify TypeScript;
2. run the lint command required by the Expo rules when available;
3. run relevant tests when they exist;
4. verify Expo can start/build the relevant bundle;
5. manually verify Android behavior when UI or native behavior changed;
6. inspect Git changes;
7. report what changed and what remains untested.

A feature is not considered complete merely because TypeScript compiles.

---

## Main development rule

Before implementing a task:

1. understand the existing implementation;
2. inspect the Backend contract when relevant;
3. consult the correct Expo SDK documentation when an Expo/React Native API
   is involved, as required earlier in this file;
4. implement only the requested increment;
5. avoid unrelated refactoring;
6. validate the result;
7. explain the relevant concepts;
8. stop before beginning the next feature automatically.

The goal is not to generate the entire mobile application as quickly as
possible.

The goal is to build EnglishAI incrementally while keeping the code
understandable, secure, maintainable, and suitable for a future production
Android application.
