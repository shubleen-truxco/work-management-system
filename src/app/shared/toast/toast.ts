import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="message" [ngClass]="type" class="toast">{{ message }}</div>
  `,
  styles: [`
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: #fff;
      z-index: 9999;
      opacity: 0.9;
    }
    .success { background: #4caf50; }
    .error { background: #f44336; }
    .info { background: #2196f3; }
  `]
})
export class Toast {
  message: string | null = null;
  type: 'success' | 'error' | 'info' = 'info';
  timeout: any;

  constructor(private toastService: ToastService, private cd: ChangeDetectorRef) {
    this.toastService.toast$.subscribe(({ message, type }) => {
      this.message = message;
      this.type = type ?? 'info';
      this.cd.detectChanges(); 
      clearTimeout(this.timeout);
      this.timeout = setTimeout(() => {
        this.message = null;
        this.cd.detectChanges();
      }, 3000);
    });
  }
}
