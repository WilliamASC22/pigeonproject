# PigeonProject 🕊️

PigeonProject is a web-based messenger app where users can sign in, start direct chats, create group chats, send saved encrypted messages, use a full emoji picker, and place browser-based voice or video calls through a Supabase-backed app.

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
- Use a full emoji picker
- Start voice calls
- Start video calls
- Answer incoming calls while the app is open
- Log out

## How the app works

PigeonProject uses a Next.js frontend and a Supabase backend.

The frontend is the part users see in the browser. It handles the login page, chat page, group chat form, emoji picker, call buttons, message input, message display, and logout button.

Supabase handles authentication, user profiles, chats, chat members, saved messages, realtime updates, and signaling messages used to help establish browser-based calls.

Vercel hosts the app online so users can access it through a public website.

## Main technologies

- Next.js
- React
- TypeScript
- Supabase Auth
- Supabase Database
- Supabase Realtime
- WebRTC
- Vercel
- CSS
- Browser crypto tools
- emoji-picker-element

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

This is the main chat page. It shows chats, users, group chat creation, messages, emoji picker, call controls, incoming call UI, and active call UI.

```txt
app/chat/chat.css
```

This file controls the chat page design and layout.

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

This contains the message encryption and decryption functions used for stored messages.

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

## User discovery

Right now, every signed-up user appears in the user list for every other signed-in user.

That means this version does not yet have a private contacts-only system.

A future version should use a contacts table, friend request flow, invite flow, or approved contact system so users only see people they have added.

## Message flow

When a user sends a message:

1. The user types a message in the chat box.
2. The user can optionally choose emoji from the emoji picker.
3. The app encrypts the message in the browser.
4. The encrypted message is saved in Supabase.
5. Other users in the chat load the saved message.
6. The app decrypts the message in the browser.
7. The message appears in the chat.
8. The sender email appears under the message.

## Direct chat flow

When a user starts a direct chat:

1. The user clicks another registered user.
2. The app checks if a direct chat already exists between those two users.
3. If the chat already exists, the app opens it.
4. If it does not exist, the app creates a new direct chat.
5. Both users are added as chat members.
6. The chat appears under Chats.

## Group chat flow

When a user creates a group chat:

1. The user clicks New group.
2. The user chooses a group name.
3. The user selects other users to add.
4. The app creates a new group chat.
5. The app adds the creator and selected users as group members.
6. The group chat appears under Chats.
7. Group members can send messages and join calls.

## Emoji picker flow

When a user clicks the emoji button:

1. The app opens a full emoji picker.
2. The user selects any available emoji.
3. The selected emoji is inserted into the message input.
4. The user can continue typing and send the message normally.

## Calling flow

PigeonProject supports browser-based voice and video calling through WebRTC.

When a user starts a call:

1. The user opens a direct chat or group chat.
2. The user clicks Call or Video.
3. The app starts local microphone access for voice calls.
4. The app starts microphone and camera access for video calls.
5. The app sends signaling events through Supabase Realtime broadcast.
6. Other participants who have the app open can receive the incoming call interface.
7. When another participant answers, the browsers exchange WebRTC offer, answer, and ICE candidate data.
8. The media connection is created directly between participants.
9. The call UI shows active participants and media streams.

## Voice calls

Voice calls show participant cards and use audio streams between browsers.

## Video calls

Video calls show video tiles for the local user and connected remote users.

## Privacy and security

PigeonProject is designed to avoid storing plain readable messages in the database.

Messages are encrypted before being saved.

The database stores encrypted message text instead of normal readable message text.

This means the backend is not meant to read normal message content.

Calls use browser WebRTC connections, which are designed for peer-to-peer media exchange after signaling is completed.

Important security note:

This project is not yet a replacement for apps like Signal, WhatsApp, or iMessage. The current version is a privacy-focused messaging app, but it has not been professionally audited. A future version should use stronger end-to-end encryption, user-owned private keys, secure key exchange, better call authentication, and a protocol closer to production-grade secure messengers.

Do not use this version for highly sensitive or dangerous information.

## Current limitations

- Every signed-up user appears in the user list
- Incoming call UI only appears if the other user already has the app open
- Calls depend on browser microphone and camera permissions
- Some browsers, networks, or device settings may block WebRTC behavior
- This version has not had a professional security audit
- Message encryption is still a custom project implementation, not a full Signal-style protocol
- Background notifications and true offline ringing are not implemented yet

## Current features

- User login
- User logout
- Direct chats
- Group chats
- Saved message history
- Encrypted saved messages
- Sender email shown under every message
- Full emoji picker
- Public deployment through Vercel
- Supabase backend
- Realtime message updates
- Browser-based voice calls
- Browser-based video calls
- Incoming call UI
- Active call UI for direct and group chats

## Future improvements

- Stronger end-to-end encryption
- Real user key pairs
- Secure key exchange
- Secure group encryption
- Contacts or friend request system
- Push notifications
- Background call notifications
- Missed call records
- Read receipts
- Typing indicators
- Profile pictures
- Message deletion
- File and image sharing
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

## Browser permissions

For calling to work, the browser must be allowed to use:

- Microphone for voice calls
- Microphone and camera for video calls

If permissions are denied, calls will not start correctly.

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

PigeonProject was created to explore how a public messenger app can be built with free tools, saved cloud messages, direct chats, group chats, emoji support, browser-based calling, and privacy-focused encrypted message storage.

The project shows skills in frontend development, backend integration, authentication, database design, realtime systems, WebRTC signaling, deployment, and secure app design.