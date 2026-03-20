import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar, DatePipe],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css'],
})
export class Reports implements OnInit {

  // ── Report type ───────────────────────────────────
  activeTab: 'task' | 'attendance' | 'productivity' = 'task';

  // ── Loading states ────────────────────────────────
  isLoading        = false;
  isLoadingDetail  = false;
  isLoadingLogs    = false;
  isLoadingAttendance = false;
  isSubmitting     = false;

  // ── Task report ───────────────────────────────────
  tasks:      any[] = [];
  allTasks:   any[] = [];
  selectedTask: any = null;
  taskLogs:   any[] = [];
  taskComments: any[] = [];
  newComment = '';
  detailTab: 'summary' | 'activity' | 'comments' = 'summary';
  page = 1; size = 10;
  totalPages = 1; currentPage = 1; isFirst = true; isLast = false;

  // ── Attendance report ─────────────────────────────
  attendanceList:     any[] = [];
  selectedAttendance: any   = null;
  attendanceSummary: any    = null;

  // ── Productivity report ───────────────────────────
  productivityList: any[] = [];
  selectedEmployee: any   = null;
  productivityData: any   = null;

  // ── Employees ─────────────────────────────────────
  employees: any[] = [];

  // ── Filters (per tab) ─────────────────────────────
  taskFilters = { status: '', priority: '', search: '', dateFrom: '', dateTo: '' };
  attFilters  = { employeeId: '', dateFrom: '', dateTo: '' };
  prodFilters = { employeeId: '', dateFrom: '', dateTo: '' };

  // ── Stats ─────────────────────────────────────────
  statCards: any[] = [];

  // ── Options ───────────────────────────────────────
  statusOptions  = [
    { value: '',            label: 'All Status'  },
    { value: 'PENDING',     label: 'Pending'     },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED',   label: 'Completed'   },
  ];

