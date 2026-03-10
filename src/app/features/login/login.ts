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
  username = '';
  errorMessage = '';
  returnUrl: string | null = null;
  password: string = '';
  showPassword: boolean = false;

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService,
    private api: ApiService
  ) {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async onSubmit() {
    if (!this.username || !this.password) {
      this.errorMessage = AdminLoginToastMessage.FIELDS_REQUIRED;
      return;
    }

    const payload = {
      username: this.username,
      password: this.password,
      deviceId: null,
      deviceToken: null,
      deviceType: null
    };

    this.api.login(payload).subscribe({
      next: async (res: any) => {
        if (!res.success) {
          this.toast.show(
            res.message || AdminLoginToastMessage.LOGIN_FAILED,
            'error'
          );
          this.errorMessage =
            res.message || AdminLoginToastMessage.LOGIN_FAILED;
          return;
        }

        if (res?.data?.role === 'ADMIN') {
          sessionStorage.setItem('token', res.data.token);
          sessionStorage.setItem('role', res.data.role);
          sessionStorage.setItem('id', res.data.id);
          sessionStorage.setItem('user', JSON.stringify(res.data));

          const successMessage =
            res.data.role === 'ADMIN'
              ? AdminLoginToastMessage.ADMIN_LOGIN_SUCCESS
              : AdminLoginToastMessage.SUB_ADMIN_LOGIN_SUCCESS;

          this.toast.show(successMessage, 'success');
          const redirectUrl =
            this.returnUrl || '/admin/employee';
          this.router.navigate([redirectUrl]);
        } else {
          this.errorMessage = AdminLoginToastMessage.ACCESS_DENIED;
        }
      },
      error: () => {
        this.errorMessage = AdminLoginToastMessage.INVALID_CREDENTIALS;
      }
    });
  }
}
