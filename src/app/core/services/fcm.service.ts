import { Injectable }    from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  getMessaging, getToken,
  onMessage, Messaging
} from 'firebase/messaging';
import { environment }   from '../../../environments/environment';
import { ApiService }    from './api.service';
import { ToastService }  from '../../shared/toast/toast.service';

@Injectable({ providedIn: 'root' })
export class FcmService {

  private messaging!: Messaging;
  private initialized = false;

  constructor(
    private api:   ApiService,
    private toast: ToastService,
  ) {}

  // ── Initialize Firebase ───────────────────────────────
  private initFirebase(): void {
    if (this.initialized) return;
    const app      = initializeApp(environment.firebase);
    this.messaging = getMessaging(app);
    this.initialized = true;
  }

  // ── Request permission + get FCM token ───────────────
  async requestPermission(): Promise<void> {
    try {
      this.initFirebase();

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('🔔 Notification permission denied');
        return;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      );

      console.log('✅ Service worker registered');

      // Get FCM token
      const token = await getToken(this.messaging, {
        vapidKey:                   environment.vapidKey,
        serviceWorkerRegistration:  registration,
      });
      if (token) {
        console.log('🔑 FCM Token:', token);
        // Save token to backend
        this.api.saveFcmToken(token).subscribe({
          next: (res) => console.log('✅ FCM token saved to server'),
          error: (e)  => console.error('❌ Failed to save FCM token:', e),
        });
      } else {
        console.warn('⚠️ No FCM token received');
      }

    } catch (e) {
      console.error('❌ FCM init error:', e);
    }
  }

  // ── Listen for foreground messages ───────────────────
  listenForeground(callback: (payload: any) => void): void {
    try {
      this.initFirebase();
      onMessage(this.messaging, (payload) => {
        console.log('📩 Foreground message:', payload);
        callback(payload);
      });
    } catch (e) {
      console.error('❌ listenForeground error:', e);
    }
  }

  // ── Remove token on logout ────────────────────────────
  removeToken(): void {
    this.api.removeFcmToken().subscribe();
  }
}