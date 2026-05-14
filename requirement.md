# Codex Task: Implement SealNote Secure Note PWA MVP

## Project

SealNote / Secure Note PWA / Encrypted Vault

---

# Goal

Implement an MVP secure note app with client-side encryption.

Core rules:

- Server stores ciphertext only
- Master Password never leaves browser
- Encryption/decryption only happens client-side
- No plaintext notes, Vault Key, KEK, or Master Password in localStorage / IndexedDB

---

# Stack

Use existing repo conventions. If no implementation exists yet, use:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Auth.js / NextAuth with Google OAuth
- PostgreSQL
- Prisma or Drizzle (prefer whichever already exists)
- Web Crypto API

Release target:

- Use latest stable compatible package versions at implementation time.
- Prefer `create-next-app@latest` for project scaffold.
- Prefer Tailwind CSS v4 setup for new project.
- Prefer shadcn/ui `new-york` style with Tailwind v4 and React 19.
- Use Node version satisfying both Next.js and Prisma requirements.
- Pin generated lockfile for reproducible release builds.

Current verified package baseline on 2026-05-13:

```text
next 16.2.6
react 19.2.6
react-dom 19.2.6
next-auth 4.24.14
@auth/prisma-adapter 2.11.2
prisma 7.8.0
@prisma/client 7.8.0
tailwindcss 4.3.0
@tailwindcss/postcss 4.3.0
lucide-react 1.14.0
zod 4.4.3
vitest 4.1.6
typescript 6.0.3
```

Note: use `@latest` during scaffold, then review compatibility and lock exact versions.

---

# UI / UX Direction

SealNote should feel calm, private, and work-focused.

Use:

- quiet productivity UI, not marketing-heavy layout
- Soft Editorial / Swiss Modernism direction
- shadcn/ui components, Lucide icons, accessible forms
- off-white/light slate surfaces with high-contrast ink text
- one restrained security accent, preferably blue or blue-green
- compact vault dashboard after login
- first screen should be usable app shell, not landing page

Avoid:

- purple gradient hero
- decorative orbs/blobs
- oversized marketing cards
- emoji icons
- placeholder-only form inputs

---

# MVP Scope

Implement:

1. Google login
2. Vault setup
3. Master Password unlock
4. PBKDF2-SHA256 KEK derivation
5. Random 256-bit Vault Key generation
6. encrypted_vault_key stored in DB
7. encrypted_check for password validation
8. Note CRUD
9. AES-GCM encryption before save
10. Client-side decryption after unlock
11. Basic sensitive note mask/reveal
12. Basic auto-lock

Do NOT implement yet:

- Passkey
- Biometric
- Blind index
- Sharing
- Recovery flow
- CRDT sync
- Collaboration
- Multi-device trust model

---

# Security Architecture

Use this key hierarchy:

```text
Master Password
↓ PBKDF2-SHA256
KEK
↓ decrypt
Vault Key
↓ encrypt/decrypt
Notes
```

---

# Crypto Rules

- AES-GCM
- 96-bit random IV per encryption
- Never reuse IV with the same key
- PBKDF2-SHA256 for MVP
- Store KDF params in vault_meta
- Use AAD for note encryption

AAD format:

```text
user:{userId}:note:{noteId}:v:{cryptoVersion}
```

---

# Database Schema

## users

```sql
users
- id
- google_id
- email
- created_at
- updated_at
```

## vault_meta

```sql
vault_meta
- user_id
- salt
- kdf_algo
- kdf_params
- encrypted_vault_key
- vault_key_iv
- encrypted_check
- check_iv
- crypto_version
- schema_version
- created_at
- updated_at
```

## notes

```sql
notes
- id
- user_id
- ciphertext
- iv
- aad
- is_sensitive
- lock_mode
- created_at
- updated_at
- deleted_at
```

---

# Recommended Folder Structure

```text
src/
├── app/
├── components/
├── features/
│   ├── auth/
│   ├── vault/
│   ├── notes/
│   └── crypto/
├── lib/
│   ├── crypto/
│   ├── db/
│   ├── auth/
│   └── security/
├── server/
└── types/
```

---

# Crypto Module Structure

Create client-only crypto utilities:

```text
src/lib/crypto/
├── aes.ts
├── kdf.ts
├── vault.ts
├── encoding.ts
├── random.ts
└── types.ts
```

Requirements:

- Encoding helpers must centralize Uint8Array/base64/string conversion
- Crypto functions must not import server-only code
- Server code must never decrypt notes
- No plaintext logging

---

# Vault Lifecycle

## First-time setup

```text
1. User logs in with Google
2. User creates Master Password
3. Browser generates salt
4. Browser derives KEK
5. Browser generates Vault Key
6. Browser encrypts Vault Key using KEK
7. Browser creates encrypted_check
8. Server stores vault_meta
```

---

## Unlock flow

```text
1. Browser loads vault_meta
2. User enters Master Password
3. Browser derives KEK
4. Browser decrypts Vault Key
5. Browser validates encrypted_check
6. Vault becomes unlocked in memory only
```

---

## Save note flow

