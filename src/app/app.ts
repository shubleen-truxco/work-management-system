import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './shared/toast/toast';
import { NotificationService } from './core/services/notification.service';

// ✅ ADD THESE IMPORTS
import { initializeApp } from 'firebase/app';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('work-management');

  private firebaseConfig = {
    apiKey: "AIzaSyD7RyYAkGjS4qOwH35366qYFGLfMKDYLsc",
    authDomain: "workforce-management-1003.firebaseapp.com",
    projectId: "workforce-management-1003",
    storageBucket: "workforce-management-1003.firebasestorage.app",
    messagingSenderId: "428864371867",
    appId: "1:428864371867:web:788c425c0c3399be751a3e"
  };

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    initializeApp(this.firebaseConfig);

    this.notificationService.initListener();
  }
}