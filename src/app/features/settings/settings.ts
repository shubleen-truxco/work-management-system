import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Sidebar } from '../../shared/sidebar/sidebar';

// ── Action badge color map ─────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  CREATE:    'al-badge-green',
  UPDATE:    'al-badge-blue',
  DELETE:    'al-badge-red',
  CHECK_IN:  'al-badge-teal',
  CHECK_OUT: 'al-badge-orange',
  APPROVE:   'al-badge-green',
  REJECT:    'al-badge-red',
  LOGIN:     'al-badge-purple',
  LOGOUT:    'al-badge-gray',
  UPLOAD:    'al-badge-blue',
  DOWNLOAD:  'al-badge-teal',
  ASSIGN:    'al-badge-amber',
  COMPLETE:  'al-badge-green',
  COMMENT:   'al-badge-purple',
};

const MODULE_ICONS: Record<string, string> = {
  TASKS:      'task_alt',
  ATTENDANCE: 'fingerprint',
  LEAVES:     'event_busy',
  PROJECTS:   'folder_open',
  USERS:      'manage_accounts',
  PAYROLL:    'payments',
  CHAT:       'chat',
  SETTINGS:   'settings',
  REPORTS:    'bar_chart',
};

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar],
  templateUrl: './settings.html',
  styleUrls: ['./settings.css'],
})
export class Settings implements OnInit {

  activePanel = 'company';

  // ── Role ──────────────────────────────────────────────────────────
  isAdmin = (sessionStorage.getItem('role') || '').toUpperCase() === 'ADMIN';

  // ── Nav Sections ──────────────────────────────────────────────────
  generalSettings = [
    { key: 'company',    label: 'Company Settings', icon: 'business' },
    { key: 'work-hours', label: 'Work Hours',        icon: 'schedule' },
    { key: 'appearance', label: 'Appearance',        icon: 'palette'  },
  ];

  managementSettings = [
    { key: 'designation',     label: 'Designations',    icon: 'work'           },
    { key: 'task-categories', label: 'Task Categories', icon: 'category'       },
    { key: 'activity-logs',   label: 'Activity Logs',   icon: 'manage_search'  },
  ];

  systemSettings = [
    { key: 'notifications', label: 'Notifications', icon: 'notifications' },
    { key: 'security',      label: 'Security',      icon: 'security'      },
  ];

