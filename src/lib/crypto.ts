export async function generateKeyFromChat(chatId: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(chatId);

  const hash = await crypto.subtle.digest("SHA-256", data);

  return new Uint8Array(hash);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function numberArrayToArrayBuffer(values: number[]): ArrayBuffer {
  const bytes = new Uint8Array(values);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function encryptMessage(message: string, key: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    bytesToArrayBuffer(key),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: bytesToArrayBuffer(iv)
    },
    cryptoKey,
    bytesToArrayBuffer(encoded)
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
    bytesToArrayBuffer(key),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: numberArrayToArrayBuffer(iv)
    },
    cryptoKey,
    numberArrayToArrayBuffer(encrypted)
  );

  return new TextDecoder().decode(decrypted);
}