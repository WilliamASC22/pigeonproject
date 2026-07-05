# PigeonProject 🕊️

PigeonProject is a web-based encrypted messenger app built with Next.js, Supabase, and Vercel.

The project lets users create an account, choose a username, add contacts by username, accept or reject contact requests, start direct chats, create group chats, send saved encrypted messages, use emoji and preset GIF-style reactions, and place browser-based voice or video calls.

The goal of PigeonProject is to build a real public messaging app that is simple to use, cloud hosted, privacy focused, and designed so normal message content is not stored in readable form on the backend.

## Current status

PigeonProject is a working web app in development.

It is deployed publicly through Vercel and uses Supabase for authentication, database storage, realtime updates, and call signaling.

The app currently supports:

• Public login and account creation  
• Username setup  
• Contacts by username  
• Contact requests with accept and reject  
• A 1-minute wait before someone can resend a rejected or repeated request  
• Direct chats with accepted contacts  
• Group chat creation from accepted contacts  
• Saved encrypted message history  
• Browser-based encryption before messages are saved  
• Per-user encryption setup with an encryption password  
• Per-chat encrypted chat keys  
• Emoji picker  
• Preset GIF-style reaction messages  
• Browser-based voice calls  
• Browser-based video calls  
• Incoming call UI while the app is open  
• Separate Contacts page  
• Separate Groups page  
• Public deployment through Vercel  

## Important security note

PigeonProject is privacy focused, but it is not government-certified, professionally audited, or a replacement for Signal, WhatsApp, or iMessage.

The app uses strong browser cryptography patterns, including AES-256-GCM message encryption, ECDH P-256 key agreement, HKDF-SHA-256 key derivation, and PBKDF2-SHA-256 for protecting each user’s private key with an encryption password.

However, this project has not gone through a professional security audit, formal penetration test, or FIPS/government certification process.

Do not use this version for highly sensitive, dangerous, legal, medical, financial, or life-safety information.

A safer public description is:

PigeonProject uses browser-based end-to-end encryption with user-owned encryption keys and encrypted saved messages.

Do not claim:

PigeonProject is impossible to hack.

Do not claim:

PigeonProject is government-certified.

Do not claim:

PigeonProject is Signal-level secure.

## How the app works

PigeonProject uses a Next.js frontend and a Supabase backend.

The frontend is the part users see in the browser. It handles login, chat, contacts, groups, encryption setup, message input, message display, emoji picker, call controls, incoming call UI, and active call UI.

Supabase handles authentication, user profiles, usernames, contacts, contact requests, chats, chat members, saved encrypted messages, encrypted chat keys, realtime message updates, and signaling messages used to help establish browser-based calls.

Vercel hosts the app online so users can access it through a public website.

## Main technologies

• Next.js  
• React  
• TypeScript  
• Supabase Auth  
• Supabase Database  
• Supabase Realtime  
• Supabase Row Level Security  
• Web Crypto API  
• WebRTC  
• Vercel  
• CSS  
• Tailwind CSS  
• emoji-picker-element  

## Project structure

```txt
app/page.tsx
```

This is the main landing page.

```txt
app/login/page.tsx
```

This is the login page where users sign in or create an account.

```txt
app/chat/page.tsx
```

This is the main messaging page. It shows saved chats, accepted contacts, messages, emoji tools, GIF-style reactions, call buttons, incoming call UI, and active call UI.

```txt
app/chat/chat.css
```

This file controls the chat page design and layout.

```txt
app/contacts/page.tsx
```

This page lets users manage usernames, add contacts by username, view incoming contact requests, accept or reject requests, view sent requests, and see accepted contacts.

```txt
app/groups/page.tsx
```

This page lets users create encrypted group chats using accepted contacts.

```txt
app/layout.tsx
```

This controls the app layout and metadata.

```txt
src/lib/supabase.ts
```

This connects the app to Supabase.

```txt
src/lib/chat.ts
```

This contains the main Supabase functions for profiles, usernames, contacts, contact requests, chats, chat members, chat keys, messages, and group creation.

```txt
src/lib/crypto.ts
```

This contains the browser encryption functions used for user encryption keys, encrypted private-key vaults, wrapped chat keys, and encrypted messages.

```txt
proxy.ts
```

This adds stronger browser security headers for the deployed site.

## Main app pages

### Login page

The login page lets users sign in or create an account using Supabase Auth.

After login, users may need to:

1. Set up or unlock encryption
2. Choose a username
3. Open the chat page

### Chat page

The chat page is focused on messaging.

It shows:

• User profile area  
• Search bar  
• Button to create a new group  
• Button to manage contacts and requests  
• Saved chats  
• Accepted contacts  
• Message area  
• Emoji picker  
• GIF-style reaction picker  
• Voice call button  
• Video call button  
• Logout button  

The chat page no longer shows every registered user. Users only see accepted contacts.

### Contacts page

The contacts page is used for contact management.

It lets users:

• View or update their username  
• Send a contact request by exact username  
• View incoming contact requests  
• Accept contact requests  
• Reject contact requests  
• View sent pending requests  
• View accepted contacts  

If a contact request is rejected or reused, the sender must wait 1 minute before trying to send another request to the same person.

### Groups page

The groups page is used for group creation.

It lets users:

• Unlock encryption if needed  
• Enter a group name  
• Select accepted contacts  
• Create an encrypted group chat  

Only accepted contacts can be added to a group.

Every selected contact must have encryption set up before they can be added to an encrypted group.

## Database tables

The app uses several Supabase tables.

### profiles

The `profiles` table stores user profile information.

It includes:

• User ID  
• Email  
• Username  
• Public encryption key  
• Encrypted private key  
• Private key IV  
• Private key salt  
• Encryption KDF information  
• Encryption version  

The public key can be used to encrypt chat keys for that user.

The private key is encrypted before being saved.

### contacts

The `contacts` table stores accepted contact relationships.

It includes:

• User ID  
• Contact user ID  
• Created time  

This is what allows the app to show only accepted contacts instead of every registered user.

### contact_requests

The `contact_requests` table stores contact requests.

It includes:

• Requester ID  
• Addressee ID  
• Request status  
• Created time  
• Responded time  

The status can be:

```txt
pending
accepted
rejected
canceled
```

### chats

The `chats` table stores direct chats and group chats.

A direct chat has:

```txt
is_group = false
```

A group chat has:

```txt
is_group = true
```

Group chats can also have a name.

### chat_members

The `chat_members` table stores which users belong to each chat.

This controls which chats a user can see and participate in.

### messages

The `messages` table stores saved encrypted messages.

It includes:

• Chat ID  
• Sender ID  
• Ciphertext  
• IV  
• Crypto version  
• Algorithm  
• Created time  

Normal readable message text should not be stored in this table.

### chat_keys

The `chat_keys` table stores encrypted chat keys.

Each chat has a random AES chat key.

That chat key is encrypted separately for each chat member.

This allows each member to decrypt messages in the chat without the server storing the chat key in plain readable form.

## Encryption design

PigeonProject currently uses browser-based encryption.

The app creates a key pair for each user.

The public key is saved in Supabase.

The private key is encrypted in the browser with the user’s encryption password before being saved in Supabase.

Each chat gets a random AES-256 chat key.

Messages are encrypted in the browser using the chat key before being saved to Supabase.

The chat key is encrypted separately for each chat member using key agreement and key derivation.

This means Supabase stores encrypted message data instead of normal readable messages.

## Encryption password

Each user needs an encryption password.

The encryption password is separate from the normal login password.

The login password proves the user owns the account.

The encryption password unlocks the user’s private encryption key.

If a user forgets their encryption password, the app may not be able to decrypt their saved messages.

This is expected behavior for stronger privacy.

## Message flow

When a user sends a message:

1. The user types a message.
2. The app checks that a chat is open.
3. The app uses the unlocked chat key.
4. The message is encrypted in the browser.
5. The encrypted message is saved in Supabase.
6. Other chat members receive the saved encrypted message.
7. Their browser decrypts it with their unlocked chat key.
8. The readable message appears in the chat.

## Direct chat flow

When a user starts a direct chat:

1. The user must already be an accepted contact.
2. The user clicks the contact.
3. The app checks if a direct chat already exists.
4. If the chat already exists, the app opens it.
5. If it does not exist, the app creates a new direct chat.
6. Both users are added as chat members.
7. A chat key is created or loaded.
8. Messages can be sent with encryption.

## Contact request flow

When a user wants to add someone:

1. The user goes to the Contacts page.
2. The user types the other person’s exact username.
3. The app sends a contact request.
4. The other user sees the request on their Contacts page.
5. The other user can accept or reject.
6. If accepted, both users become contacts.
7. If rejected, the sender must wait 1 minute before trying again.

## Group chat flow

When a user creates a group:

1. The user goes to the Groups page.
2. The user unlocks encryption if needed.
3. The user enters a group name.
4. The user selects accepted contacts.
5. The app checks that selected contacts have encryption set up.
6. The app creates a group chat.
7. The app adds the selected users as chat members.
8. The app creates a group chat key.
9. The app encrypts the group chat key separately for each member.
10. The group appears on the chat page.

## Emoji and GIF-style reaction flow

