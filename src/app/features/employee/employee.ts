import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-employee-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee.html',
  styleUrls: ['./employee.css'],
})
export class EmployeeList implements OnInit {
  employees: any[] = [];
  page: number = 1;
  size: number = 10;
  totalPages: number = 1;
  searchText: string = '';

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('Employee panel init');
    this.fetchEmployees();
  }

  fetchEmployees(): void {
    this.api.getEmployeeList(this.page, this.size, this.searchText).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.employees = res.data?.content || [];
          this.totalPages = res.data?.totalPages || 1;
          this.cd.detectChanges();
        } else {
          this.toast.show(res.message || 'Failed to fetch employees', 'error');
        }
      },
      error: (err) => {
        console.error(err);
        this.toast.show('Error fetching employees', 'error');
      },
    });
  }

  onSearch(): void {
    this.page = 1;
    this.fetchEmployees();
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page--;
      this.fetchEmployees();
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page++;
      this.fetchEmployees();
    }
  }

  logout(): void {
    this.api.logout().subscribe({
      next: () => {
        sessionStorage.clear();
        this.router.navigate(['/login']);
      },
      error: () => {
        sessionStorage.clear();
        this.router.navigate(['/login']);
      },
    });
  }
}