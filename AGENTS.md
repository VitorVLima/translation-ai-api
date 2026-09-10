# EnglishAI Project Instructions

## Project Goal

EnglishAI is an application focused on helping users learn English with AI-assisted features.

The application should support, over time:

* user registration and authentication
* English conversation practice
* text translation
* grammar correction
* grammar explanations
* vocabulary learning
* examples of word usage
* exercises
* progress tracking
* voice interaction
* speech-to-text
* text-to-speech
* real-time conversations
* AI provider abstraction

The initial version must be built incrementally.

Do not implement the entire roadmap at once.

---

## Technology Stack

### Backend

* Java 21
* Spring Boot 4
* Maven
* PostgreSQL
* Spring Data JPA
* Spring Security
* Flyway
* Jakarta Validation
* Docker / Docker Compose

### Frontend

Planned:

* React Native

Frontend is not implemented yet.

### AI

Initial provider planned:

* Ollama

Future providers may include:

* Gemini
* OpenAI

The application must not be tightly coupled to any specific AI provider.

---

## Architecture

Use a modular monolith with principles from:

* Hexagonal Architecture
* Ports and Adapters
* Clean Architecture

Main layers:

```text
domain
application
presentation
infrastructure
```

### Domain

Contains core business models and rules.

The domain must not depend on:

* Spring
* JPA
* PostgreSQL
* Docker
* Ollama
* Gemini
* OpenAI
* HTTP
* REST

### Application

Contains:

* use cases
* application services
* ports/interfaces
* application-level exceptions

Examples:

```text
RegisterUser
CreateUser
LoginUser
UserRepository
PasswordEncoder
LlmProvider
```

The application layer must not directly depend on infrastructure implementations.

### Infrastructure

Contains implementation details such as:

* Spring Data JPA
* PostgreSQL
* BCrypt
* AI providers
* external APIs
* security implementation
* configuration

Examples:

```text
UserJpaRepository
UserRepositoryAdapter
BCryptPasswordEncoderAdapter
OllamaProvider
```

### Presentation

Contains:

* REST controllers
* request DTOs
* response DTOs
* exception handlers
* WebSocket handlers

Controllers must stay thin.

Business logic must not be placed inside controllers.

---

## Dependency Direction

Preferred dependency direction:

```text
presentation
      ↓
application
      ↓
domain

infrastructure
      ↓
application/domain
```

Application defines ports.

Infrastructure implements those ports.

---

## Current Project State

The project is currently in the authentication foundation phase.

Already implemented:

* PostgreSQL connection
* Docker Compose for PostgreSQL
* Flyway migration for users
* User domain model
* UserEntity
* UserRepository port
* Spring Data JPA repository
* persistence mapper
* repository adapter
* PasswordEncoder port
* BCrypt adapter
* CreateUser use case
* RegisterUser use case
* registration REST endpoint
* RegisterRequest
* UserResponse
* Bean Validation
* duplicate email handling
* duplicate username handling
* GlobalExceptionHandler
* Spring Security base configuration
* unit/integration tests for parts of registration

Current endpoint:

```text
POST /api/v1/auth/register
```

Registration currently:

```text
HTTP request
    ↓
RegisterRequest validation
    ↓
AuthController
    ↓
RegisterUser
    ↓
PasswordEncoder
    ↓
CreateUser
    ↓
UserRepository
    ↓
JPA
    ↓
PostgreSQL
```

---

## Current Roadmap

Development should follow this order unless explicitly instructed otherwise.

### Phase 1 - Authentication Foundation

Completed:

1. Project foundation
2. PostgreSQL
3. Flyway
4. User model
5. Persistence layer
6. Password hashing
7. User registration
8. Registration validation
9. Registration exception handling

Next:

10. LoginRequest
11. InvalidCredentialsException
12. LoginUser use case
13. Login endpoint
14. Login tests

Only after login works:

15. JWT token generation
16. JWT validation
17. JWT authentication filter
18. Protect authenticated endpoints
19. GET /api/v1/users/me
20. Refresh token strategy

Do not skip directly to JWT before the login flow works.

### Phase 2 - User Features

Later:

* get current user
* update profile
* change password
* password recovery
* email verification

### Phase 3 - AI Foundation

Later:

* LlmProvider port
* LlmRequest
* LlmResponse
* OllamaProvider
* configuration-based provider selection

Possible providers:

```text
OllamaProvider
GeminiProvider
OpenAiProvider
```

The rest of the application must depend on `LlmProvider`, not directly on Ollama, Gemini or OpenAI.

### Phase 4 - Learning Features

Later:

* translation
* grammar correction
* grammar explanation
* vocabulary
* definitions
* examples
* conversation practice

### Phase 5 - Voice

Later:

* SpeechToTextProvider
* TextToSpeechProvider
* voice commands
* real-time communication
* WebSocket

### Phase 6 - Progress and Exercises

Later:

* exercises
* answers
* vocabulary review
* progress tracking

### Phase 7 - Frontend

React Native client.

---

## AI Commands Planned

Possible user intents:

```text
TRANSLATE
CORRECT
EXPLAIN
DEFINE
EXAMPLE
REPEAT
SLOW_DOWN
SPEED_UP
CONVERSATION
```

Not every command should invoke an LLM.

Use normal application logic when AI is unnecessary.

---

## Database Direction

Planned relationships:

```text
User
 ├── Conversations
 │      └── Messages
 ├── Vocabulary
 ├── Exercises
 └── Progress
```

Do not create all database tables prematurely.

Add migrations when the corresponding feature is implemented.

---

## Security Rules

Never expose or log:

* raw passwords
* password hashes
* JWT secrets
* API keys
* database credentials
* refresh tokens

Passwords must always be hashed before persistence.

AI provider API keys must remain in the backend.

The mobile frontend must never contain provider secrets.

Use environment variables for secrets in production.

---

## Testing Rules

Every new use case should have tests.

Prefer:

* unit tests for application logic
* integration tests for persistence
* controller tests for HTTP behavior

Do not call real AI providers in unit tests.

Use:

* mocks
* fakes
* stub implementations

Tests must not depend on pre-existing database records.

Avoid fixed test data that causes duplicate-user failures across repeated executions.

---

## Coding Rules

Use constructor injection.

Avoid field injection.

Prefer small classes with one clear responsibility.

Do not put business logic in:

* controllers
* JPA repositories
* configuration classes

Avoid unnecessary abstractions.

Do not introduce microservices.

Do not introduce event-driven architecture unless explicitly requested.

Do not introduce new frameworks or libraries without explaining why they are needed.

Do not replace the existing architecture without explicit approval.

---

## Working Style

This rule is extremely important.

Work incrementally.

Do not implement multiple roadmap stages at once.

When given a task:

1. Inspect the relevant existing code.
2. Explain what you found.
3. Identify the smallest next implementation step.
4. Implement only the requested step.
5. Run or suggest the relevant tests.
6. Report exactly what changed.
7. Stop.

Do not automatically continue to the next feature.

Wait for a new instruction before implementing the next roadmap item.

For example, if asked to implement login:

Do not also implement:

* JWT
* refresh tokens
* authorization roles
* email verification
* password recovery

unless explicitly requested.

---

## Before Modifying Code

Before making significant changes:

* inspect existing classes
* preserve current naming conventions
* preserve current package organization
* reuse existing ports when appropriate
* avoid duplicate abstractions

If the request is ambiguous, prefer the smallest change that follows the existing architecture.

---

## Review Mode

If asked to review or analyze:

* do not modify files
* identify architectural issues
* identify bugs
* identify security concerns
* identify missing tests
* suggest the next smallest improvement

Separate:

* critical issues
* recommended improvements
* optional improvements

---

## Teaching Mode

The project owner is learning software development.

When explaining code:

* explain why a class belongs in a specific layer
* explain dependency direction
* explain important Spring concepts
* explain security decisions
* avoid making large unexplained changes

Prefer code that is understandable over overly clever solutions.

---

## Current Next Task

Unless explicitly changed by the project owner, the next feature to implement is:

```text
Login flow without JWT
```

Expected progression:

```text
LoginRequest
    ↓
LoginUser
    ↓
UserRepository.findByEmail
    ↓
PasswordEncoder.matches
    ↓
InvalidCredentialsException
    ↓
POST /api/v1/auth/login
```

JWT must be implemented only after this flow is working and tested.