  priorityOptions = [
    { value: '',       label: 'All Priority' },
    { value: 'HIGH',   label: 'High'         },
    { value: 'MEDIUM', label: 'Medium'       },
    { value: 'LOW',    label: 'Low'          },
  ];

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.loadEmployees();
    this.loadAllForStats();
    this.loadTasks();
  }

  // ══ TAB SWITCHING ════════════════════════════════
  setTab(tab: 'task' | 'attendance' | 'productivity'): void {
    this.activeTab   = tab;
    this.selectedTask       = null;
    this.selectedAttendance = null;
    this.selectedEmployee   = null;
    if (tab === 'attendance')   this.loadAttendance();
    if (tab === 'productivity') this.loadProductivity();
  }

  // ══ EMPLOYEES ════════════════════════════════════
  loadEmployees(): void {
    this.api.getEmployeeList(1, 100).subscribe({
      next: (res: any) => {
        if (res.success) {
          const all = res.data?.items ?? res.data?.content ?? [];
          this.employees = all.filter((e: any) =>
            !['ADMIN'].includes(e.role?.name ?? e.role ?? ''));
        }
      }, error: () => {}
    });
  }

  // ══ STATS ════════════════════════════════════════
  loadAllForStats(): void {
    this.api.getTaskList({ page: 1, size: 1000 }).subscribe({
      next: (res: any) => {
        if (res.success) { this.allTasks = res.data?.items ?? []; this.buildStats(); }
      }, error: () => {}
    });
  }

  buildStats(): void {
    const t = this.allTasks;
    const overdue = t.filter(x => x.status !== 'COMPLETED' && x.endDate && new Date(x.endDate) < new Date()).length;
    this.statCards = [
      { label: 'Total',       value: t.length,                                         icon: 'assignment',  color: 'teal',  sub: 'All tasks'     },
      { label: 'Completed',   value: t.filter(x => x.status === 'COMPLETED').length,   icon: 'task_alt',    color: 'green', sub: 'Finished'      },
      { label: 'In Progress', value: t.filter(x => x.status === 'IN_PROGRESS').length, icon: 'autorenew',   color: 'blue',  sub: 'Active'        },
      { label: 'Overdue',     value: overdue,                                           icon: 'warning',     color: 'red',   sub: 'Past deadline'  },
    ];
  }

  // ══ TASK REPORT ══════════════════════════════════
  loadTasks(): void {
    this.isLoading = true;
    const p: any = { page: this.page, size: this.size };
    if (this.taskFilters.status)   p.status   = this.taskFilters.status;
    if (this.taskFilters.priority) p.priority = this.taskFilters.priority;
    this.api.getTaskList(p).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        const data = res.data;
        this.tasks       = data?.items      ?? [];
        this.totalPages  = data?.totalPages ?? 1;
        this.currentPage = data?.currentPage ?? 1;
        this.isFirst     = data?.isFirst    ?? true;
        this.isLast      = data?.isLast     ?? false;
      }, error: () => { this.isLoading = false; }
    });
  }

  applyTaskFilters(): void { this.page = 1; this.selectedTask = null; this.loadTasks(); }
  resetTaskFilters(): void { this.taskFilters = { status:'', priority:'', search:'', dateFrom:'', dateTo:'' }; this.page = 1; this.selectedTask = null; this.loadTasks(); }

  selectTask(task: any): void {
    if (this.selectedTask?.id === task.id) return;
    this.selectedTask = task;
    this.detailTab    = 'summary';
    this.newComment   = '';
    this.loadTaskDetail(task.id);
    this.loadTaskLogs(task.id);
  }

  loadTaskDetail(id: number): void {
    this.isLoadingDetail = true;
    this.api.getTaskList({ taskId: id }).subscribe({
      next: (res: any) => {
        this.isLoadingDetail = false;
        if (res.success) {
          this.selectedTask = res.data;
          this.taskComments = res.data?.comments ?? [];
        }
      }, error: () => { this.isLoadingDetail = false; }
    });
  }

  loadTaskLogs(id: number): void {
    this.isLoadingLogs = true;
    this.taskLogs = [];
    this.api.getActivityQuery({ module: 'TASKS', id: String(id) }).subscribe({
      next: (res: any) => {
        this.isLoadingLogs = false;
        this.taskLogs = res.success ? (res.data?.items ?? res.data ?? []) : [];
      }, error: () => { this.isLoadingLogs = false; }
    });
  }

  submitComment(): void {
    if (!this.newComment.trim() || !this.selectedTask?.id) return;
    this.isSubmitting = true;
    this.api.addTaskComment(this.selectedTask.id, this.newComment.trim()).subscribe({
      next: (res: any) => {
        this.isSubmitting = false;
        if (res.success) {
          this.toast.show('Comment posted!', 'success');
          this.newComment = '';
          this.loadTaskDetail(this.selectedTask.id);
          this.loadTaskLogs(this.selectedTask.id);
        } else {
          this.toast.show(res.message || 'Failed', 'error');
        }
      }, error: () => { this.isSubmitting = false; }
    });
  }

  prevPage(): void { if (!this.isFirst) { this.page--; this.loadTasks(); } }
  nextPage(): void { if (!this.isLast)  { this.page++; this.loadTasks(); } }

  // ══ ATTENDANCE REPORT ════════════════════════════
  loadAttendance(): void {
    this.isLoadingAttendance = true;
    this.attendanceList      = [];
    this.selectedAttendance  = null;

    // Your controller: POST /attendance-list?page=1&size=50&userId=3&date=2026-03-01
    const params: any = { page: 1, size: 50 };
    if (this.attFilters.employeeId) params['userId'] = this.attFilters.employeeId;
    if (this.attFilters.dateFrom)   params['date']   = this.attFilters.dateFrom;  // single date filter

    this.api.getAttendanceList(params).subscribe({
      next: (res: any) => {
        this.isLoadingAttendance = false;
        if (res.success) {
          this.attendanceList = res.data?.items ?? res.data?.content ?? (Array.isArray(res.data) ? res.data : []);
          this.buildAttendanceSummary();
        }
      }, error: () => { this.isLoadingAttendance = false; }
    });
  }

  applyAttFilters(): void { this.selectedAttendance = null; this.loadAttendance(); }
  resetAttFilters(): void { this.attFilters = { employeeId:'', dateFrom:'', dateTo:'' }; this.selectedAttendance = null; this.loadAttendance(); }

  buildAttendanceSummary(): void {
    const list = this.attendanceList;
    if (!list.length) { this.attendanceSummary = null; return; }
    const totalDays   = list.length;
    const present     = list.filter(a => a.status?.toLowerCase() === 'present').length;
    const totalHours  = list.reduce((s: number, a: any) => s + (a.totalWorkHours ?? 0), 0);
    const totalBreak  = list.reduce((s: number, a: any) => s + (a.totalBreakMinutes ?? 0), 0);
    const avgHours    = totalDays ? (totalHours / totalDays).toFixed(1) : '0';
    this.attendanceSummary = { totalDays, present, absent: totalDays - present, totalHours: totalHours.toFixed(1), avgHours, totalBreakMins: totalBreak };
  }

  selectAttendance(att: any): void { this.selectedAttendance = att; }

  // ══ PRODUCTIVITY REPORT ══════════════════════════
  loadProductivity(): void {
    this.isLoading = true;
    this.productivityList = [];
    this.selectedEmployee = null;
    this.productivityData = null;
    // Load employees with their task counts
    this.api.getTaskList({ page: 1, size: 1000 }).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (res.success) {
          const allTasks = res.data?.items ?? [];
          this.buildProductivityData(allTasks);
        }
      }, error: () => { this.isLoading = false; }
    });
  }

  applyProdFilters(): void { this.selectedEmployee = null; this.productivityData = null; this.loadProductivity(); }
  resetProdFilters(): void { this.prodFilters = { employeeId:'', dateFrom:'', dateTo:'' }; this.selectedEmployee = null; this.productivityData = null; this.loadProductivity(); }

  buildProductivityData(allTasks: any[]): void {
    // Group tasks by assignee
    const empMap = new Map<number, any>();
    allTasks.forEach((task: any) => {
      (task.assignedUsers ?? []).forEach((u: any) => {
        const id = typeof u === 'object' ? u.id : null;
        const name = typeof u === 'object' ? u.name : u;
        if (!id) return;
        if (!empMap.has(id)) empMap.set(id, { id, name, tasks: [], total:0, completed:0, inProgress:0, pending:0, overdue:0 });
        const emp = empMap.get(id);
        emp.tasks.push(task);
        emp.total++;
        if (task.status === 'COMPLETED')   emp.completed++;
        if (task.status === 'IN_PROGRESS') emp.inProgress++;
        if (task.status === 'PENDING')     emp.pending++;
        if (task.status !== 'COMPLETED' && task.endDate && new Date(task.endDate) < new Date()) emp.overdue++;
      });
    });
    this.productivityList = Array.from(empMap.values())
      .sort((a, b) => b.total - a.total);
  }

  selectEmployee(emp: any): void {
    this.selectedEmployee = emp;
    this.productivityData = {
      completionRate: emp.total > 0 ? Math.round((emp.completed / emp.total) * 100) : 0,
      ...emp
    };
  }

  // ══ EXPORT ═══════════════════════════════════════
  exportPDF(): void {
    const tab = this.activeTab;
    let url = this.api.getBaseUrl() + '/reports/';

    if (tab === 'task') {
      url += 'tasks/pdf';
      const p = new URLSearchParams();
      if (this.taskFilters.status)   p.set('status',   this.taskFilters.status);
      if (this.taskFilters.priority) p.set('priority', this.taskFilters.priority);
      if (this.selectedTask?.id)     p.set('taskId',   String(this.selectedTask.id));
      if (p.toString()) url += '?' + p.toString();
    } else if (tab === 'attendance') {
      url += 'attendance/pdf';
      if (this.attFilters.employeeId) url += '?userId=' + this.attFilters.employeeId;
    } else {
      url += 'productivity/pdf';
      if (this.selectedEmployee?.id) url += '?userId=' + this.selectedEmployee.id;
    }

    // Open in new tab — browser will download the PDF
    window.open(url, '_blank');
  }

  exportEmail(): void {
    const emailAddr = prompt('Enter email address to send the report:');
    if (!emailAddr || !emailAddr.includes('@')) {
      this.toast.show('Invalid email address', 'error');
      return;
    }

    const tab = this.activeTab;
    let endpoint = '';
    const body: any = { email: emailAddr };

    if (tab === 'task') {
      endpoint = '/reports/tasks/email';
      if (this.taskFilters.status)   body['status']   = this.taskFilters.status;
      if (this.taskFilters.priority) body['priority'] = this.taskFilters.priority;
    } else if (tab === 'attendance') {
      endpoint = '/reports/attendance/email';
      if (this.attFilters.employeeId) body['userId'] = Number(this.attFilters.employeeId);
    } else {
      endpoint = '/reports/productivity/email';
      if (this.selectedEmployee?.id) body['userId'] = this.selectedEmployee.id;
    }

    this.api.post(endpoint, body).subscribe({
      next: (res: any) => {
        if (res.success) this.toast.show('Report sent to ' + emailAddr, 'success');
        else this.toast.show(res.message || 'Failed to send', 'error');
      },
      error: () => this.toast.show('Failed to send report', 'error')
    });
  }

  // ══ HELPERS ══════════════════════════════════════
  get filteredTasks(): any[] {
    let r = [...this.tasks];
    if (this.taskFilters.search.trim()) {
      const q = this.taskFilters.search.toLowerCase();
      r = r.filter(t => t.title?.toLowerCase().includes(q) || t.taskCode?.toLowerCase().includes(q) ||
        (t.assignedUsers ?? []).some((u: any) => this.getName(u).toLowerCase().includes(q)));
    }
    return r;
  }

  getName(u: any): string { return typeof u === 'object' ? (u?.name ?? '?') : (u ?? '?'); }
  getInitial(u: any): string { return this.getName(u).charAt(0).toUpperCase(); }
  isOverdue(d: string): boolean { return !!d && new Date(d) < new Date(); }
  fmtStatus(s: string): string { return s ? s.split('_').join(' ') : '—'; }
  fmtAction(a: string): string { return a ? a.split('_').join(' ') : ''; }

  statusClass(s: string): string {
    const m: any = { PENDING:'s-amber', IN_PROGRESS:'s-teal', COMPLETED:'s-green', ON_HOLD:'s-purple', CANCELLED:'s-red' };
    return m[s] || '';
  }
  statusDot(s: string): string {
    const m: any = { PENDING:'dot-amber', IN_PROGRESS:'dot-teal', COMPLETED:'dot-green', ON_HOLD:'dot-purple', CANCELLED:'dot-red' };
    return m[s] || '';
  }
  priClass(p: string): string {
    const m: any = { HIGH:'p-high', MEDIUM:'p-medium', LOW:'p-low' };
    return m[p] || '';
  }
  priIcon(p: string): string {
    const m: any = { HIGH:'keyboard_double_arrow_up', MEDIUM:'drag_handle', LOW:'keyboard_double_arrow_down' };
    return m[p] || 'drag_handle';
  }
  logIcon(a: string): string {
    const m: any = { TASK_CREATED:'add_task', TASK_UPDATED:'edit_note', TASK_COMPLETED:'task_alt',
      TASK_STATUS_CHANGED:'sync', TASK_ASSIGNED:'assignment_ind', TASK_RECEIVED:'inbox', TASK_COMMENT:'comment' };
    return m[a] ?? 'history';
  }
  logColor(a: string): string {
    const m: any = { TASK_CREATED:'lc-teal', TASK_UPDATED:'lc-blue', TASK_COMPLETED:'lc-green',
      TASK_STATUS_CHANGED:'lc-amber', TASK_ASSIGNED:'lc-purple', TASK_RECEIVED:'lc-purple', TASK_COMMENT:'lc-gray' };
    return m[a] ?? 'lc-gray';
  }
  getProgress(task?: any): number {
    const t = task ?? this.selectedTask;
    const m: any = { PENDING:5, IN_PROGRESS:50, COMPLETED:100, ON_HOLD:25, CANCELLED:0 };
    return m[t?.status] ?? 0;
  }
  getProgressColor(task?: any): string {
    const t = task ?? this.selectedTask;
    const m: any = { PENDING:'var(--color-amber)', IN_PROGRESS:'var(--color-teal)', COMPLETED:'var(--color-success)', ON_HOLD:'#7c3aed' };
    return m[t?.status] ?? 'var(--color-teal)';
  }
  getDuration(): string {
    if (!this.selectedTask?.startDate || !this.selectedTask?.endDate) return '—';
    const d = Math.ceil((new Date(this.selectedTask.endDate).getTime() - new Date(this.selectedTask.startDate).getTime()) / 86400000);
    return d > 0 ? `${d} day${d > 1 ? 's' : ''}` : 'Same day';
  }
  get completedAt(): string | null { return this.taskLogs.find(l => l.action === 'TASK_COMPLETED')?.createdAt ?? null; }
  get statusLogs(): any[] { return this.taskLogs.filter(l => l.action === 'TASK_STATUS_CHANGED' || l.action === 'TASK_COMPLETED'); }
  objKeys(o: any): string[] { return o && typeof o === 'object' ? Object.keys(o) : []; }

  getAttStatusClass(s: string): string {
    const m: any = { Present:'att-present', Absent:'att-absent', Late:'att-late', 'Half Day':'att-half' };
    return m[s] || '';
  }

  empName(id: string): string {
    const e = this.employees.find(x => String(x.id) === String(id));
    return e ? `${e.firstName} ${e.lastName}` : 'Unknown';
  }

  prodBar(val: number, max: number): number {
    return max > 0 ? Math.round((val / max) * 100) : 0;
  }

  get maxProdTotal(): number {
    return Math.max(...this.productivityList.map(e => e.total), 1);
  }
}