```text
1. User writes note
2. Browser builds JSON payload
3. Browser encrypts payload with Vault Key
4. Browser sends ciphertext, IV, AAD, metadata to server
5. Server stores encrypted note
```

---

# Note Payload

Encrypt this full payload as JSON:

```json
{
  "title": "string",
  "body": "string",
  "tags": [],
  "type": "note",
  "fields": {}
}
```

---

# State Management Rules

- Decrypted Vault Key may live only in memory
- Decrypted notes may live only in memory
- Refreshing tab should lock vault again
- Do not persist decrypted state
- Do not decrypt in:
  - Server Components
  - Route Handlers
  - API routes

Forbidden:

```text
❌ localStorage plaintext
❌ persisted Zustand plaintext
❌ IndexedDB plaintext
```

---

# IndexedDB / PWA Rules

For MVP, either skip IndexedDB or store ciphertext only.

Never store:

- plaintext notes
- Master Password
- KEK
- Vault Key

---

# Sensitive Notes

Sensitive note is a UX/privacy layer, not a cryptographic boundary.

Implement:

- masked by default
- reveal button
- optional Master Password re-entry before reveal if simple
- auto-hide after timeout

---

# Threat Model

## Protects Against

```text
✔ DB leak
✔ Backup leak
✔ Server-side plaintext access
✔ Admin reading PostgreSQL
✔ Network interception
✔ Lost server snapshot
```

## Does NOT Fully Protect Against

```text
❌ XSS while unlocked
❌ Malicious browser extension
❌ Malware on user device
❌ Weak Master Password
❌ Frontend supply-chain attack
❌ Phishing
```

---

# Security Hardening

Add baseline protections:

- no dangerouslySetInnerHTML
- no plaintext logs
- no decrypted analytics
- secure cookies for Auth.js
- avoid sending plaintext to error tracking

If easy, add CSP headers:

```http
Content-Security-Policy:
default-src 'self';
script-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
```

---

# Explicitly Forbidden

```text
❌ Send Master Password to backend
❌ Encrypt/decrypt on server
❌ Use Google token as encryption key
❌ Store Vault Key in localStorage
❌ Store plaintext in IndexedDB
❌ Reuse AES-GCM IV
❌ Log plaintext
❌ Send plaintext to analytics
```

---

# Acceptance Criteria

Implementation is acceptable when:

- User can log in
- User can set up a vault
- Master Password is never sent to backend
- Vault can be unlocked client-side
- Notes are saved as ciphertext in DB
- Server never receives plaintext note content
- User can create/edit/delete notes
- Refreshing page locks vault again
- Wrong Master Password fails unlock
- AES-GCM IV is generated fresh per encryption
- No localStorage plaintext usage exists
- Crypto helpers have basic tests if test framework exists

---

# Testing

Add tests for:

- base64/Uint8Array conversion
- PBKDF2 derive returns usable CryptoKey
- AES-GCM encrypt/decrypt roundtrip
- decrypt fails with wrong key
- decrypt fails with wrong AAD
- IV generation length = 12 bytes

---

# Deliverables

1. Code changes
2. DB migration
3. Crypto helper tests
4. README section explaining:
   - vault setup
   - unlock flow
   - what is intentionally not implemented yet

---

# Implementation Guidance

Recommended order:

## Phase 1 — Foundation

```text
1. Next.js setup
2. Auth.js
3. PostgreSQL
4. Prisma/Drizzle
5. users schema
6. vault_meta schema
```

## Phase 2 — Crypto Core

```text
1. PBKDF2 derive
2. AES-GCM encrypt/decrypt
3. Vault Key generation
4. encrypted_check
5. Unlock flow
```

## Phase 3 — Notes

```text
1. Create note
2. Encrypt payload
3. Save ciphertext
4. Fetch ciphertext
5. Client-side decrypt
6. Edit/Delete
```

## Phase 4 — UX Security

```text
1. Sensitive mask
2. Auto lock
3. Clipboard clear
4. Blur on inactive
```

---

# Critical Implementation Risks

## 1. Encoding Bugs

Examples:

```text
string ↔ bytes
base64 ↔ Uint8Array
UTF-8 mismatch
```

Recommendation:

```text
Centralize encoding helpers
```

---

## 2. IV Reuse

Always generate fresh IV:

```ts
crypto.getRandomValues(new Uint8Array(12))
```

---

## 3. SSR/Hydration Leakage

Rule:

```text
Decryption must happen client-side only
```

Never decrypt in:

```text
❌ Server Components
❌ Route Handlers
❌ API layer
```

---

## 4. Analytics Leakage

Watch carefully:

```text
❌ console.log
❌ Sentry
❌ analytics
❌ error tracking
```

Never send plaintext externally.

---

# Recovery Warning

Must clearly communicate during setup:

```text
If user forgets Master Password,
vault cannot be recovered.
```

---

# Final Summary

```text
This application treats encryption as a client-only responsibility.

Google Login proves identity.
Master Password derives KEK.
KEK unlocks Vault Key.
Vault Key encrypts notes.
Server stores ciphertext only.

Database compromise should not expose note contents.
Server should never see plaintext.

The biggest practical security risk is XSS while the vault is unlocked.
```
