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
  allTasks: any[] = []; // Store all tasks for accurate stats
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

  // ── Options ───────────────────────────────────────────
  statusOptions = [
    { value: 'PENDING', label: 'Pending', color: 'dot-amber' },
    { value: 'IN_PROGRESS', label: 'In Progress', color: 'dot-teal' },
    { value: 'COMPLETED', label: 'Completed', color: 'dot-green' },
    // { value: 'ON_HOLD', label: 'On Hold', color: 'dot-purple' },
    // { value: 'CANCELLED', label: 'Cancelled', color: 'dot-red' },
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
    // { status: 'ON_HOLD', label: 'On Hold', icon: 'pause_circle', color: 'col-purple' },
  ];

  statCards: any[] = [];

  constructor(private api: ApiService, private toast: ToastService) { }

  ngOnInit(): void {
    this.loadAllTasksForStats(); // Load all tasks first for stats
    this.loadTasks();
    this.loadEmployees();
  }

  // ── Load ALL tasks for accurate stats ─────────────────
  loadAllTasksForStats(): void {
    this.api.getTaskList({ page: 0, size: 1000 }).subscribe({
      next: (res: any) => {
        if (res.success) {
          const data = res.data;
          if (data?.items) {
            this.allTasks = data.items ?? [];
          } else if (Array.isArray(data)) {
            this.allTasks = data;
          } else {
            this.allTasks = [];
          }
          this.buildStats();
        }
      },
      error: () => { }
    });
  }

  loadTasks(): void {
    this.isLoading = true;
    const payload: any = { page: this.page, size: this.size };
    
    // Only add status filter if it's a valid status (not 'overdue')
    if (this.activeFilter && this.activeFilter !== 'overdue') {
      payload.status = this.activeFilter;
    }

    this.api.getTaskList(payload).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (!res.success) { 
          this.toast.show(res.message || 'Failed to load tasks', 'error'); 
          return; 
        }
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
        
        // Update allTasks if no filter is active
        if (!this.activeFilter) {
          this.allTasks = [...this.tasks];
        }
        this.buildStats();
      },
      error: () => { 
        this.isLoading = false; 
        this.toast.show('Error fetching tasks', 'error'); 
      }
    });
  }

  // ── Load Employees for dropdown ───────────────────────
  loadEmployees(): void {
    this.api.getEmployeeList(1, 100).subscribe({
      next: (res: any) => {
        if (res.success) {
          const all = res.data?.items ?? res.data?.content ?? [];
          this.employees = all.filter((e: any) => e.role !== 'ADMIN');
        }
      },
      error: () => { }
    });
  }

  // ── Stats (use allTasks for accurate counts) ──────────
  buildStats(): void {
    const tasksForStats = this.allTasks.length > 0 ? this.allTasks : this.tasks;
    
    this.statCards = [
      { 
        label: 'Total', 
        filter: '', 
        count: tasksForStats.length, 
        icon: 'assignment', 
        color: 'teal' 
      },
      { 
        label: 'Pending', 
        filter: 'PENDING', 
        count: tasksForStats.filter(t => t.status === 'PENDING').length, 
        icon: 'pending', 
        color: 'amber' 
      },
      { 
        label: 'In Progress', 
        filter: 'IN_PROGRESS', 
        count: tasksForStats.filter(t => t.status === 'IN_PROGRESS').length, 
        icon: 'autorenew', 
        color: 'blue' 
      },
      { 
        label: 'Completed', 
        filter: 'COMPLETED', 
        count: tasksForStats.filter(t => t.status === 'COMPLETED').length, 
        icon: 'task_alt', 
        color: 'green' 
      },
      { 
        label: 'Overdue', 
        filter: 'overdue', 
        count: tasksForStats.filter(t => this.isOverdue(t.endDate || t.startDate) && t.status !== 'COMPLETED').length, 
        icon: 'warning', 
        color: 'red' 
      },
    ];
  }

  // ── Filter / Search ───────────────────────────────────
  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.page = 0;
    
    // For 'overdue' filter, we do client-side filtering
    if (filter === 'overdue') {
      // Don't call API, just filter existing data
      this.buildStats();
    } else {
      this.loadTasks();
    }
  }

  onSearch(): void {
    // Client-side search - triggers filteredTasks getter
  }

  get filteredTasks(): any[] {
    let result = [...this.tasks];
    
    // Apply status filter (for client-side filtering or when API doesn't filter)
    if (this.activeFilter) {
      if (this.activeFilter === 'overdue') {
        // Filter overdue tasks
        result = result.filter(t => 
          this.isOverdue(t.endDate || t.startDate) && t.status !== 'COMPLETED'
        );
      } else {
        // Filter by status
        result = result.filter(t => t.status === this.activeFilter);
      }
    }
    
    // Apply search filter
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.assignedTo?.toLowerCase().includes(q) ||
        t.taskCode?.toLowerCase().includes(q)
      );
    }
    
    return result;
  }

  getTasksByStatus(status: string): any[] {
    return this.filteredTasks.filter(t => t.status === status);
  }

  // ── Helpers ───────────────────────────────────────────
  getInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  isOverdue(date: string | null): boolean {
    if (!date) return false;
    const taskDate = new Date(date);
    const now = new Date();
    // Set time to end of day for comparison
    now.setHours(23, 59, 59, 999);
    return taskDate < now;
  }

  formatStatus(status: string): string {
    return status?.replace('_', ' ') ?? '—';
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

  // ── Date Formatting Helper ────────────────────────────
  formatDateForInput(dateString: string | Date | null): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    // Format: YYYY-MM-DDTHH:mm (required for datetime-local input)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // ── Find Employee ID from Name ────────────────────────
  findEmployeeIdByName(name: string): number | null {
    if (!name) return null;
    const employee = this.employees.find(e => 
      `${e.firstName} ${e.lastName}`.toLowerCase() === name.toLowerCase() ||
      e.firstName?.toLowerCase() === name.toLowerCase()
    );
    return employee?.id || null;
  }

  // ── Modal ─────────────────────────────────────────────
  emptyForm() {
    return {
      id: null,
      taskCode: '',
      title: '',
      description: '',
      status: 'PENDING',
      priority: 'MEDIUM',
      assignedUserId: null as number | null,
      startDate: '',
      endDate: '',
    };
  }

  openAddModal(): void {
    this.isEditMode = false;
    this.errors = {};
    this.form = this.emptyForm();
    this.showModal = true;
  }

  openEditModal(task: any): void {
    this.isEditMode = true;
    this.errors = {};
    
    // Find the assigned user ID
    let assignedUserId: number | null = null;
    
    if (task.assignedUserId) {
      assignedUserId = task.assignedUserId;
    } else if (task.assignedTo) {
      // Try to find employee by name
      assignedUserId = this.findEmployeeIdByName(task.assignedTo);
    }

    this.form = {
      id: task.id,
      taskCode: task.taskCode || '',
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'PENDING',
      priority: task.priority || 'MEDIUM',
      assignedUserId: assignedUserId,
      startDate: this.formatDateForInput(task.startDate),
      endDate: this.formatDateForInput(task.endDate),
    };
    
    console.log('Edit form populated:', this.form);
    console.log('Task data:', task);
    console.log('Employees:', this.employees);
    
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.isEditMode = false;
    this.errors = {};
    this.form = this.emptyForm();
  }

  openViewModal(task: any): void {
    this.viewTask = task;
    this.showViewModal = true;
  }

  closeViewModal(): void {
    this.showViewModal = false;
    this.viewTask = null;
  }

  clearError(field: string): void { 
    delete this.errors[field]; 
  }

  validateForm(): boolean {
    this.errors = {};
    if (!this.form.title?.trim()) {
      this.errors.title = 'Title is required';
    }
    if (!this.form.assignedUserId) {
      this.errors.assignedUserId = 'Please assign to an employee';
    }
    if (!this.form.status) {
      this.errors.status = 'Status is required';
    }
    return Object.keys(this.errors).length === 0;
  }

  // ── Submit ────────────────────────────────────────────
  submitTask(): void {
    if (!this.validateForm()) {
      this.toast.show('Please fix the errors', 'error');
      return;
    }
    this.isSubmitting = true;

    const payload: any = {
      title: this.form.title.trim(),
      description: this.form.description || null,
      status: this.form.status,
      priority: this.form.priority || 'MEDIUM',
      assignedUserId: Number(this.form.assignedUserId),
      startDate: this.form.startDate || null,
      endDate: this.form.endDate || null,
    };
    
    // Only include id and taskCode for edit mode
    if (this.isEditMode && this.form.id) {
      payload.id = this.form.id;
      // Don't send taskCode in update if it shouldn't be changed
      // payload.taskCode = this.form.taskCode;
    }

    console.log('Submitting payload:', payload);

    this.api.createOrUpdateTask(payload).subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        if (res.success) {
          this.toast.show(
            this.isEditMode ? 'Task updated!' : 'Task created!', 'success'
          );
          this.closeModal();
          this.loadTasks();
          this.loadAllTasksForStats(); // Refresh stats
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
  prevPage(): void { 
    if (!this.isFirst) { 
      this.page--; 
      this.loadTasks(); 
    } 
  }
  
  nextPage(): void { 
    if (!this.isLast) { 
      this.page++; 
      this.loadTasks(); 
    } 
  }
}