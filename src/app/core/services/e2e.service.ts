import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class E2eService {

  // ── Must match Flutter APP_SECRET exactly ─────────────
  private readonly APP_SECRET = 'wms@2026#SecretKey$WorkManagement!';
  private readonly E2E_PREFIX = 'E2E:';

  private keyCache: Map<string, CryptoKey> = new Map();

  // ══════════════════════════════════════════════════════
  // GET KEY — derived from chatId + APP_SECRET
  // ══════════════════════════════════════════════════════
  async getKey(chatId: string): Promise<CryptoKey> {
    if (this.keyCache.has(chatId)) {
      return this.keyCache.get(chatId)!;
    }

    // Import APP_SECRET as HKDF key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.APP_SECRET),
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );

    // Derive AES-256-GCM key using chatId as salt
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(chatId),         // chatId as salt
        info: new TextEncoder().encode('wms-chat-key'), // same info as Flutter
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    this.keyCache.set(chatId, aesKey);
    return aesKey;
  }

  // ══════════════════════════════════════════════════════
  // ENCRYPT
  // ══════════════════════════════════════════════════════
  async encrypt(text: string, chatId: string): Promise<string> {
    try {
      const key    = await this.getKey(chatId);
      const iv     = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(text)
      );

      // Combine: IV(12) + cipherText + mac(16 — included in cipher by WebCrypto)
      const cipherBytes = new Uint8Array(cipher);
      const combined    = new Uint8Array(12 + cipherBytes.byteLength);
      combined.set(iv, 0);
      combined.set(cipherBytes, 12);

      return this.E2E_PREFIX + btoa(
        String.fromCharCode(...combined)
      );
    } catch (e) {
      console.error('Encrypt error:', e);
      return text;
    }
  }

  // ══════════════════════════════════════════════════════
  // DECRYPT
  // ══════════════════════════════════════════════════════
  async decrypt(text: string, chatId: string): Promise<string> {
    if (!text?.startsWith(this.E2E_PREFIX)) return text ?? '';

    try {
      const key   = await this.getKey(chatId);
      const raw   = atob(text.replace(this.E2E_PREFIX, ''));
      const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));

      const iv     = bytes.slice(0, 12);
      const cipher = bytes.slice(12); // includes mac at end

      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipher
      );

      return new TextDecoder().decode(plain);
    } catch {
      return '🔒 Encrypted';
    }
  }

  // ══════════════════════════════════════════════════════
  // DECRYPT PREVIEW (chat list)
  // ══════════════════════════════════════════════════════
  async decryptPreview(text: string, chatId: string): Promise<string> {
    if (!text?.startsWith(this.E2E_PREFIX)) return text ?? '';
    const d = await this.decrypt(text, chatId);
    return d === '🔒 Encrypted' ? '🔒 Encrypted message' : d;
  }

  clear(): void {
    this.keyCache.clear();
  }
}
