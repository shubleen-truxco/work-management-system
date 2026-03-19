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

  // Pagination
  page = 0;
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

  // Employee search/dropdown state
  employeeSearch = '';
  showEmployeeDropdown = false;

  statusOptions = [
    { value: 'PENDING',     label: 'Pending',     color: 'dot-amber' },
    { value: 'IN_PROGRESS', label: 'In Progress', color: 'dot-teal'  },
    { value: 'COMPLETED',   label: 'Completed',   color: 'dot-green' },
  ];

  priorityOptions = [
    { value: 'LOW',    label: 'Low'    },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH',   label: 'High'   },
  ];

  boardColumns = [
    { status: 'PENDING',     label: 'Pending',     icon: 'pending',   color: 'col-amber' },
    { status: 'IN_PROGRESS', label: 'In Progress', icon: 'autorenew', color: 'col-teal'  },
    { status: 'COMPLETED',   label: 'Completed',   icon: 'task_alt',  color: 'col-green' },
  ];

  statCards: any[] = [];

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    // Load employees first so openEditModal can resolve IDs immediately
    this.loadEmployees().then(() => {
      this.loadAllTasksForStats();
      this.loadTasks();
    });
  }

  // ── Load ALL tasks for stats ───────────────────────────
  loadAllTasksForStats(): void {
    this.api.getTaskList({ page: 0, size: 1000 }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.allTasks = res.data?.items ?? (Array.isArray(res.data) ? res.data : []);
          this.buildStats();
        }
      },
      error: () => {}
    });
  }

  loadTasks(): void {
    this.isLoading = true;
    const payload: any = { page: this.page, size: this.size };
    if (this.activeFilter && this.activeFilter !== 'overdue') {
      payload.status = this.activeFilter;
    }

    this.api.getTaskList(payload).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (!res.success) { this.toast.show(res.message || 'Failed', 'error'); return; }
        const data = res.data;
        if (data?.items) {
          this.tasks        = data.items ?? [];
          this.totalPages   = data.totalPages ?? 1;
          this.totalItems   = data.totalItems ?? 0;
          this.isFirst      = data.isFirst ?? true;
          this.isLast       = data.isLast ?? false;
          this.currentPage  = data.currentPage ?? 1;
        } else if (Array.isArray(data)) {
          this.tasks = data;
        } else {
          this.tasks = [];
        }
        if (!this.activeFilter) this.allTasks = [...this.tasks];
        this.buildStats();
      },
      error: () => { this.isLoading = false; this.toast.show('Error fetching tasks', 'error'); }
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
      { label: 'Total',       filter: '',         count: t.length,                                                                icon: 'assignment',  color: 'teal'  },
      { label: 'Pending',     filter: 'PENDING',   count: t.filter(x => x.status === 'PENDING').length,                          icon: 'pending',     color: 'amber' },
      { label: 'In Progress', filter: 'IN_PROGRESS',count: t.filter(x => x.status === 'IN_PROGRESS').length,                    icon: 'autorenew',   color: 'blue'  },
      { label: 'Completed',   filter: 'COMPLETED', count: t.filter(x => x.status === 'COMPLETED').length,                       icon: 'task_alt',    color: 'green' },
      { label: 'Overdue',     filter: 'overdue',   count: t.filter(x => this.isOverdue(x.endDate || x.startDate) && x.status !== 'COMPLETED').length, icon: 'warning', color: 'red' },
    ];
  }

  // ── Filters ───────────────────────────────────────────
  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.page = 0;
    if (filter === 'overdue') { this.buildStats(); } else { this.loadTasks(); }
  }

  onSearch(): void {}

  get filteredTasks(): any[] {
    let result = [...this.tasks];
    if (this.activeFilter === 'overdue') {
      result = result.filter(t => this.isOverdue(t.endDate || t.startDate) && t.status !== 'COMPLETED');
    } else if (this.activeFilter) {
      result = result.filter(t => t.status === this.activeFilter);
    }
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.taskCode?.toLowerCase().includes(q) ||
        // search across all assigned user names
        (t.assignedUsers as string[] ?? []).some((n: string) => n.toLowerCase().includes(q))
      );
    }
    return result;
  }

  getTasksByStatus(status: string): any[] {
    return this.filteredTasks.filter(t => t.status === status);
  }

  // ── Employee multi-select helpers ──────────────────────

  // Employees filtered by search text in dropdown
  get filteredEmployees(): any[] {
    if (!this.employeeSearch.trim()) return this.employees;
    const q = this.employeeSearch.toLowerCase();
    return this.employees.filter(e =>
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      e.empId?.toLowerCase().includes(q)
    );
  }

  // Is an employee currently selected?
  isEmployeeSelected(empId: number): boolean {
    return (this.form.assignedUserIds as number[]).includes(empId);
  }

  // Toggle employee in/out of selection
  toggleEmployee(empId: number): void {
    const ids: number[] = this.form.assignedUserIds;
    const idx = ids.indexOf(empId);
    if (idx === -1) { ids.push(empId); } else { ids.splice(idx, 1); }
    this.clearError('assignedUserIds');
  }

  // Remove one chip
  removeEmployee(empId: number): void {
    const ids: number[] = this.form.assignedUserIds;
    this.form.assignedUserIds = ids.filter(id => id !== empId);
  }

  // Display name for a selected employee chip
  getEmployeeName(empId: number): string {
    const e = this.employees.find(x => x.id === empId);
    return e ? `${e.firstName} ${e.lastName}` : String(empId);
  }

  getInitial(name: string): string { return (name || '?').charAt(0).toUpperCase(); }

  getEmployeeInitial(empId: number): string {
    const e = this.employees.find(x => x.id === empId);
    return e ? (e.firstName?.[0] ?? '?').toUpperCase() : '?';
  }

  closeDropdown(): void {
    // Small delay so click on item fires before dropdown closes
    setTimeout(() => { this.showEmployeeDropdown = false; }, 150);
  }

  // ── Other helpers ─────────────────────────────────────
  isOverdue(date: string | null): boolean {
    if (!date) return false;
    return new Date(date) < new Date();
  }

  formatStatus(status: string): string { return status?.replace('_', ' ') ?? '—'; }

  getStatusClass(status: string): string {
    const map: any = { PENDING: 'status-amber', IN_PROGRESS: 'status-teal', COMPLETED: 'status-green', ON_HOLD: 'status-purple', CANCELLED: 'status-red' };
    return map[status] || '';
  }

  getPriorityClass(priority: string): string {
    const map: any = { HIGH: 'priority-high-badge', MEDIUM: 'priority-medium-badge', LOW: 'priority-low-badge' };
    return map[priority] || '';
  }

  getPriorityIcon(priority: string): string {
    const map: any = { HIGH: 'keyboard_double_arrow_up', MEDIUM: 'drag_handle', LOW: 'keyboard_double_arrow_down' };
    return map[priority] || 'drag_handle';
  }

  formatDateForInput(dateString: string | Date | null): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ── Modal ─────────────────────────────────────────────
  emptyForm() {
    return {
      id:              null as number | null,
      taskCode:        '',
      title:           '',
      description:     '',
      status:          'PENDING',
      priority:        'MEDIUM',
      assignedUserIds: [] as number[],   // ✅ array
      startDate:       '',
      endDate:         '',
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

    // Debug — see exactly what BE is sending
    console.log('[openEditModal] task received:', JSON.stringify({
      id: task.id,
      title: task.title,
      assignedTo: task.assignedTo,
      assignedUserId: task.assignedUserId,
      assignedUserIds: task.assignedUserIds,
    }));
    console.log('[openEditModal] employees loaded:', this.employees.length);

    // ── Resolve assigned user IDs ──────────────────────
    // BE returns assignedUsers: string[] (array of full names)
    let assignedIds: number[] = [];

    // Priority 1: BE returns IDs directly (future-proof)
    if (task.assignedUserIds && Array.isArray(task.assignedUserIds) && task.assignedUserIds.length) {
      assignedIds = task.assignedUserIds.map(Number);

    // Priority 2: BE returns assignedUsers: ["JOHN JJJ", "Testing User", ...]
    } else if (task.assignedUsers && Array.isArray(task.assignedUsers) && task.assignedUsers.length) {
      const names = task.assignedUsers.map((n: string) => n.trim().toLowerCase());

      names.forEach((name: string) => {
        const emp = this.employees.find(e => {
          const fullName  = `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim().toLowerCase();
          const firstName = (e.firstName ?? '').toLowerCase();
          const username  = (e.username  ?? '').toLowerCase();
          const nameField = (e.name      ?? '').toLowerCase();
          return fullName === name || firstName === name || username === name || nameField === name;
        });
        if (emp) assignedIds.push(emp.id);
        else console.warn('[openEditModal] no match for:', name);
      });

    // Priority 3: single assignedUserId
    } else if (task.assignedUserId) {
      assignedIds = [Number(task.assignedUserId)];

    // Priority 4: comma-separated assignedTo string
    } else if (task.assignedTo) {
      task.assignedTo.split(',').map((n: string) => n.trim().toLowerCase()).forEach((name: string) => {
        const emp = this.employees.find(e =>
          `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim().toLowerCase() === name ||
          (e.firstName ?? '').toLowerCase() === name
        );
        if (emp) assignedIds.push(emp.id);
      });
    }

    console.log('[openEditModal] assignedUsers from BE:', task.assignedUsers, '→ resolved IDs:', assignedIds);

    this.form = {
      id:              task.id,
      taskCode:        task.taskCode || '',
      title:           task.title || '',
      description:     task.description || '',
      status:          task.status || 'PENDING',
      priority:        task.priority || 'MEDIUM',
      assignedUserIds: assignedIds,   // ✅ always an array
      startDate:       this.formatDateForInput(task.startDate),
      endDate:         this.formatDateForInput(task.endDate),
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
    if (!this.form.title?.trim()) this.errors.title = 'Title is required';
    if (!this.form.assignedUserIds?.length) this.errors.assignedUserIds = 'Assign to at least one employee';
    if (!this.form.status) this.errors.status = 'Status is required';
    return Object.keys(this.errors).length === 0;
  }

  // ── Submit ────────────────────────────────────────────
  submitTask(): void {
    if (!this.validateForm()) { this.toast.show('Please fix the errors', 'error'); return; }
    this.isSubmitting = true;

    const payload: any = {
      title:           this.form.title.trim(),
      description:     this.form.description || null,
      status:          this.form.status,
      priority:        this.form.priority || 'MEDIUM',
      assignedUserIds: this.form.assignedUserIds,   // ✅ send array
      startDate:       this.form.startDate ? this.form.startDate + ':00' : null,
      endDate:         this.form.endDate   ? this.form.endDate   + ':00' : null,
    };

    if (this.isEditMode && this.form.id) {
      payload.id = this.form.id;
    }

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
  nextPage(): void { if (!this.isLast)  { this.page++; this.loadTasks(); } }
}