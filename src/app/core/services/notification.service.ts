import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { getMessaging, onMessage } from 'firebase/messaging';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  constructor(private router: Router) {}

  initListener() {
    const messaging = getMessaging();

    onMessage(messaging, (payload: any) => {
      console.log('Foreground notification:', payload);

      const data = payload?.data;

      this.handleNotificationClick(data);
    });
  }

  handleNotificationClick(data: any) {

    if (!data) return;

    if (data.clickAction === 'OPEN_TASK') {
      const taskId = data.taskId;

      if (taskId) {
        this.router.navigate(['/tasks'], {
          queryParams: { taskId }
        });
      }
    }
  }
}