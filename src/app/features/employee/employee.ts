import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { ValidationService } from '../../core/services/validation.service';

@Component({
  selector: 'app-employee-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar, DatePipe],
  templateUrl: './employee.html',
  styleUrls: ['./employee.css'],
})
export class EmployeeList implements OnInit {
  employees: any[] = [];
  designations: any[] = [];
  page = 1;
  size = 10;
  totalPages = 1;
  totalItems = 0;
  isFirst = true;
  isLast = false;
  searchText = '';

  // Modal state
  showModal = false;
  isEditMode = false;
  isSubmitting = false;
  editEmpId: number | null = null;
  showViewModal = false;
  viewEmp: any = null;

  // Attendance tab in view modal
  activeViewTab = 'profile';   // 'profile' | 'attendance'

  errors: any = {};
  form: any = this.emptyForm();

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private router: Router,
    private cd: ChangeDetectorRef,
    private validation: ValidationService
  ) { }

  ngOnInit(): void {
    this.fetchEmployees();
    this.fetchDesignations();
  }

  get countryCodes() { return this.validation.countryCodes; }
  
  getProfileUrl(emp: any): string {
    return this.api.getProfileImageUrl(emp.profile);
  }

  hasProfile(emp: any): boolean {
    return !!emp.profile;
  }
  // ── Fetch ─────────────────────────────────────────────
  fetchEmployees(): void {
    this.api.getEmployeeList(this.page, this.size, this.searchText).subscribe({
      next: (res: any) => {
        if (res.success) {
          const data = res.data;
          // API returns data.items (not data.content)
          this.employees = data?.items ?? [];
          this.totalPages = data?.totalPages ?? 1;
          this.totalItems = data?.totalItems ?? 0;
          this.isFirst = data?.isFirst ?? true;
          this.isLast = data?.isLast ?? false;
          this.page = data?.currentPage ?? this.page;
          this.cd.detectChanges();
        } else {
          this.toast.show(res.message || 'Failed to fetch', 'error');
        }
      },
      error: () => this.toast.show('Error fetching employees', 'error'),
    });
  }

  fetchDesignations(): void {
    this.api.getDesignations().subscribe({
      next: (res: any) => {
        if (res?.success) this.designations = res.data || [];
        else if (Array.isArray(res)) this.designations = res;
        else this.designations = [];
      },
      error: () => this.toast.show('Failed to load designations', 'error'),
    });
  }

  // ── Computed ──────────────────────────────────────────
  get filteredEmployees(): any[] {
    return this.employees.filter(e => e.role !== 'ADMIN');
  }

  get activeCount(): number {
    return this.filteredEmployees.filter(e => e.status === true).length;
  }

  // ── Helpers ───────────────────────────────────────────
  getDisplayName(emp: any): string {
    if (emp.firstName || emp.lastName)
      return `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
    return emp.name || emp.username || '—';
  }

  getInitial(emp: any): string {
    return (emp.firstName || emp.name || emp.username || '?')
      .charAt(0).toUpperCase();
  }

  // attendance helpers
  getAttendanceStatus(att: any): string {
    if (!att.timeIn) return 'Absent';
    if (!att.timeOut) return 'Active';
    return att.status || 'Present';
  }

  formatMinutes(mins: number): string {
    if (!mins && mins !== 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }

  formatTime(dt: string | null): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  // ── Phone helpers ─────────────────────────────────────
  getPhonePlaceholder(): string { return this.validation.getPhonePlaceholder(this.form.countryCode); }
  getPhoneMaxLength(): number { return this.validation.getPhoneMaxLength(this.form.countryCode); }
  getPhoneHint(): string { return this.validation.getPhoneHint(this.form.countryCode); }

  onPhoneInput(event: any): void {
    event.target.value = this.validation.sanitizePhone(event.target.value);
    this.form.mobileNumber = event.target.value;
    this.clearError('mobileNumber');
  }

  onCountryChange(): void {
    this.form.mobileNumber = '';
    this.clearError('mobileNumber');
  }

  // ── Validation ────────────────────────────────────────
  validateField(field: string): void {
    const map: any = {
      firstName: () => this.validation.validateFirstName(this.form.firstName),
      lastName: () => this.validation.validateLastName(this.form.lastName),
      mobileNumber: () => this.validation.validatePhone(this.form.mobileNumber, this.form.countryCode),
      emailId: () => this.validation.validateEmail(this.form.emailId),
      designationId: () => this.validation.validateRequired(this.form.designationId, 'Designation'),
    };
    if (map[field]) {
      const result = map[field]();
      result.valid ? delete this.errors[field] : (this.errors[field] = result.message);
    }
  }

  clearError(field: string): void { delete this.errors[field]; }

  validateAll(): boolean {
    const { errors, isValid } = this.validation.validateForm({
      firstName: this.validation.validateFirstName(this.form.firstName),
      lastName: this.validation.validateLastName(this.form.lastName),
      mobileNumber: this.validation.validatePhone(this.form.mobileNumber, this.form.countryCode),
      emailId: this.validation.validateEmail(this.form.emailId),
      designationId: this.validation.validateRequired(this.form.designationId, 'Designation'),
    });
    this.errors = errors;
    return isValid;
  }

  // ── Modal ─────────────────────────────────────────────
  emptyForm() {
    return {
      firstName: '', lastName: '', countryCode: '+91',
      mobileNumber: '', emailId: '', role: 'USER',
      designationId: '', empId: '', location: '',
      timeIn: '', breakTime: '', status: true,
    };
  }

  openAddModal(): void {
    this.isEditMode = false;
    this.editEmpId = null;
    this.errors = {};
    this.form = this.emptyForm();
    this.showModal = true;
  }

  openEditModal(emp: any): void {
    this.isEditMode = true;
    this.editEmpId = emp.id;
    this.errors = {};
    this.form = {
      firstName: emp.firstName || '',
      lastName: emp.lastName || '',
      countryCode: emp.countryCode || '+91',
      mobileNumber: emp.mobileNumber || '',
      emailId: emp.emailId || '',
      role: emp.role || 'USER',
      designationId: emp.designationId || '',
      empId: emp.empId || '',
      location: emp.location || '',
      timeIn: emp.timeIn || '',
      breakTime: emp.breakTime || '',
      status: emp.status ?? true,
    };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.isEditMode = false;
    this.editEmpId = null;
    this.errors = {};
    this.form = this.emptyForm();
  }

  openViewModal(emp: any): void {
    this.viewEmp = emp;
    this.activeViewTab = 'profile';
    this.showViewModal = true;
  }

  closeViewModal(): void {
    this.showViewModal = false;
    this.viewEmp = null;
  }

  setViewTab(tab: string): void { this.activeViewTab = tab; }

  // ── Submit ────────────────────────────────────────────
  submitForm(): void {
    if (!this.validateAll()) {
      this.toast.show('Please fix the errors before submitting', 'error');
      return;
    }
    this.isSubmitting = true;
    const selectedDes = this.designations.find(
      (d: any) => d.id === Number(this.form.designationId) || d.id === this.form.designationId
    );
    const payload: any = {
      firstName: this.form.firstName.trim(),
      lastName: this.form.lastName.trim(),
      countryCode: this.form.countryCode,
      mobileNumber: this.form.mobileNumber,
      emailId: this.form.emailId.trim(),
      role: 'USER',
      designationName: selectedDes?.name || '',
      empId: this.form.empId || null,
      location: this.form.location || null,
      timeIn: this.form.timeIn || null,
      breakTime: this.form.breakTime || null,
      status: this.form.status,
      active: this.form.status,
    };
    if (this.isEditMode && this.editEmpId) payload.id = this.editEmpId;

    this.api.saveUser(payload).subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        if (res.success) {
          this.toast.show(
            this.isEditMode ? 'Employee updated!' : 'Employee added!', 'success'
          );
          this.closeModal();
          this.fetchEmployees();
        } else {
          this.toast.show(res.message || 'Operation failed', 'error');
        }
      },
      error: (err) => {
        this.isSubmitting = false;
        this.toast.show(err?.error?.message || 'Something went wrong', 'error');
      },
    });
  }

  // ── Pagination ────────────────────────────────────────
  onSearch(): void { this.page = 1; this.fetchEmployees(); }
  prevPage(): void { if (!this.isFirst) { this.page--; this.fetchEmployees(); } }
  nextPage(): void { if (!this.isLast) { this.page++; this.fetchEmployees(); } }

  // ── Logout ────────────────────────────────────────────
  logout(): void {
    this.api.logout().subscribe({
      next: () => { sessionStorage.clear(); this.router.navigate(['/login']); },
      error: () => { sessionStorage.clear(); this.router.navigate(['/login']); },
    });
  }
}