When a user clicks the emoji button:

1. The app opens an emoji picker.
2. The user selects an emoji.
3. The emoji is inserted into the message box.
4. The user sends the message normally.

When a user clicks the GIF button:

1. The app opens preset animated reaction options.
2. The user chooses a reaction.
3. The reaction is sent as an encrypted message.
4. The chat page displays it as a styled animated card.

## Calling flow

PigeonProject supports browser-based voice and video calling through WebRTC.

When a user starts a call:

1. The user opens a direct chat or group chat.
2. The user clicks Call or Video.
3. The app asks for microphone access for voice calls.
4. The app asks for microphone and camera access for video calls.
5. The app sends signaling events through Supabase Realtime broadcast.
6. Other participants who have the app open can receive the incoming call interface.
7. When another participant answers, browsers exchange WebRTC offer, answer, and ICE candidate data.
8. The media connection is created between browsers when possible.
9. The call UI shows active participants and media streams.

## Voice calls

Voice calls show participant cards and use browser audio streams.

## Video calls

Video calls show video tiles for the local user and connected remote users.

## Security headers

The project includes stronger browser security headers through `proxy.ts`.

The headers are intended to help reduce common browser attack risks, including:

• Clickjacking  
• Some cross-site scripting risks  
• MIME sniffing  
• Unwanted browser permissions  
• Insecure content loading  
• Unwanted framing  

Security headers are helpful, but they do not make an app impossible to hack.

## Current features

• User login  
• User logout  
• Username setup  
• Contact requests by username  
• Accept contact requests  
• Reject contact requests  
• 1-minute retry wait after rejected or repeated requests  
• Accepted contacts list  
• Direct chats  
• Group chats  
• Separate Contacts page  
• Separate Groups page  
• Saved message history  
• Browser-based encrypted messages  
• User-owned encryption key pair  
• Encrypted private-key vault  
• Per-chat encrypted chat keys  
• Sender username shown under messages  
• Full emoji picker  
• Preset GIF-style reactions  
• Supabase backend  
• Supabase Realtime message updates  
• Public deployment through Vercel  
• Browser-based voice calls  
• Browser-based video calls  
• Incoming call UI  
• Active call UI for direct and group chats  

## Current limitations

• The project has not had a professional security audit  
• The project is not government-certified  
• The project is not a full Signal Protocol implementation  
• The project does not currently support multi-device key sync  
• If users forget their encryption password, saved messages may not be recoverable  
• Incoming call UI only appears if the other user already has the app open  
• Calls depend on browser microphone and camera permissions  
• Some browsers, networks, or device settings may block WebRTC behavior  
• Background push notifications are not implemented yet  
• True offline ringing is not implemented yet  
• Message deletion is not fully implemented yet  
• File and image sharing are not implemented yet  
• Account recovery for encrypted messages is not implemented yet  
• Professional penetration testing has not been completed  

## Future improvements

• Professional security audit  
• Stronger production-grade E2EE protocol  
• Signal Protocol or similar ratcheting protocol  
• Better key verification between users  
• Safer account recovery design  
• Multi-device support  
• Push notifications  
• Background call notifications  
• Missed call records  
• Read receipts  
• Typing indicators  
• Profile pictures  
• Message deletion  
• File sharing  
• Image sharing  
• Voice messages  
• Contact blocking  
• Contact removal  
• Report abuse flow  
• Admin abuse protections  
• Better mobile layout  
• Better accessibility  
• Password reset flow  
• More polished landing page  

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

• Microphone for voice calls  
• Microphone and camera for video calls  

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

## Suggested testing flow

Use two test accounts.

Account A:

1. Sign up or log in.
2. Set up or unlock encryption.
3. Choose a username.
4. Go to the Contacts page.
5. Send a contact request to Account B by username.

Account B:

1. Sign up or log in.
2. Set up or unlock encryption.
3. Choose a username.
4. Go to the Contacts page.
5. Accept Account A’s request.

Then:

1. Go back to the Chat page.
2. Start a direct chat.
3. Send a message.
4. Check Supabase.
5. The message should be saved as ciphertext, not readable text.

For groups:

1. Go to the Groups page.
2. Select accepted contacts.
3. Create a group.
4. Go back to the Chat page.
5. Open the group chat.
6. Send encrypted messages.

## Project purpose

PigeonProject was created to explore how a public messenger app can be built with free tools, saved cloud messages, direct chats, group chats, contact requests, username-based discovery, browser-based calling, and privacy-focused encrypted message storage.

The project shows skills in frontend development, backend integration, authentication, database design, Supabase Row Level Security, realtime systems, encryption design, WebRTC signaling, deployment, and secure app design.