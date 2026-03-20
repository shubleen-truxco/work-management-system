import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar, DatePipe],
  templateUrl: './tasks.html',
  styleUrls: ['./tasks.css'],
})
export class Tasks implements OnInit {

  tasks: any[] = [];
  allTasks: any[] = [];
  employees: any[] = [];
  isLoading = false;
  isSubmitting = false;
  today: string = '';

  // Pagination — starts at 1 to match BE
  page = 1;
  size = 10;
  totalPages = 1;
  isFirst = true;
  isLast = false;
  totalItems = 0;
  currentPage = 1;

  // Filters
  activeFilter = '';
  searchText = '';
  viewMode = 'list';

  // Modals
  showModal = false;
  isEditMode = false;
  showViewModal = false;
  viewTask: any = null;
  errors: any = {};

  form: any = this.emptyForm();

  // Employee dropdown
  employeeSearch = '';
  showEmployeeDropdown = false;

  statusOptions = [
    { value: 'PENDING', label: 'Pending', color: 'dot-amber' },
    { value: 'IN_PROGRESS', label: 'In Progress', color: 'dot-teal' },
    { value: 'COMPLETED', label: 'Completed', color: 'dot-green' },
  ];

  priorityOptions = [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
  ];

  boardColumns = [
    { status: 'PENDING', label: 'Pending', icon: 'pending', color: 'col-amber' },
    { status: 'IN_PROGRESS', label: 'In Progress', icon: 'autorenew', color: 'col-teal' },
    { status: 'COMPLETED', label: 'Completed', icon: 'task_alt', color: 'col-green' },
  ];

  statCards: any[] = [];

  constructor(private api: ApiService, private toast: ToastService) { }

  ngOnInit(): void {
    this.loadEmployees().then(() => {
      this.loadAllTasksForStats();
      this.loadTasks();
    });
    const now = new Date();

    const pad = (n: number) => n.toString().padStart(2, '0');

    this.today =
      now.getFullYear() +
      '-' +
      pad(now.getMonth() + 1) +
      '-' +
      pad(now.getDate()) +
      'T' +
      pad(now.getHours()) +
      ':' +
      pad(now.getMinutes());
  }

