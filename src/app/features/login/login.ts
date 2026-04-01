import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AdminLoginToastMessage } from '../../shared/utils/enums';
import { ToastService } from '../../shared/toast/toast.service';
import { FcmService } from '../../core/services/fcm.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  username     = '';
  password     = '';
  errorMessage = '';
  showPassword = false;
  isLoading    = false;  // ← added
  returnUrl: string | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService,
    private api: ApiService,
    private fcmService: FcmService   // ✅ ADDED
  ) {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  clearError(): void {
    this.errorMessage = '';
  }

  // ✅ Get or generate deviceId
  private getDeviceId(): string {
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('device_id', id);
    }
    return id;
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';

    if (!this.username || !this.password) {
      this.errorMessage = AdminLoginToastMessage.FIELDS_REQUIRED;
      return;
    }

    this.isLoading = true;

    const deviceId = this.getDeviceId();
    const existingToken = localStorage.getItem('fcm_token');

    const payload = {
      username: this.username,
      password: this.password,
      deviceId: deviceId,
      deviceToken: existingToken,   // ✅ send if already exists
      deviceType: 'WEB'
    };

    this.api.login(payload).subscribe({
      next: async (res: any) => {
        this.isLoading = false;

        if (!res.success) {
          this.errorMessage = res.message || AdminLoginToastMessage.LOGIN_FAILED;
          this.toast.show(this.errorMessage, 'error');
          return;
        }

        if (res?.data?.role === 'ADMIN') {
          sessionStorage.setItem('token', res.data.token);
          sessionStorage.setItem('role', res.data.role);
          sessionStorage.setItem('id', res.data.id);
          sessionStorage.setItem('user', JSON.stringify(res.data));

          // ✅ AFTER LOGIN → request permission + save token
          await this.fcmService.requestPermission();

          this.toast.show(AdminLoginToastMessage.ADMIN_LOGIN_SUCCESS, 'success');
          this.router.navigate([this.returnUrl || '/dashboard']);
        } else {
          this.errorMessage = AdminLoginToastMessage.ACCESS_DENIED;
          this.toast.show(this.errorMessage, 'error');
        }
      },
      error: () => {
        this.isLoading    = false;  // ← stop loading on error
        this.errorMessage = AdminLoginToastMessage.INVALID_CREDENTIALS;
        this.toast.show(this.errorMessage, 'error');
      }
    });
  }
}