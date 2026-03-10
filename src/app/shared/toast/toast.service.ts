import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private toastSubject = new Subject<{ message: string; type?: 'success' | 'error' | 'info' }>();
  toast$ = this.toastSubject.asObservable();

  show(message: string, type: 'success' | 'error' | 'info' = 'info') {
    this.toastSubject.next({ message, type });
  }
}