  // ── Stats ─────────────────────────────────────────────
  loadAllTasksForStats(): void {
    this.api.getTaskList({ page: 1, size: 1000 }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.allTasks = res.data?.items ?? (Array.isArray(res.data) ? res.data : []);
          this.buildStats();
        }
      },
      error: () => { }
    });
  }

  // ── Load tasks ────────────────────────────────────────
  loadTasks(): void {
    this.isLoading = true;

    // Build query params — BE now uses @RequestParam
    const params: any = { page: this.page, size: this.size };
    if (this.activeFilter && this.activeFilter !== 'overdue') {
      params['status'] = this.activeFilter;
    }

    this.api.getTaskList(params).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (!res.success) { this.toast.show(res.message || 'Failed', 'error'); return; }
        const data = res.data;
        if (data?.items) {
          this.tasks = data.items ?? [];
          this.totalPages = data.totalPages ?? 1;
          this.totalItems = data.totalItems ?? 0;
          this.isFirst = data.isFirst ?? true;
          this.isLast = data.isLast ?? false;
          this.currentPage = data.currentPage ?? 1;
        } else if (Array.isArray(data)) {
          this.tasks = data;
        } else {
          this.tasks = [];
        }
        if (!this.activeFilter) this.allTasks = [...this.tasks];
        this.buildStats();
      },
      error: () => {
        this.isLoading = false;
        this.toast.show('Error fetching tasks', 'error');
      }
    });
  }

  loadEmployees(): Promise<void> {
    return new Promise((resolve) => {
      this.api.getEmployeeList(1, 100).subscribe({
        next: (res: any) => {
          if (res.success) {
            const all = res.data?.items ?? res.data?.content ?? [];
            this.employees = all.filter((e: any) => e.role !== 'ADMIN');
          }
          resolve();
        },
        error: () => resolve()
      });
    });
  }

  buildStats(): void {
    const t = this.allTasks.length > 0 ? this.allTasks : this.tasks;
    this.statCards = [
      {
        label: 'Total', filter: '', icon: 'assignment', color: 'teal',
        count: t.length
      },
      {
        label: 'Pending', filter: 'PENDING', icon: 'pending', color: 'amber',
        count: t.filter(x => x.status === 'PENDING').length
      },
      {
        label: 'In Progress', filter: 'IN_PROGRESS', icon: 'autorenew', color: 'blue',
        count: t.filter(x => x.status === 'IN_PROGRESS').length
      },
      {
        label: 'Completed', filter: 'COMPLETED', icon: 'task_alt', color: 'green',
        count: t.filter(x => x.status === 'COMPLETED').length
      },
      {
        label: 'Overdue', filter: 'overdue', icon: 'warning', color: 'red',
        count: t.filter(x =>
          this.isOverdue(x.endDate || x.startDate) && x.status !== 'COMPLETED').length
      },
    ];
  }

  // ── Filters ───────────────────────────────────────────
  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.page = 1;
    if (filter === 'overdue') { this.buildStats(); } else { this.loadTasks(); }
  }

  onSearch(): void { }

  get filteredTasks(): any[] {
    let result = [...this.tasks];

    if (this.activeFilter === 'overdue') {
      result = result.filter(t =>
        this.isOverdue(t.endDate || t.startDate) && t.status !== 'COMPLETED');
    } else if (this.activeFilter) {
      result = result.filter(t => t.status === this.activeFilter);
    }

    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.taskCode?.toLowerCase().includes(q) ||
        // ✅ assignedUsers is [{id,name}] — search inside name field
        (t.assignedUsers ?? []).some((u: any) =>
          this.getAssigneeName(u).toLowerCase().includes(q)
        )
      );
    }
    return result;
  }

  getTasksByStatus(status: string): any[] {
    return this.filteredTasks.filter(t => t.status === status);
  }

  // ── Employee multi-select ─────────────────────────────
  get filteredEmployees(): any[] {
    if (!this.employeeSearch.trim()) return this.employees;
    const q = this.employeeSearch.toLowerCase();
    return this.employees.filter(e =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      e.empId?.toLowerCase().includes(q)
    );
  }

  isEmployeeSelected(empId: number): boolean {
    return (this.form.assignedUserIds as number[]).includes(empId);
  }

  toggleEmployee(empId: number): void {
    const ids: number[] = this.form.assignedUserIds;
    const idx = ids.indexOf(empId);
    if (idx === -1) { ids.push(empId); } else { ids.splice(idx, 1); }
    this.clearError('assignedUserIds');
  }

  removeEmployee(empId: number): void {
    this.form.assignedUserIds =
      (this.form.assignedUserIds as number[]).filter(id => id !== empId);
  }

  getEmployeeName(empId: number): string {
    const e = this.employees.find(x => x.id === empId);
    return e ? `${e.firstName} ${e.lastName}` : String(empId);
  }

  getEmployeeInitial(empId: number): string {
    const e = this.employees.find(x => x.id === empId);
    return e ? (e.firstName?.[0] ?? '?').toUpperCase() : '?';
  }

  closeDropdown(): void {
    setTimeout(() => { this.showEmployeeDropdown = false; }, 150);
  }

  // ── Helpers ───────────────────────────────────────────

  // ✅ Handles both {id,name} objects AND plain strings safely
  getAssigneeName(u: any): string {
    if (!u) return '?';
    return typeof u === 'object' ? (u.name ?? '?') : String(u);
  }

  // ✅ Works for both {id,name} and plain strings
  getInitial(u: any): string {
    return this.getAssigneeName(u).charAt(0).toUpperCase() || '?';
  }

  isOverdue(date: string | null): boolean {
    if (!date) return false;
    return new Date(date) < new Date();
  }

  formatStatus(status: string): string {
    return status ? status.split('_').join(' ') : '—';
  }

  getStatusClass(status: string): string {
    const map: any = {
      PENDING: 'status-amber',
      IN_PROGRESS: 'status-teal',
      COMPLETED: 'status-green',
      ON_HOLD: 'status-purple',
      CANCELLED: 'status-red',
    };
    return map[status] || '';
  }

  getPriorityClass(priority: string): string {
    const map: any = {
      HIGH: 'priority-high-badge',
      MEDIUM: 'priority-medium-badge',
      LOW: 'priority-low-badge',
    };
    return map[priority] || '';
  }

  getPriorityIcon(priority: string): string {
    const map: any = {
      HIGH: 'keyboard_double_arrow_up',
      MEDIUM: 'drag_handle',
      LOW: 'keyboard_double_arrow_down',
    };
    return map[priority] || 'drag_handle';
  }

  formatDateForInput(dateString: string | Date | null): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ── Modal ─────────────────────────────────────────────
  emptyForm() {
    return {
      id: null as number | null,
      taskCode: '',
      title: '',
      description: '',
      status: 'PENDING',
      priority: 'MEDIUM',
      assignedUserIds: [] as number[],
      startDate: '',
      endDate: '',
    };
  }

  openAddModal(): void {
    this.isEditMode = false;
    this.errors = {};
    this.form = this.emptyForm();
    this.employeeSearch = '';
    this.showEmployeeDropdown = false;
    this.showModal = true;
  }

  openEditModal(task: any): void {
    this.isEditMode = true;
    this.errors = {};
    this.employeeSearch = '';
    this.showEmployeeDropdown = false;

    // ── Resolve assignedUserIds from unified {id,name}[] response ──
    let assignedIds: number[] = [];

    if (task.assignedUsers && Array.isArray(task.assignedUsers) && task.assignedUsers.length) {
      task.assignedUsers.forEach((u: any) => {
        if (typeof u === 'object' && u.id != null) {
          // ✅ New format — {id, name} — use id directly, no name matching needed
          assignedIds.push(Number(u.id));
        } else {
          // Fallback for plain string — match against employees list
          const name = String(u).trim().toLowerCase();
          const emp = this.employees.find(e =>
            `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim().toLowerCase() === name
          );
          if (emp) assignedIds.push(emp.id);
        }
      });
    } else if (task.assignedUserId) {
      // Legacy single ID
      assignedIds = [Number(task.assignedUserId)];
    }

    this.form = {
      id: task.id,
      taskCode: task.taskCode || '',
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'PENDING',
      priority: task.priority || 'MEDIUM',
      assignedUserIds: assignedIds,
      startDate: this.formatDateForInput(task.startDate),
      endDate: this.formatDateForInput(task.endDate),
    };

    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.isEditMode = false;
    this.errors = {};
    this.form = this.emptyForm();
    this.showEmployeeDropdown = false;
  }

  openViewModal(task: any): void { this.viewTask = task; this.showViewModal = true; }
  closeViewModal(): void { this.showViewModal = false; this.viewTask = null; }
  clearError(field: string): void { delete this.errors[field]; }

  validateForm(): boolean {
    this.errors = {};

    // Title
    if (!this.form.title?.trim())
      this.errors.title = 'Title is required';

    // Assignees
    if (!this.form.assignedUserIds?.length)
      this.errors.assignedUserIds = 'Assign to at least one employee';

    // Status
    if (!this.form.status)
      this.errors.status = 'Status is required';

    // Start date — required
    if (!this.form.startDate)
      this.errors.startDate = 'Start date is required';

    // End date — required
    if (!this.form.endDate)
      this.errors.endDate = 'End date is required';

    // End date must be after start date
    if (this.form.startDate && this.form.endDate) {
      const start = new Date(this.form.startDate);
      const end = new Date(this.form.endDate);
      if (end <= start)
        this.errors.endDate = 'End date must be after start date';
    }

    // Start date cannot be in the past (only for new tasks)
    if (!this.isEditMode && this.form.startDate) {
      const start = new Date(this.form.startDate);
      const now = new Date();
      now.setSeconds(0, 0); // ignore seconds
      if (start < now)
        this.errors.startDate = 'Start date cannot be in the past';
    }

    return Object.keys(this.errors).length === 0;
  }

  // ── Submit ────────────────────────────────────────────
  submitTask(): void {
    if (!this.validateForm()) { this.toast.show('Please fix the errors', 'error'); return; }
    this.isSubmitting = true;

    const payload: any = {
      title: this.form.title.trim(),
      description: this.form.description || null,
      status: this.form.status,
      priority: this.form.priority || 'MEDIUM',
      assignedUserIds: this.form.assignedUserIds,
      startDate: this.form.startDate ? this.form.startDate + ':00' : null,
      endDate: this.form.endDate ? this.form.endDate + ':00' : null,
    };

    if (this.isEditMode && this.form.id) payload.id = this.form.id;

    this.api.createOrUpdateTask(payload).subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        if (res.success) {
          this.toast.show(this.isEditMode ? 'Task updated!' : 'Task created!', 'success');
          this.closeModal();
          this.loadTasks();
          this.loadAllTasksForStats();
        } else {
          this.toast.show(res.message || 'Operation failed', 'error');
        }
      },
      error: (err) => {
        this.isSubmitting = false;
        this.toast.show(err?.error?.message || 'Something went wrong', 'error');
      }
    });
  }

  // ── Pagination ────────────────────────────────────────
  prevPage(): void { if (!this.isFirst) { this.page--; this.loadTasks(); } }
  nextPage(): void { if (!this.isLast) { this.page++; this.loadTasks(); } }
}