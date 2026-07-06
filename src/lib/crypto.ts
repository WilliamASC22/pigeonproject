const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const E2EE_VERSION = 2;
export const MESSAGE_ALGORITHM = "AES-256-GCM";
export const CHAT_KEY_ALGORITHM = "ECDH-P256-HKDF-SHA256-AES256GCM";
export const PRIVATE_KEY_KDF = "PBKDF2-SHA-256";
export const PRIVATE_KEY_KDF_ITERATIONS = 310000;

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function stringToArrayBuffer(value: string): ArrayBuffer {
  return bytesToArrayBuffer(encoder.encode(value));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function bytesToBase64(bytes: Uint8Array): string {
  return arrayBufferToBase64(bytesToArrayBuffer(bytes));
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytesToArrayBuffer(bytes);
}

function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export type EncryptedPrivateKeyVault = {
  version: 2;
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: string;
  privateKeyIv: string;
  privateKeySalt: string;
  kdf: "PBKDF2-SHA-256";
  kdfIterations: number;
};

export type UserKeyBundle = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
};

export type EncryptedMessagePayload = {
  version: 2;
  algorithm: "AES-256-GCM";
  ciphertext: string;
  iv: string;
};

export type WrappedChatKeyPayload = {
  version: 2;
  algorithm: "ECDH-P256-HKDF-SHA256-AES256GCM";
  encryptedChatKey: string;
  iv: string;
};

async function derivePasswordKey(
  password: string,
  saltBase64OrBytes: string | Uint8Array
): Promise<CryptoKey> {
  const salt =
    typeof saltBase64OrBytes === "string"
      ? base64ToArrayBuffer(saltBase64OrBytes)
      : bytesToArrayBuffer(saltBase64OrBytes);

  const passwordMaterial = await crypto.subtle.importKey(
    "raw",
    stringToArrayBuffer(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PRIVATE_KEY_KDF_ITERATIONS,
      hash: "SHA-256"
    },
    passwordMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createUserKeyBundle(
  encryptionPassword: string
): Promise<EncryptedPrivateKeyVault> {
  if (!encryptionPassword || encryptionPassword.length < 12) {
    throw new Error("Use an encryption password with at least 12 characters.");
  }

  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    ["deriveBits"]
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  const salt = randomSalt();
  const iv = randomIv();
  const passwordKey = await derivePasswordKey(encryptionPassword, salt);

  const encryptedPrivateKey = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: bytesToArrayBuffer(iv)
    },
    passwordKey,
    stringToArrayBuffer(JSON.stringify(privateKeyJwk))
  );

  return {
    version: E2EE_VERSION,
    publicKeyJwk,
    encryptedPrivateKey: arrayBufferToBase64(encryptedPrivateKey),
    privateKeyIv: bytesToBase64(iv),
    privateKeySalt: bytesToBase64(salt),
    kdf: PRIVATE_KEY_KDF,
    kdfIterations: PRIVATE_KEY_KDF_ITERATIONS
  };
}

export async function unlockUserKeyBundle(
  encryptionPassword: string,
  vault: EncryptedPrivateKeyVault
): Promise<UserKeyBundle> {
  const passwordKey = await derivePasswordKey(
    encryptionPassword,
    vault.privateKeySalt
  );

  const decryptedPrivateKey = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToArrayBuffer(vault.privateKeyIv)
    },
    passwordKey,
    base64ToArrayBuffer(vault.encryptedPrivateKey)
  );

  const privateKeyJwk = JSON.parse(decoder.decode(decryptedPrivateKey));

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    false,
    ["deriveBits"]
  );

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    vault.publicKeyJwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    false,
    []
  );

  return {
    publicKey,
    privateKey,
    publicKeyJwk: vault.publicKeyJwk
  };
}

export async function importPublicEcdhKey(
  publicKeyJwk: JsonWebKey
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    false,
    []
  );
}

export async function generateChatKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
  );
}

async function importChatKey(rawChatKey: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawChatKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function hardenChatKey(chatKey: CryptoKey): Promise<CryptoKey> {
  const rawChatKey = await crypto.subtle.exportKey("raw", chatKey);
  return importChatKey(rawChatKey);
}

async function deriveChatWrappingKey(
  myPrivateKey: CryptoKey,
  otherUserPublicKeyJwk: JsonWebKey,
  chatId: string
): Promise<CryptoKey> {
  const otherPublicKey = await importPublicEcdhKey(otherUserPublicKeyJwk);

  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: otherPublicKey
    },
    myPrivateKey,
    256
  );

  const hkdfMaterial = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: stringToArrayBuffer(`PigeonProject chat ${chatId}`),
      info: stringToArrayBuffer("PigeonProject E2EE chat-key wrapping v2")
    },
    hkdfMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapChatKeyForUser(params: {
  chatKey: CryptoKey;
  myPrivateKey: CryptoKey;
  otherUserPublicKeyJwk: JsonWebKey;
  chatId: string;
}): Promise<WrappedChatKeyPayload> {
  const wrappingKey = await deriveChatWrappingKey(
    params.myPrivateKey,
    params.otherUserPublicKeyJwk,
    params.chatId
  );

  const rawChatKey = await crypto.subtle.exportKey("raw", params.chatKey);
  const iv = randomIv();

  const encryptedChatKey = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: bytesToArrayBuffer(iv)
    },
    wrappingKey,
    rawChatKey
  );

  return {
    version: E2EE_VERSION,
    algorithm: CHAT_KEY_ALGORITHM,
    encryptedChatKey: arrayBufferToBase64(encryptedChatKey),
    iv: bytesToBase64(iv)
  };
}

export async function unwrapChatKeyForUser(params: {
  encryptedChatKey: string;
  iv: string;
  myPrivateKey: CryptoKey;
  wrappedByPublicKeyJwk: JsonWebKey;
  chatId: string;
}): Promise<CryptoKey> {
  const wrappingKey = await deriveChatWrappingKey(
    params.myPrivateKey,
    params.wrappedByPublicKeyJwk,
    params.chatId
  );

  const rawChatKey = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToArrayBuffer(params.iv)
    },
    wrappingKey,
    base64ToArrayBuffer(params.encryptedChatKey)
  );

  return importChatKey(rawChatKey);
}

export async function encryptMessage(
  message: string,
  chatKey: CryptoKey
): Promise<EncryptedMessagePayload> {
  const iv = randomIv();

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: bytesToArrayBuffer(iv)
    },
    chatKey,
    stringToArrayBuffer(message)
  );

  return {
    version: E2EE_VERSION,
    algorithm: MESSAGE_ALGORITHM,
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: bytesToBase64(iv)
  };
}

export async function decryptMessage(
  ciphertext: string,
  iv: string,
  chatKey: CryptoKey
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToArrayBuffer(iv)
    },
    chatKey,
    base64ToArrayBuffer(ciphertext)
  );

  return decoder.decode(plaintext);
}