  setPanel(key: string): void {
    this.activePanel = key;
    // Lazy-load activity logs when that panel is opened
    if (key === 'activity-logs') {
      this.alCurrentPage = 1;
      this.alLogs = [];
      this.loadActivityLogs();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // ACTIVITY LOG PANEL STATE
  // ══════════════════════════════════════════════════════════════════

  private alDestroy$ = new Subject<void>();
  private alSearch$  = new Subject<string>();

  // Tabs
  alActiveTab: 'my' | 'all' | 'user' | 'entity' = 'my';

  // Filters
  alModule = 'ALL';
  alAction = 'ALL';
  alSearch = '';

  // User tab
  alTargetUserId = '';

  // Entity tab
  alEntityModule = '';
  alEntityId     = '';

  // Data
  alLogs: any[]  = [];
  alAllLogs: any[] = [];
  alLoading      = false;

  // Pagination
  alCurrentPage  = 1;
  alPageSize     = 20;
  alTotalItems   = 0;
  alTotalPages   = 1;

  // Options
  alModuleOptions = ['ALL','TASKS','AUTH','LEAVES','PROJECTS','USERS','PAYROLL','CHAT','SETTINGS','REPORTS'];
  alActionOptions = ['ALL','CREATE','UPDATE','DELETE','CHECK_IN','CHECK_OUT','APPROVE','REJECT','LOGIN','LOGOUT','UPLOAD','DOWNLOAD','ASSIGN','COMPLETE','COMMENT'];

  // Stats
  alStats = { total: 0, today: 0, week: 0 };

  // ── Tab switch ────────────────────────────────────────────────────
  alSetTab(tab: 'my' | 'all' | 'user' | 'entity'): void {
    if (this.alActiveTab === tab) return;
    this.alActiveTab   = tab;
    this.alCurrentPage = 1;
    this.alLogs        = [];
    this.loadActivityLogs();
  }

  // ── Filter change ─────────────────────────────────────────────────
  alOnFilterChange(): void {
    this.alCurrentPage = 1;
    this.loadActivityLogs();
  }

  alOnSearchChange(): void {
    this.alSearch$.next(this.alSearch);
  }

  // ── Main loader dispatcher ────────────────────────────────────────
  loadActivityLogs(): void {
    switch (this.alActiveTab) {
      case 'my':     this.alLoadMy();     break;
      case 'all':    this.alLoadAll();    break;
      case 'user':   this.alLoadUser();   break;
      case 'entity': this.alLoadEntity(); break;
    }
  }

  private alLoadMy(): void {
    this.alLoading = true;
    this.api.getMyActivity(
      this.alCurrentPage,
      this.alPageSize,
      this.alModule === 'ALL' ? undefined : this.alModule,
      this.alAction === 'ALL' ? undefined : this.alAction,
    ).subscribe({
      next: (res: any) => this.alHandleResponse(res),
      error: ()        => this.alHandleError(),
    });
  }

  private alLoadAll(): void {
    if (!this.isAdmin) return;
    this.alLoading = true;
    this.api.getAllActivity(
      this.alCurrentPage,
      this.alPageSize,
      this.alModule === 'ALL' ? undefined : this.alModule,
    ).subscribe({
      next: (res: any) => this.alHandleResponse(res),
      error: ()        => this.alHandleError(),
    });
  }

  alLoadUser(): void {
    if (!this.isAdmin || !this.alTargetUserId.trim()) return;
    this.alLoading = true;
    this.api.getActivityForUser(
      this.alTargetUserId.trim(),
      this.alCurrentPage,
      this.alPageSize,
      this.alModule === 'ALL' ? undefined : this.alModule,
      this.alAction === 'ALL' ? undefined : this.alAction,
    ).subscribe({
      next: (res: any) => this.alHandleResponse(res),
      error: ()        => this.alHandleError(),
    });
  }

  alLoadEntity(): void {
    if (!this.alEntityModule.trim() || !this.alEntityId.trim()) return;
    this.alLoading = true;
    this.api.getActivityByTypeAndId(
      this.alEntityModule.trim().toUpperCase(),
      this.alEntityId.trim(),
      this.alCurrentPage,
      this.alPageSize,
    ).subscribe({
      next: (res: any) => this.alHandleResponse(res),
      error: ()        => this.alHandleError(),
    });
  }

  private alHandleResponse(res: any): void {
    this.alLoading = false;
    if (!res?.success) {
      this.toast.show(res?.message || 'Failed to load activity', 'error');
      this.cdr.markForCheck();
      return;
    }
    const data = res.data;
    if (Array.isArray(data)) {
      this.alLogs       = data;
      this.alTotalItems = data.length;
      this.alTotalPages = 1;
    } else {
      this.alLogs       = data?.items ?? data?.content ?? [];
      this.alTotalItems = data?.pagination?.totalItems ?? data?.totalElements ?? this.alLogs.length;
      this.alTotalPages = data?.pagination?.totalPages ?? data?.totalPages ?? 1;
    }
    this.alComputeStats();
    this.cdr.markForCheck();
  }

  private alHandleError(): void {
    this.alLoading = false;
    this.toast.show('Failed to load activity log', 'error');
    this.cdr.markForCheck();
  }

  private alComputeStats(): void {
    const now      = new Date();
    const todayStr = now.toDateString();
    const weekAgo  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    this.alStats.total = this.alTotalItems;
    this.alStats.today = this.alLogs.filter(l => {
      const d = new Date(l.timestamp ?? l.createdAt ?? l.loggedAt ?? '');
      return d.toDateString() === todayStr;
    }).length;
    this.alStats.week = this.alLogs.filter(l => {
      const d = new Date(l.timestamp ?? l.createdAt ?? l.loggedAt ?? '');
      return d >= weekAgo;
    }).length;
  }

  // ── Pagination ────────────────────────────────────────────────────
  alGoToPage(page: number): void {
    if (page < 1 || page > this.alTotalPages) return;
    this.alCurrentPage = page;
    this.loadActivityLogs();
  }

  get alPageNumbers(): number[] {
    const total = this.alTotalPages;
    const cur   = this.alCurrentPage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    if (cur > 3) pages.push(-1);
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
    if (cur < total - 2) pages.push(-1);
    pages.push(total);
    return pages;
  }

  // ── Filtered logs (client-side search) ───────────────────────────
  get alFilteredLogs(): any[] {
    if (!this.alSearch.trim()) return this.alLogs;
    const q = this.alSearch.toLowerCase();
    return this.alLogs.filter(l =>
      (this.alGetDesc(l) + this.alGetUser(l) + (l.action ?? '') + (l.module ?? '') + this.alGetEntity(l))
        .toLowerCase().includes(q)
    );
  }

  // ── Display helpers ───────────────────────────────────────────────
  alGetBadgeClass(action: string): string {
    return ACTION_COLORS[action?.toUpperCase()] ?? 'al-badge-gray';
  }

  alGetModuleIcon(module: string): string {
    return MODULE_ICONS[module?.toUpperCase()] ?? 'label';
  }

  alFormatTime(raw: string): string {
    if (!raw) return '—';
    try {
      return new Date(raw).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
    } catch { return raw; }
  }

  alRelativeTime(raw: string): string {
    if (!raw) return '';
    try {
      const s = Math.floor((Date.now() - new Date(raw).getTime()) / 1000);
      if (s < 60)  return `${s}s ago`;
      const m = Math.floor(s / 60);
      if (m < 60)  return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24)  return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    } catch { return ''; }
  }

  alGetTs(log: any):     string { return log.timestamp ?? log.createdAt ?? log.loggedAt ?? log.performedAt ?? ''; }
  alGetDesc(log: any):   string { return log.description ?? log.details ?? log.message ?? log.note ?? ''; }
  alGetUser(log: any):   string { return log.userName ?? log.performedBy ?? log.userId ?? '—'; }
  alGetEntity(log: any): string {
    const t = log.entityType ?? log.module ?? '';
    const i = log.entityId   ?? log.referenceId ?? '';
    if (!t && !i) return '';
    return i ? `${t} #${i}` : t;
  }
  alGetIp(log: any): string { return log.ipAddress ?? log.ip ?? ''; }

  alTrackById(_: number, log: any): any { return log.id ?? log.logId ?? _; }

  // ── Export CSV ────────────────────────────────────────────────────
  alExportCsv(): void {
    const rows = [
      ['Timestamp','User','Module','Action','Description','Entity','IP'],
      ...this.alFilteredLogs.map(l => [
        this.alFormatTime(this.alGetTs(l)),
        this.alGetUser(l), l.module ?? '', l.action ?? '',
        this.alGetDesc(l), this.alGetEntity(l), this.alGetIp(l),
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `activity-log-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════
  // COMPANY
  // ══════════════════════════════════════════════════════════════════

  company = { name: '', email: '', phone: '', website: '', address: '' };

  saveCompany(): void {
    this.toast.show('Company settings saved!', 'success');
  }

  // ══════════════════════════════════════════════════════════════════
  // DESIGNATIONS
  // ══════════════════════════════════════════════════════════════════

  designations: any[] = [];
  newDesignation = '';

  fetchDesignations(): void {
    this.api.getDesignations().subscribe({
      next: (res: any) => {
        const raw = res?.success ? res.data : (Array.isArray(res) ? res : []);
        this.designations = raw.map((d: any) => ({ ...d, editing: false, editName: d.name }));
      },
      error: () => this.toast.show('Failed to load designations', 'error'),
    });
  }

  addDesignation(): void {
    if (!this.newDesignation.trim()) return;
    this.api.addDesignation({ name: this.newDesignation.trim() }).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toast.show('Designation added!', 'success');
          this.newDesignation = '';
          this.fetchDesignations();
        } else {
          this.toast.show(res.message || 'Failed to add', 'error');
        }
      },
      error: () => this.toast.show('Error adding designation', 'error'),
    });
  }

  editDesignation(d: any): void { d.editing = true; d.editName = d.name; }

  saveDesignation(d: any): void {
    if (!d.editName.trim()) return;
    d.name = d.editName; d.editing = false;
    this.toast.show('Designation updated!', 'success');
  }

  cancelEdit(d: any): void { d.editing = false; d.editName = d.name; }

  deleteDesignation(d: any): void {
    this.designations = this.designations.filter(x => x.id !== d.id);
    this.toast.show('Designation removed', 'success');
  }

  // ══════════════════════════════════════════════════════════════════
  // TASK CATEGORIES
  // ══════════════════════════════════════════════════════════════════

  taskCategories: any[] = [];
  newCategory      = '';
  newCategoryColor = '#0891b2';

  addCategory(): void {
    if (!this.newCategory.trim()) return;
    this.taskCategories.push({ id: Date.now(), name: this.newCategory.trim(), color: this.newCategoryColor });
    this.newCategory = '';
    this.toast.show('Category added!', 'success');
  }

  deleteCategory(cat: any): void {
    this.taskCategories = this.taskCategories.filter(c => c.id !== cat.id);
    this.toast.show('Category removed', 'success');
  }

  // ══════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ══════════════════════════════════════════════════════════════════

  emailNotifications = [
    { icon: 'person_add', label: 'New Employee Added',  desc: 'Get notified when a new employee is added',   enabled: true  },
    { icon: 'task_alt',   label: 'Task Assigned',       desc: 'Get notified when a task is assigned to you', enabled: true  },
    { icon: 'warning',    label: 'Attendance Alert',    desc: 'Get alerts for attendance issues',            enabled: false },
    { icon: 'report',     label: 'Monthly Reports',     desc: 'Receive monthly summary reports via email',   enabled: true  },
  ];

  pushNotifications = [
    { icon: 'notifications_active', label: 'Real-time Alerts', desc: 'Instant push notifications for critical events', enabled: true  },
    { icon: 'chat',                 label: 'Messages',          desc: 'Get push notifications for new messages',        enabled: false },
    { icon: 'update',               label: 'System Updates',    desc: 'Notifications for system updates',               enabled: true  },
  ];

  saveNotifications(): void { this.toast.show('Notification preferences saved!', 'success'); }

  // ══════════════════════════════════════════════════════════════════
  // WORK HOURS
  // ══════════════════════════════════════════════════════════════════

  workHours = { timeIn: '09:00', breakTime: '01:00', workDays: ['mon','tue','wed','thu','fri'] };

  weekDays = [
    { key: 'sun', label: 'Su' }, { key: 'mon', label: 'Mo' },
    { key: 'tue', label: 'Tu' }, { key: 'wed', label: 'We' },
    { key: 'thu', label: 'Th' }, { key: 'fri', label: 'Fr' },
    { key: 'sat', label: 'Sa' },
  ];

  toggleDay(key: string): void {
    const idx = this.workHours.workDays.indexOf(key);
    idx === -1 ? this.workHours.workDays.push(key) : this.workHours.workDays.splice(idx, 1);
  }

  saveWorkHours(): void { this.toast.show('Work hours saved!', 'success'); }

  // ══════════════════════════════════════════════════════════════════
  // SECURITY
  // ══════════════════════════════════════════════════════════════════

  showChangePassword = false;
  passwordForm = { current: '', newPass: '', confirm: '' };

  changePassword(): void {
    if (!this.passwordForm.current || !this.passwordForm.newPass) {
      this.toast.show('Please fill all password fields', 'error'); return;
    }
    if (this.passwordForm.newPass !== this.passwordForm.confirm) {
      this.toast.show('Passwords do not match', 'error'); return;
    }
    this.toast.show('Password updated successfully!', 'success');
    this.showChangePassword = false;
    this.passwordForm = { current: '', newPass: '', confirm: '' };
  }

  // ══════════════════════════════════════════════════════════════════
  // APPEARANCE
  // ══════════════════════════════════════════════════════════════════

  appearance = { theme: 'light', language: 'en', timezone: 'IST' };

  saveAppearance(): void { this.toast.show('Appearance settings saved!', 'success'); }

  // ══════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════

  constructor(
    private api   : ApiService,
    private toast : ToastService,
    private cdr   : ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.fetchDesignations();

    // Debounced search for activity log
    this.alSearch$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntil(this.alDestroy$),
    ).subscribe(() => {
      this.alCurrentPage = 1;
      this.loadActivityLogs();
    });
  }

  ngOnDestroy(): void {
    this.alDestroy$.next();
    this.alDestroy$.complete();
  }
}