import { Injectable } from '@angular/core';
import { ApiService }  from './api.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class E2eService {

  private currentUserId   = sessionStorage.getItem('id')    || '';
  private myKeyPair!:      CryptoKeyPair;
  private chatAesKeys:     Map<string, CryptoKey> = new Map();
  private readonly E2E_PREFIX = 'E2E:';

  constructor(private api: ApiService) {}

  /* ═══════════════════════════════════════════════════
     INIT — call once on app start / login
  ═══════════════════════════════════════════════════ */
  async init(): Promise<void> {
    this.currentUserId = sessionStorage.getItem('id') || '';
    await this.initRsaKeyPair();
  }

  /* ═══════════════════════════════════════════════════
     RSA KEY PAIR — generated once, stored in localStorage
  ═══════════════════════════════════════════════════ */
  private async initRsaKeyPair(): Promise<void> {
    try {
      const storedPriv = localStorage.getItem(
        `rsa_priv_${this.currentUserId}`
      );
      const storedPub = localStorage.getItem(
        `rsa_pub_${this.currentUserId}`
      );

      if (storedPriv && storedPub) {
        // Restore from localStorage
        const privKey = await crypto.subtle.importKey(
          'pkcs8',
          this.base64ToBuffer(storedPriv),
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          false,
          ['decrypt']
        );
        const pubKey = await crypto.subtle.importKey(
          'spki',
          this.base64ToBuffer(storedPub),
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['encrypt']
        );
        this.myKeyPair = { privateKey: privKey, publicKey: pubKey };
        console.log('✅ RSA keys restored from localStorage');

      } else {
        // Generate new RSA-2048 key pair
        this.myKeyPair = await crypto.subtle.generateKey(
          {
            name:           'RSA-OAEP',
            modulusLength:  2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash:           'SHA-256',
          },
          true,
          ['encrypt', 'decrypt']
        );

        // Export and store
        const privExported = await crypto.subtle.exportKey(
          'pkcs8', this.myKeyPair.privateKey
        );
        const pubExported = await crypto.subtle.exportKey(
          'spki', this.myKeyPair.publicKey
        );

        const privB64 = this.bufferToBase64(privExported);
        const pubB64  = this.bufferToBase64(pubExported);

        localStorage.setItem(`rsa_priv_${this.currentUserId}`, privB64);
        localStorage.setItem(`rsa_pub_${this.currentUserId}`,  pubB64);

        // Upload public key to server
        await firstValueFrom(
          this.api.savePublicKey(pubB64)
        );

        console.log('✅ New RSA key pair generated and uploaded');
      }
    } catch (e) {
      console.error('❌ RSA init failed:', e);
    }
  }

  /* ═══════════════════════════════════════════════════
     GET OR CREATE AES KEY FOR A CHAT
     Flow:
       1. Check memory cache
       2. Check server (encrypted copy)
       3. Generate new + upload to server
  ═══════════════════════════════════════════════════ */
  async getOrCreateAesKey(chatId: string): Promise<CryptoKey> {
    // 1. Memory cache
    if (this.chatAesKeys.has(chatId)) {
      return this.chatAesKeys.get(chatId)!;
    }

    // 2. Try server — fetch encrypted AES key
    try {
      const res = await firstValueFrom(
        this.api.getEncryptedChatKey(chatId)
      );

      if (res.success && res.data?.encryptedAesKey) {
        const aesKey = await this.decryptAesKey(
          res.data.encryptedAesKey
        );
        if (aesKey) {
          this.chatAesKeys.set(chatId, aesKey);
          console.log(`✅ AES key loaded from server for ${chatId}`);
          return aesKey;
        }
      }
    } catch {}

    // 3. Generate new AES key
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    this.chatAesKeys.set(chatId, aesKey);

    // Upload encrypted copy to server
    await this.uploadEncryptedAesKey(chatId, aesKey);

    console.log(`✅ New AES key generated for ${chatId}`);
    return aesKey;
  }

  /* ═══════════════════════════════════════════════════
     SHARE AES KEY WITH CHAT PARTICIPANTS
     Call this when creating a new chat or adding members
  ═══════════════════════════════════════════════════ */
  async shareAesKeyWithParticipants(
    chatId: string,
    participantIds: string[]
  ): Promise<void> {
    try {
      const aesKey = await this.getOrCreateAesKey(chatId);

      // Export AES key as raw bytes
      const rawAes = await crypto.subtle.exportKey('raw', aesKey);

      // Get public keys of all participants
      const keysRes = await firstValueFrom(
        this.api.getParticipantPublicKeys(
          participantIds.map(id => Number(id))
        )
      );

      if (!keysRes.success) return;

      const publicKeys: Record<string, string> = keysRes.data;

      // Encrypt AES key for each participant using their RSA public key
      for (const [userId, pubKeyB64] of Object.entries(publicKeys)) {
        if (!pubKeyB64) continue;
        try {
          const pubKey = await crypto.subtle.importKey(
            'spki',
            this.base64ToBuffer(pubKeyB64),
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['encrypt']
          );

          const encryptedAesKey = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            pubKey,
            rawAes
          );

          // Save encrypted AES key for this participant on server
          await firstValueFrom(
            this.api.saveChatKeyForUser(
              Number(userId),
              chatId,
              this.bufferToBase64(encryptedAesKey)
            )
          );

          console.log(`✅ AES key shared with user ${userId}`);
        } catch (e) {
          console.error(`❌ Failed to share key with user ${userId}:`, e);
        }
      }
    } catch (e) {
      console.error('❌ shareAesKeyWithParticipants failed:', e);
    }
  }

  /* ═══════════════════════════════════════════════════
     ENCRYPT MESSAGE
  ═══════════════════════════════════════════════════ */
  async encryptMessage(text: string, chatId: string): Promise<string> {
    try {
      const aesKey  = await this.getOrCreateAesKey(chatId);
      const iv      = crypto.getRandomValues(new Uint8Array(12));
      const cipher  = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        new TextEncoder().encode(text)
      );
      const combined = new Uint8Array(12 + cipher.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(cipher), 12);
      return this.E2E_PREFIX + this.bufferToBase64(combined.buffer);
    } catch {
      return text; // fallback plain
    }
  }

  /* ═══════════════════════════════════════════════════
     DECRYPT MESSAGE
  ═══════════════════════════════════════════════════ */
  async decryptMessage(text: string, chatId: string): Promise<string> {
    if (!text?.startsWith(this.E2E_PREFIX)) return text ?? '';
    try {
      const aesKey   = await this.getOrCreateAesKey(chatId);
      const combined = this.base64ToBuffer(
        text.replace(this.E2E_PREFIX, '')
      );
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(combined.slice(0, 12)) },
        aesKey,
        combined.slice(12)
      );
      return new TextDecoder().decode(plain);
    } catch {
      return '[Encrypted message]';
    }
  }

  /* ═══════════════════════════════════════════════════
     PRIVATE HELPERS
  ═══════════════════════════════════════════════════ */

  // Encrypt AES key with my own RSA public key (for server storage)
  private async uploadEncryptedAesKey(
    chatId: string,
    aesKey: CryptoKey
  ): Promise<void> {
    try {
      const rawAes      = await crypto.subtle.exportKey('raw', aesKey);
      const encryptedKey = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        this.myKeyPair.publicKey,
        rawAes
      );
      await firstValueFrom(
        this.api.saveEncryptedChatKey(
          chatId,
          this.bufferToBase64(encryptedKey)
        )
      );
    } catch (e) {
      console.error('uploadEncryptedAesKey failed:', e);
    }
  }

  // Decrypt AES key using my RSA private key
  private async decryptAesKey(
    encryptedAesKeyB64: string
  ): Promise<CryptoKey | null> {
    try {
      const rawAes = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        this.myKeyPair.privateKey,
        this.base64ToBuffer(encryptedAesKeyB64)
      );
      return await crypto.subtle.importKey(
        'raw', rawAes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    } catch { return null; }
  }

  bufferToBase64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  base64ToBuffer(b64: string): ArrayBuffer {
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return buf;
  }
}