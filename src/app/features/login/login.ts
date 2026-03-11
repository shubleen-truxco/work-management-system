import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AdminLoginToastMessage } from '../../shared/utils/enums';
import { ToastService } from '../../shared/toast/toast.service';

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
    private api: ApiService
  ) {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  clearError(): void {
    this.errorMessage = '';
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';

    if (!this.username || !this.password) {
      this.errorMessage = AdminLoginToastMessage.FIELDS_REQUIRED;
      return;
    }

    this.isLoading = true;  // ← start loading

    const payload = {
      username:    this.username,
      password:    this.password,
      deviceId:    null,
      deviceToken: null,
      deviceType:  null,
    };

    this.api.login(payload).subscribe({
      next: async (res: any) => {
        this.isLoading = false;  // ← stop loading

        if (!res.success) {
          this.errorMessage = res.message || AdminLoginToastMessage.LOGIN_FAILED;
          this.toast.show(this.errorMessage, 'error');
          return;
        }

        if (res?.data?.role === 'ADMIN') {
          sessionStorage.setItem('token', res.data.token);
          sessionStorage.setItem('role',  res.data.role);
          sessionStorage.setItem('id',    res.data.id);
          sessionStorage.setItem('user',  JSON.stringify(res.data));

          const successMessage = res.data.role === 'ADMIN'
            ? AdminLoginToastMessage.ADMIN_LOGIN_SUCCESS
            : AdminLoginToastMessage.SUB_ADMIN_LOGIN_SUCCESS;

          this.toast.show(successMessage, 'success');
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