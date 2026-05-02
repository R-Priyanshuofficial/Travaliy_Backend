# 🔐 Authentication Module — Complete Documentation

> **Project:** Travaily Backend  
> **Stack:** NestJS + Prisma + PostgreSQL  
> **Created:** May 2026

---

## 📋 Table of Contents

1. [Project Architecture](#1-project-architecture)
2. [How NestJS Request Flow Works](#2-how-nestjs-request-flow-works)
3. [Folder Structure](#3-folder-structure)
4. [Database Schema — Prisma](#4-database-schema--prisma)
5. [Prisma Layer](#5-prisma-layer)
6. [DTO Layer — Validation](#6-dto-layer--validation)
7. [Auth Service — Business Logic](#7-auth-service--business-logic)
8. [Auth Controller — API Endpoints](#8-auth-controller--api-endpoints)
9. [Auth Module — Wiring Everything Together](#9-auth-module--wiring-everything-together)
10. [App Module — Root](#10-app-module--root)
11. [Environment Variables](#11-environment-variables)
12. [API Reference with Examples](#12-api-reference-with-examples)
13. [Error Handling](#13-error-handling)
14. [Key Libraries Used](#14-key-libraries-used)
15. [How to Run](#15-how-to-run)

---

## 1. Project Architecture

The project follows the **NestJS modular architecture** pattern:

```
Client Request
    │
    ▼
┌─────────────────────────┐
│    ValidationPipe        │  ← Validates request body using DTO decorators
│    (Global Middleware)   │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│    Controller            │  ← Receives HTTP request, calls service
│    (auth.controller.ts)  │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│    Service               │  ← Contains all business logic
│    (auth.service.ts)     │
└──────────┬──────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌──────────┐ ┌──────────┐
│ Prisma   │ │ JWT      │  ← Database access & token generation
│ Service  │ │ Service  │
└──────────┘ └──────────┘
     │
     ▼
┌──────────┐
│PostgreSQL│  ← Actual database
└──────────┘
```

**Why this pattern?**
- **Controller** = thin layer, only handles HTTP (routes, status codes)
- **Service** = fat layer, all logic lives here (hashing, OTP, DB queries)
- **DTO** = validation layer, rejects bad data before it reaches the controller
- **Prisma** = database layer, type-safe queries

---

## 2. How NestJS Request Flow Works

When a client sends `POST /auth/signup` with a JSON body:

```
1. NestJS receives the request
2. ValidationPipe kicks in → validates body against SignupDto class
   - If validation fails → returns 400 with error messages automatically
   - If validation passes → continues
3. AuthController.signup() is called with the validated DTO
4. Controller calls AuthService.signup(dto)
5. Service runs business logic (check user, hash password, save to DB, generate OTP)
6. Service returns response object
7. Controller returns it to the client as JSON
```

---

## 3. Folder Structure

```
travaily-backend/
├── prisma/
│   └── schema.prisma            ← Database models (User, OTP)
├── src/
│   ├── prisma/
│   │   ├── prisma.service.ts    ← Database connection service
│   │   └── prisma.module.ts     ← Makes PrismaService globally available
│   ├── auth/
│   │   ├── dto/
│   │   │   ├── index.ts             ← Barrel export (re-exports all DTOs)
│   │   │   ├── signup.dto.ts        ← Validates signup input
│   │   │   ├── login.dto.ts         ← Validates login input
│   │   │   ├── send-otp.dto.ts      ← Validates send-otp input
│   │   │   ├── verify-otp.dto.ts    ← Validates verify-otp input
│   │   │   ├── forgot-password.dto.ts  ← Validates forgot-password input
│   │   │   └── reset-password.dto.ts   ← Validates reset-password input
│   │   ├── auth.controller.ts   ← 6 POST route handlers
│   │   ├── auth.service.ts      ← All business logic
│   │   └── auth.module.ts       ← Registers JWT + controller + service
│   ├── app.module.ts            ← Root module (imports Prisma + Auth)
│   └── main.ts                  ← App entry point
├── .env                         ← Environment variables
└── api-test.http                ← API testing file (REST Client)
```

---

## 4. Database Schema — Prisma

**File:** `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id         String   @id @default(cuid())
  name       String
  email      String   @unique
  password   String
  isVerified Boolean  @default(false)
  createdAt  DateTime @default(now())

  otps       OTP[]
}

model OTP {
  id        String   @id @default(cuid())
  code      String
  expiresAt DateTime
  createdAt DateTime @default(now())

  userId    String
  user      User @relation(fields: [userId], references: [id])
}
```

### What each field does:

**User Model:**
| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String` | Unique identifier, auto-generated using CUID (collision-resistant unique ID) |
| `name` | `String` | User's full name |
| `email` | `String @unique` | User's email — **unique constraint** prevents duplicate accounts |
| `password` | `String` | Stores the **bcrypt hashed** password (never plain text) |
| `isVerified` | `Boolean` | `false` by default, becomes `true` after OTP verification |
| `createdAt` | `DateTime` | Auto-set to current timestamp when user is created |
| `otps` | `OTP[]` | One-to-many relation — a user can have multiple OTPs |

**OTP Model:**
| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String` | Unique identifier (CUID) |
| `code` | `String` | The 6-digit OTP code (e.g., "482951") |
| `expiresAt` | `DateTime` | When this OTP expires (10 minutes after creation) |
| `createdAt` | `DateTime` | When the OTP was generated |
| `userId` | `String` | Foreign key linking to the User |
| `user` | `User` | Relation back to the User model |

### Relationship:
```
User (1) ──────> (Many) OTP
  │                      │
  │  user.otps           │  otp.user
  │  (one user has       │  (each OTP belongs
  │   many OTPs)         │   to one user)
```

---

## 5. Prisma Layer

### 5.1 — `src/prisma/prisma.service.ts`

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**What it does:**
- **Extends `PrismaClient`** — so it has all Prisma methods (`this.prisma.user.findUnique()`, etc.)
- **`@Injectable()`** — makes it injectable into other NestJS services via constructor
- **`OnModuleInit`** — connects to PostgreSQL when the app starts
- **`OnModuleDestroy`** — disconnects cleanly when the app shuts down
- **Why extend instead of wrap?** — By extending, `PrismaService` IS a PrismaClient. You can call `prisma.user.create()` directly without a wrapper layer.

### 5.2 — `src/prisma/prisma.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

**What it does:**
- **`@Global()`** — makes `PrismaService` available to ALL modules without importing `PrismaModule` everywhere
- **`exports: [PrismaService]`** — allows other modules to inject PrismaService
- **Without `@Global()`** — every module would need `imports: [PrismaModule]` in its own `@Module()`

---

## 6. DTO Layer — Validation

DTOs (Data Transfer Objects) define **what shape the request body must have**. NestJS's `ValidationPipe` (enabled in `main.ts`) automatically validates incoming data against these classes.

### 6.1 — `signup.dto.ts`

```typescript
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}
```

**Decorators explained:**
| Decorator | What it checks |
|-----------|---------------|
| `@IsString()` | Value must be a string (not number, boolean, etc.) |
| `@IsNotEmpty()` | String cannot be empty (`""`) |
| `@IsEmail()` | Must be a valid email format (e.g., `user@domain.com`) |
| `@MinLength(6)` | String must be at least 6 characters |
| `!` after property | TypeScript definite assignment assertion (required for strict mode) |

**If validation fails**, NestJS automatically returns:
```json
{
  "statusCode": 400,
  "message": [
    "Name is required",
    "Please provide a valid email address",
    "Password must be at least 6 characters long"
  ],
  "error": "Bad Request"
}
```

### 6.2 — `login.dto.ts`
Validates: `email` (valid email) + `password` (min 6 chars)

### 6.3 — `send-otp.dto.ts`
Validates: `email` only

### 6.4 — `verify-otp.dto.ts`
Validates: `email` + `code` (exactly 6 characters using `@Length(6, 6)`)

### 6.5 — `forgot-password.dto.ts`
Validates: `email` only

### 6.6 — `reset-password.dto.ts`
Validates: `email` + `code` (6 chars) + `newPassword` (min 6 chars)

### 6.7 — `index.ts` (Barrel Export)

```typescript
export { SignupDto } from './signup.dto';
export { LoginDto } from './login.dto';
export { SendOtpDto } from './send-otp.dto';
export { VerifyOtpDto } from './verify-otp.dto';
export { ForgotPasswordDto } from './forgot-password.dto';
export { ResetPasswordDto } from './reset-password.dto';
```

**Why?** Instead of 6 separate imports:
```typescript
// ❌ Without barrel export
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
// ... 4 more lines

// ✅ With barrel export
import { SignupDto, LoginDto, SendOtpDto, ... } from './dto';
```

---

## 7. Auth Service — Business Logic

**File:** `src/auth/auth.service.ts`

This is the **core** of the auth module. All business logic lives here.

### 7.1 — Class Setup

```typescript
@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly OTP_EXPIRY_MINUTES = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}
```

| Property | Purpose |
|----------|---------|
| `SALT_ROUNDS = 10` | bcrypt hashing rounds — higher = more secure but slower. 10 is industry standard. |
| `OTP_EXPIRY_MINUTES = 10` | OTP expires after 10 minutes |
| `prisma` | Injected by NestJS — provides database access |
| `jwtService` | Injected by NestJS — provides JWT token creation |

### 7.2 — `signup()` Method

```typescript
async signup(dto: SignupDto) {
  // 1. Check if email already taken
  const existingUser = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });
  if (existingUser) {
    throw new BadRequestException('User with this email already exists');
  }

  // 2. Hash the password (NEVER store plain text)
  const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

  // 3. Create user in database
  const user = await this.prisma.user.create({
    data: {
      name: dto.name,
      email: dto.email,
      password: hashedPassword,  // stored as: "$2b$10$K9GZ..."
    },
  });

  // 4. Generate and store OTP for email verification
  const otpCode = this.generateOtp();
  await this.storeOtp(user.id, otpCode);

  // 5. Mock email (in production: use Nodemailer/SendGrid)
  console.log(`📧 [MOCK EMAIL] Verification OTP for ${user.email}: ${otpCode}`);

  // 6. Return user WITHOUT password
  return {
    success: true,
    message: 'User registered successfully...',
    user: this.excludePassword(user),
  };
}
```

**Flow:**
```
Input → Check duplicate → Hash password → Save to DB → Generate OTP → Store OTP → Return (no password)
```

### 7.3 — `login()` Method

```typescript
async login(dto: LoginDto) {
  // 1. Find user by email
  const user = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });
  if (!user) {
    throw new UnauthorizedException('Invalid email or password');
  }

  // 2. Compare plain password with hashed password
  const isPasswordValid = await bcrypt.compare(dto.password, user.password);
  if (!isPasswordValid) {
    throw new UnauthorizedException('Invalid email or password');
  }

  // 3. Generate JWT token
  const payload = { sub: user.id, email: user.email };
  const token = await this.jwtService.signAsync(payload);

  // 4. Return token + user info
  return {
    success: true,
    message: 'Login successful',
    token,
    user: this.excludePassword(user),
  };
}
```

**Why same error message for both cases?**  
Saying "Invalid email or password" for BOTH wrong email and wrong password prevents attackers from knowing which one was wrong (security best practice).

**JWT Payload:** `{ sub: "user_id", email: "user@email.com" }`  
- `sub` = "subject" — standard JWT claim for the user ID
- Token expires in 7 days (configured in `auth.module.ts`)

### 7.4 — `sendOtp()` Method

```typescript
async sendOtp(dto: SendOtpDto) {
  // 1. Find user
  // 2. Generate 6-digit OTP
  // 3. Store in DB (deletes old OTPs first)
  // 4. Log to console (mock email)
}
```

### 7.5 — `verifyOtp()` Method

```typescript
async verifyOtp(dto: VerifyOtpDto) {
  // 1. Find user by email
  // 2. Validate OTP (checks if exists + not expired)
  // 3. Mark user as verified (isVerified = true)
  // 4. Delete all OTPs for this user (cleanup)
}
```

### 7.6 — `forgotPassword()` Method

```typescript
async forgotPassword(dto: ForgotPasswordDto) {
  // 1. Find user by email
  // 2. Generate new OTP
  // 3. Store in DB
  // 4. Log to console (mock email)
}
```

### 7.7 — `resetPassword()` Method

```typescript
async resetPassword(dto: ResetPasswordDto) {
  // 1. Find user by email
  // 2. Validate OTP
  // 3. Hash new password
  // 4. Update user's password in DB
  // 5. Delete all OTPs (cleanup)
}
```

### 7.8 — Private Helper Methods

These are reusable methods used across multiple endpoints:

#### `generateOtp()`
```typescript
private generateOtp(): string {
  const otp = Math.floor(100000 + Math.random() * 900000);
  return otp.toString();
}
```
- Generates a number between 100000–999999 (always 6 digits)
- Returns as string (since OTP codes can start with "0" conceptually)

#### `storeOtp()`
```typescript
private async storeOtp(userId: string, code: string): Promise<void> {
  // Delete existing OTPs for this user (keep only latest)
  await this.prisma.oTP.deleteMany({ where: { userId } });

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

  await this.prisma.oTP.create({
    data: { code, expiresAt, userId },
  });
}
```
- **Deletes old OTPs first** — prevents OTP table from growing forever
- **Sets expiry** — current time + 10 minutes

#### `validateOtp()`
```typescript
private async validateOtp(userId: string, code: string): Promise<void> {
  const otp = await this.prisma.oTP.findFirst({
    where: { userId, code },
  });

  if (!otp) throw new BadRequestException('Invalid OTP');

  if (new Date() > otp.expiresAt) {
    await this.prisma.oTP.delete({ where: { id: otp.id } });
    throw new BadRequestException('OTP has expired. Please request a new one');
  }
}
```
- Checks if OTP exists for this user
- Checks if OTP hasn't expired
- Cleans up expired OTPs automatically

#### `excludePassword()`
```typescript
private excludePassword(user: { ... }) {
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}
```
- Uses **destructuring** to remove `password` from the user object
- **Security:** Never send hashed passwords in API responses

---

## 8. Auth Controller — API Endpoints

**File:** `src/auth/auth.controller.ts`

```typescript
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ... 4 more endpoints
}
```

**Key concepts:**

| Decorator | What it does |
|-----------|-------------|
| `@Controller('auth')` | All routes in this controller start with `/auth` |
| `@Post('signup')` | Creates a `POST /auth/signup` route |
| `@Body()` | Extracts the JSON body from the request |
| `@HttpCode(HttpStatus.OK)` | Returns `200` instead of default `201` for POST |

**Why `@HttpCode(200)` on login/verify/etc?**  
NestJS returns `201 Created` by default for POST requests. But login, verify, etc. are NOT creating resources — they're operations. So we explicitly set `200 OK`.

**The controller is intentionally thin** — it only:
1. Receives the request
2. Calls the service method
3. Returns the result

All logic lives in the service.

---

## 9. Auth Module — Wiring Everything Together

**File:** `src/auth/auth.module.ts`

```typescript
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

**What each part does:**

| Property | Purpose |
|----------|---------|
| `imports: [JwtModule]` | Registers the JWT module so `JwtService` can be injected |
| `global: true` | Makes `JwtService` available across the entire app |
| `secret` | The key used to sign/verify JWT tokens (from `.env`) |
| `signOptions.expiresIn` | Token expires after 7 days |
| `controllers` | Registers `AuthController` to handle HTTP requests |
| `providers` | Registers `AuthService` as an injectable service |

**Note:** `PrismaService` is NOT listed here because `PrismaModule` is `@Global()` — it's available everywhere automatically.

---

## 10. App Module — Root

**File:** `src/app.module.ts`

```typescript
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- **`PrismaModule`** — imported here once, then available globally (because of `@Global()`)
- **`AuthModule`** — registers all auth routes and services

---

## 11. Environment Variables

**File:** `.env`

```env
DATABASE_URL="postgresql://postgres:1234@localhost:5432/travaily"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
```

| Variable | Used By | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | Prisma | PostgreSQL connection string |
| `JWT_SECRET` | JwtModule | Secret key for signing JWT tokens |

**⚠️ In production:** Use a strong, random JWT_SECRET (32+ characters). Never commit real secrets to git.

---

## 12. API Reference with Examples

### POST `/auth/signup`

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully. Please verify your email with the OTP sent.",
  "user": {
    "id": "cmoolpsb80000gc16ubrh0y61",
    "name": "John Doe",
    "email": "john@example.com",
    "isVerified": false,
    "createdAt": "2026-05-02T17:14:09.428Z"
  }
}
```

**Terminal output:**
```
📧 [MOCK EMAIL] Verification OTP for john@example.com: 108495
```

---

### POST `/auth/login`

**Request:**
```json
{
  "email": "john@example.com",
  "password": "secret123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cmoolpsb80000gc16ubrh0y61",
    "name": "John Doe",
    "email": "john@example.com",
    "isVerified": false,
    "createdAt": "2026-05-02T17:14:09.428Z"
  }
}
```

---

### POST `/auth/send-otp`

**Request:**
```json
{ "email": "john@example.com" }
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email"
}
```

---

### POST `/auth/verify-otp`

**Request:**
```json
{
  "email": "john@example.com",
  "code": "108495"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

---

### POST `/auth/forgot-password`

**Request:**
```json
{ "email": "john@example.com" }
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset OTP sent successfully to your email"
}
```

---

### POST `/auth/reset-password`

**Request:**
```json
{
  "email": "john@example.com",
  "code": "382716",
  "newPassword": "newSecret456"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

## 13. Error Handling

NestJS provides built-in exception classes that automatically format error responses:

| Exception | HTTP Code | When Used |
|-----------|-----------|-----------|
| `BadRequestException` | `400` | Duplicate email, invalid OTP, expired OTP, user not found |
| `UnauthorizedException` | `401` | Wrong email/password during login |
| `ValidationPipe` errors | `400` | Invalid/missing fields in request body (automatic) |

**Error response format:**
```json
{
  "statusCode": 400,
  "message": "User with this email already exists",
  "error": "Bad Request"
}
```

**Validation error format (multiple errors):**
```json
{
  "statusCode": 400,
  "message": [
    "Name is required",
    "Please provide a valid email address",
    "Password must be at least 6 characters long"
  ],
  "error": "Bad Request"
}
```

---

## 14. Key Libraries Used

| Library | Purpose | How It's Used |
|---------|---------|--------------|
| **`@nestjs/common`** | Core NestJS decorators & exceptions | `@Controller`, `@Injectable`, `BadRequestException` |
| **`@nestjs/jwt`** | JWT token creation & verification | `JwtService.signAsync()` creates tokens |
| **`@prisma/client`** | Type-safe database queries | `prisma.user.create()`, `prisma.oTP.findFirst()` |
| **`bcrypt`** | Password hashing | `bcrypt.hash()` to hash, `bcrypt.compare()` to verify |
| **`class-validator`** | DTO validation decorators | `@IsEmail()`, `@MinLength()`, `@IsNotEmpty()` |
| **`class-transformer`** | Transforms plain objects to class instances | Used internally by ValidationPipe |

### How bcrypt works:
```
Signup:   "secret123"  →  bcrypt.hash()  →  "$2b$10$K9GZ..." (stored in DB)
Login:    "secret123"  →  bcrypt.compare("secret123", "$2b$10$K9GZ...")  →  true ✅
Login:    "wrong"      →  bcrypt.compare("wrong", "$2b$10$K9GZ...")      →  false ❌
```

### How JWT works:
```
Login:    { sub: "user_id", email: "..." }  →  JwtService.signAsync()  →  "eyJhbG..."
                                                                             │
                                               Uses JWT_SECRET to sign ──────┘
                                               Expires in 7 days
```

---

## 15. How to Run

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- Database `travaily` created

### Commands

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client (creates types from schema)
npx prisma generate

# 3. Run database migrations (creates User & OTP tables)
npx prisma migrate dev --name init

# 4. Start the dev server (with hot-reload)
npm run start:dev
```

### Verify it's running:
```
[Nest] LOG [RoutesResolver] AuthController {/auth}:
[Nest] LOG [RouterExplorer] Mapped {/auth/signup, POST} route
[Nest] LOG [RouterExplorer] Mapped {/auth/login, POST} route
[Nest] LOG [RouterExplorer] Mapped {/auth/send-otp, POST} route
[Nest] LOG [RouterExplorer] Mapped {/auth/verify-otp, POST} route
[Nest] LOG [RouterExplorer] Mapped {/auth/forgot-password, POST} route
[Nest] LOG [RouterExplorer] Mapped {/auth/reset-password, POST} route
[Nest] LOG [NestApplication] Nest application successfully started
```

### View database:
```bash
npx prisma studio
```
Opens a browser UI at `http://localhost:5555` where you can see all users and OTPs.

---

> **📝 Note:** Email sending is currently mocked with `console.log()`. To add real email, integrate Nodemailer with an SMTP provider (Gmail, SendGrid, etc.) and replace the `console.log` calls in `auth.service.ts`.
