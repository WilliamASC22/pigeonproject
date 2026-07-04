# PigeonProject 🕊️

PigeonProject is a web-based messenger app where users can sign in, start direct chats, create group chats, and send saved messages through a Supabase backend.

The goal of the project is to build a public messaging app that is simple to use, cloud hosted, and privacy focused.

## What the app does

PigeonProject lets users:

- Create an account
- Log in
- See other registered users
- Start direct chats
- Create group chats
- Send and receive messages
- View saved message history after logging back in
- See the sender email under every message
- Log out

## How the app works

PigeonProject uses a Next.js frontend and a Supabase backend.

The frontend is the part users see in the browser. It handles the chat page, login page, buttons, message input, group chat form, message display, and logout button.

Supabase handles authentication, user profiles, chats, chat members, group members, and saved encrypted messages.

Vercel hosts the app online so users can access it through a public website.

## Main technologies

- Next.js
- React
- TypeScript
- Supabase Auth
- Supabase Database
- Supabase Realtime
- Vercel
- CSS
- Browser crypto tools

## Project structure

```txt
app/page.tsx
```

This is the main landing page.

```txt
app/login/page.tsx
```

This is the login page where users sign in.

```txt
app/chat/page.tsx
```

This is the main chat page. It shows users, saved chats, group chats, messages, and the logout button.

```txt
app/chat/chat.css
```

This file controls the chat page design.

```txt
src/lib/supabase.ts
```

This connects the app to Supabase.

```txt
src/lib/chat.ts
```

This contains the main chat functions, including getting users, creating profiles, loading saved chats, creating direct chats, creating group chats, sending messages, and loading messages.

```txt
src/lib/crypto.ts
```

This contains the message encryption and decryption functions.

## Database tables

The app uses four main Supabase tables.

### profiles

The `profiles` table stores basic user profile information.

It stores the user ID and email address.

### chats

The `chats` table stores direct chats and group chats.

A direct chat has `is_group` set to false.

A group chat has `is_group` set to true.

### chat_members

The `chat_members` table stores which users belong to each chat.

This is what allows the app to know which chats each user should see.

### messages

The `messages` table stores saved messages.

Messages are connected to a chat through `chat_id`.

Messages are connected to the sender through `sender_id`.

The app also stores encrypted message text and the encryption IV.

## Message flow

When a user sends a message:

1. The user types a message in the chat box.
2. The app encrypts the message in the browser.
3. The encrypted message is saved in Supabase.
4. Other users in the chat load the saved message.
5. The app decrypts the message in the browser.
6. The message appears in the chat.
7. The sender email appears under the message.

## Direct chat flow

When a user starts a direct chat:

1. The user clicks another registered user.
2. The app checks if a direct chat already exists between those two users.
3. If the chat already exists, the app opens it.
4. If it does not exist, the app creates a new direct chat.
5. Both users are added as chat members.
6. The chat appears under My Chats.

## Group chat flow

When a user creates a group chat:

1. The user clicks Create Group Chat.
2. The user chooses a group name.
3. The user selects other users to add.
4. The app creates a new group chat.
5. The app adds the creator and selected users as group members.
6. The group chat appears under My Chats.
7. Group members can send and view messages.

## Privacy and security

PigeonProject is designed to avoid storing plain readable messages in the database.

Messages are encrypted before being saved.

The database stores encrypted message text instead of normal readable message text.

This means the backend is not meant to read normal message content.

Important security note:

This project is not yet a replacement for apps like Signal, WhatsApp, or iMessage. The current version is a privacy-focused messaging app, but it has not been professionally audited. A future version should use stronger end-to-end encryption, user-owned private keys, secure key exchange, and a protocol similar to the Signal Protocol.

Do not use this version for highly sensitive or dangerous information.

## Current features

- User login
- User logout
- Direct chats
- Group chats
- Saved message history
- Encrypted saved messages
- Sender email shown under every message
- Public deployment through Vercel
- Supabase backend
- Realtime message updates

## Future improvements

- Stronger end-to-end encryption
- Real user key pairs
- Secure key exchange
- Secure group encryption
- Read receipts
- Typing indicators
- Profile pictures
- Message deletion
- File and image sharing
- Push notifications
- Better mobile design
- Account settings
- Password reset flow
- Professional security audit

## Running the project locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local app:

```txt
http://localhost:3000
```

## Environment variables

Create a file named:

```txt
.env.local
```

Add your Supabase project values:

```txt
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Do not share secret keys publicly.

Do not upload `.env.local` to GitHub.

## Deployment

The project is deployed with Vercel.

To update the live app:

```bash
git add .
git commit -m "Update PigeonProject"
git push
```

Vercel automatically redeploys the app after the push.

## Project purpose

PigeonProject was created to explore how a public messenger app can be built with free tools, saved cloud messages, direct chats, group chats, and privacy-focused encrypted message storage.

The project shows skills in frontend development, backend integration, authentication, database design, deployment, and secure app design.