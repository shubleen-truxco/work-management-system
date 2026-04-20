import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  Messaging
} from 'firebase/messaging';
import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';
import { ToastService } from '../../shared/toast/toast.service';

@Injectable({ providedIn: 'root' })
export class FcmService {

  private messaging!: Messaging;
  private initialized = false;

  constructor(
    private api: ApiService,
    private toast: ToastService,
  ) {}

  // ─────────────────────────────────────────────
  // ✅ Generate / Get Device ID (IMPORTANT)
  // ─────────────────────────────────────────────
  private getDeviceId(): string {
    let id = localStorage.getItem('device_id');

    if (!id) {
      id = crypto.randomUUID(); // ✅ unique per browser/device
      localStorage.setItem('device_id', id);
    }

    return id;
  }

  // ─────────────────────────────────────────────
  // ✅ Initialize Firebase
  // ─────────────────────────────────────────────
  private initFirebase(): void {
    if (this.initialized) return;
    const app = initializeApp(environment.firebase);
    this.messaging = getMessaging(app);
    this.initialized = true;
  }

  // ─────────────────────────────────────────────
  // ✅ Request permission + get FCM token
  // ─────────────────────────────────────────────
  async requestPermission(): Promise<void> {
    try {
      this.initFirebase();

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('🔔 Notification permission denied');
        return;
      }

      // ✅ Register service worker
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      );

      console.log('✅ Service worker registered');

      // ✅ Get FCM token
      const token = await getToken(this.messaging, {
        vapidKey: environment.vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) return;

      const deviceId = this.getDeviceId();
      const userId = sessionStorage.getItem('id');

        // ✅ Save token locally
      localStorage.setItem('fcm_token', token);

      if (!userId) return;
      // ✅ ALWAYS send userId
      this.api.saveFcmToken({
        userId: Number(userId),
        deviceId: deviceId,
        token: token,
        deviceType: 'WEB'
      }).subscribe({
        next: () => console.log('✅ FCM token saved'),
        error: (e) => console.error('❌ Save token failed', e),
      });

    } catch (e) {
      console.error('❌ FCM error:', e);
    }
  }

  // ─────────────────────────────────────────────
  // ✅ Listen for foreground messages
  // ─────────────────────────────────────────────
  listenForeground(callback: (payload: any) => void): void {
    this.initFirebase();

    onMessage(this.messaging, (payload) => {
      callback(payload);
    });
  }

   onNotificationClick(callback: (data: any) => void) {
  navigator.serviceWorker.addEventListener('message', (event: any) => {
    if (event.data?.type === 'NOTIFICATION_CLICK') {
      callback(event.data.payload);
    }
  });
}

  // ─────────────────────────────────────────────
  // ✅ Remove token on logout (UPDATED)
  // ─────────────────────────────────────────────
  removeToken(): void {
    const userId = sessionStorage.getItem('id');
    const token = localStorage.getItem('fcm_token');

    if (!userId || !token) return;

    this.api.removeFcmToken({
      userId: Number(userId),
      token: token
    }).subscribe(() => {
      localStorage.removeItem('fcm_token');
    });
  }
}