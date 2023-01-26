# YASMA

> Yet Another (Secure) Messaging App

Try it out [here](https://devgianlu.github.io/YASMA/)!

## Scope

The work here was done as a university project for the course
of [Tecnologie Internet](https://corsi.unipr.it/it/ugov/degreecourse/191413)
and should not be in any way considered as a production ready service. As stated above, the app is (secure) in the fact
that it does not have explicit security vulnerabilities, but its cryptographic scheme has not been evaluated in any way.
However the project was very useful for experimenting
with [Crypto.subtle](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle)
and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## Features

- P2P design (based on [PeerJS](https://peerjs.com/))
- Send / receive messages and files
    - Automatically sends messages when peer comes online
    - Unsent messages are indicated
- Encrypted storage (AES-CBC)
    - Unlocked with passphrase
    - Key derivation using PBKDF2, 100000 rounds
    - localStorage and IndexedDB both encrypted
- Signed messages (ECDSA)
    - Messages are signed
    - Unverified messages are indicated
    - Public key fingerprint is shown
- Notifications
    - User online
    - New messages
    - Public key changed

## How To

The app uses relatively new browser APIs, check your support [here](https://caniuse.com/indexeddb,mdn-api_subtlecrypto).

### First setup

When first opening the app you'll need to enter a username and a secret passphrase.
These **cannot** be changed, choose them carefully. Both must be 3 characters or more.

### Authentication

Whenever you open the app (after the first setup) you'll be prompted to enter your passphrase,
this action unlocks your data and lets you see your chats as well as puts you online.

### Add contact

A new contact can be added with their UUID (shown in the bottom left), just know that they **must** be online
in order to be able to add them. In the bottom left corner you can also see your public key hash. Upon connection, you
should verify with the other party, using another communication channel, that your public fingerprints hashes match.

### Chat

You can send messages or files to your contacts. 
If the message can't be delivered immediately an "unsent" text will appear.
If a message you received wasn't signed from the original key, you'll see an "unverified" text.