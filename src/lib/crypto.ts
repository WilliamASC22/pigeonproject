export async function generateKeyFromChat(chatId: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(chatId);

  const hash = await crypto.subtle.digest("SHA-256", data);

  return new Uint8Array(hash);
}

export async function encryptMessage(message: string, key: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded
  );

  return {
    encrypted: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv)
  };
}

export async function decryptMessage(
  encrypted: number[],
  iv: number[],
  key: Uint8Array
) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    cryptoKey,
    new Uint8Array(encrypted)
  );

  return new TextDecoder().decode(decrypted);
}