import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { Subject }       from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject as RxSubject } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { Sidebar } from '../shared/sidebar/sidebar';
import { ToastService } from '../shared/toast/toast.service';

// ── Module options shown in the filter dropdowns ──────────────────
const MODULE_OPTIONS = [
  'ALL', 'TASKS', 'ATTENDANCE', 'LEAVES', 'PROJECTS',
  'USERS', 'PAYROLL', 'CHAT', 'SETTINGS', 'REPORTS',
];

// ── Action options (common across modules) ────────────────────────
const ACTION_OPTIONS = [
  'ALL', 'CREATE', 'UPDATE', 'DELETE', 'CHECK_IN', 'CHECK_OUT',
  'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'UPLOAD', 'DOWNLOAD',
  'ASSIGN', 'COMPLETE', 'COMMENT',
];

// ── Color map for action badge styling ────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  CREATE:    'badge-green',
  UPDATE:    'badge-blue',
  DELETE:    'badge-red',
  CHECK_IN:  'badge-teal',
  CHECK_OUT: 'badge-orange',
  APPROVE:   'badge-green',
  REJECT:    'badge-red',
  LOGIN:     'badge-purple',
  LOGOUT:    'badge-gray',
  UPLOAD:    'badge-blue',
  DOWNLOAD:  'badge-teal',
  ASSIGN:    'badge-amber',
  COMPLETE:  'badge-green',
  COMMENT:   'badge-purple',
};

// ── Module icon map ───────────────────────────────────────────────
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
  selector: 'app-activity-log',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar],
  templateUrl: './activitylog.html',
  styleUrls:   ['./activitylog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityLog implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();
  private searchInput$ = new RxSubject<string>();

  // ── Role ──────────────────────────────────────────────────────────
  isAdmin = (sessionStorage.getItem('role') || '').toUpperCase() === 'ADMIN';

  // ── View state ────────────────────────────────────────────────────
  activeTab: 'my' | 'all' | 'user' | 'entity' = 'my';

  // ── Filter state ──────────────────────────────────────────────────
  selectedModule = 'ALL';
  selectedAction = 'ALL';
  searchQuery    = '';

  // ── Entity query tab ─────────────────────────────────────────────
  entityModule = '';
  entityId     = '';

  // ── User tab ─────────────────────────────────────────────────────
  targetUserId = '';

  // ── Data ──────────────────────────────────────────────────────────
  logs: any[]   = [];
  isLoading     = false;

  // ── Pagination ────────────────────────────────────────────────────
  currentPage   = 1;
  pageSize      = 20;
  totalItems    = 0;
  totalPages    = 1;

  // ── Options for dropdowns ─────────────────────────────────────────
  moduleOptions = MODULE_OPTIONS;
  actionOptions = ACTION_OPTIONS;

  // ── Stats summary ─────────────────────────────────────────────────
  stats = { total: 0, today: 0, thisWeek: 0 };

  constructor(
    private api   : ApiService,
    private toast : ToastService,
    private cdr   : ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Debounced search re-triggers load
    this.searchInput$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => this.load());

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ══════════════════════════════════════════════════════
  // TAB SWITCHING
  // ══════════════════════════════════════════════════════

  setTab(tab: 'my' | 'all' | 'user' | 'entity'): void {
    if (this.activeTab === tab) return;
    this.activeTab   = tab;
    this.currentPage = 1;
    this.logs        = [];
    this.load();
  }

  // ══════════════════════════════════════════════════════
  // FILTER CHANGES
  // ══════════════════════════════════════════════════════

  onFilterChange(): void {
    this.currentPage = 1;
    this.load();
  }

  onSearchChange(): void {
    this.searchInput$.next(this.searchQuery);
  }

  // ══════════════════════════════════════════════════════
  // MAIN LOAD DISPATCHER
  // ══════════════════════════════════════════════════════

  load(): void {
    switch (this.activeTab) {
      case 'my':     this.loadMyActivity();    break;
      case 'all':    this.loadAllActivity();   break;
      case 'user':   this.loadUserActivity();  break;
      case 'entity': this.loadEntityActivity();break;
    }
  }

  // ── My activity ──────────────────────────────────────────────────
  private loadMyActivity(): void {
    this.isLoading = true;
    this.api.getMyActivity(
      this.currentPage,
      this.pageSize,
      this.selectedModule === 'ALL' ? undefined : this.selectedModule,
      this.selectedAction === 'ALL' ? undefined : this.selectedAction,
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => this.handleResponse(res),
      error: ()        => this.handleError(),
    });
  }

  // ── All activity (admin) ──────────────────────────────────────────
  private loadAllActivity(): void {
    if (!this.isAdmin) return;
    this.isLoading = true;
    this.api.getAllActivity(
      this.currentPage,
      this.pageSize,
      this.selectedModule === 'ALL' ? undefined : this.selectedModule,
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => this.handleResponse(res),
      error: ()        => this.handleError(),
    });
  }

  // ── Specific user activity (admin) ───────────────────────────────
  loadUserActivity(): void {
    if (!this.isAdmin || !this.targetUserId.trim()) return;
    this.isLoading = true;
    this.api.getActivityForUser(
      this.targetUserId.trim(),
      this.currentPage,
      this.pageSize,
      this.selectedModule === 'ALL' ? undefined : this.selectedModule,
      this.selectedAction === 'ALL' ? undefined : this.selectedAction,
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => this.handleResponse(res),
      error: ()        => this.handleError(),
    });
  }

  // ── Entity query ─────────────────────────────────────────────────
  loadEntityActivity(): void {
    if (!this.entityModule.trim() || !this.entityId.trim()) return;
    this.isLoading = true;
    this.api.getActivityByTypeAndId(
      this.entityModule.trim(),
      this.entityId.trim(),
      this.currentPage,
      this.pageSize,
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => this.handleResponse(res),
      error: ()        => this.handleError(),
    });
  }

  // ══════════════════════════════════════════════════════
  // RESPONSE HANDLER
  // ══════════════════════════════════════════════════════

  private handleResponse(res: any): void {
    this.isLoading = false;

    if (!res?.success) {
      this.toast.show(res?.message || 'Failed to load activity', 'error');
      this.cdr.markForCheck();
      return;
    }

    // Support both paginated { items, pagination } and plain array responses
    const data = res.data;
    if (Array.isArray(data)) {
      this.logs       = data;
      this.totalItems = data.length;
      this.totalPages = 1;
    } else {
      this.logs       = data?.items ?? data?.content ?? [];
      this.totalItems = data?.pagination?.totalItems ?? data?.totalElements ?? this.logs.length;
      this.totalPages = data?.pagination?.totalPages ?? data?.totalPages ?? 1;
    }

    this.computeStats();
    this.cdr.markForCheck();
  }

  private handleError(): void {
    this.isLoading = false;
    this.toast.show('Failed to load activity log', 'error');
    this.cdr.markForCheck();
  }

  // ══════════════════════════════════════════════════════
  // STATS COMPUTATION
  // ══════════════════════════════════════════════════════

  private computeStats(): void {
    const now     = new Date();
    const todayStr = now.toDateString();
    const weekAgo  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    this.stats.total    = this.totalItems;
    this.stats.today    = this.logs.filter(l => {
      const d = new Date(l.timestamp ?? l.createdAt ?? l.loggedAt ?? '');
      return d.toDateString() === todayStr;
    }).length;
    this.stats.thisWeek = this.logs.filter(l => {
      const d = new Date(l.timestamp ?? l.createdAt ?? l.loggedAt ?? '');
      return d >= weekAgo;
    }).length;
  }

  // ══════════════════════════════════════════════════════
  // PAGINATION
  // ══════════════════════════════════════════════════════

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.load();
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const cur   = this.currentPage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    if (cur > 3) pages.push(-1); // ellipsis
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) {
      pages.push(i);
    }
    if (cur < total - 2) pages.push(-1); // ellipsis
    pages.push(total);
    return pages;
  }

  // ══════════════════════════════════════════════════════
  // DISPLAY HELPERS
  // ══════════════════════════════════════════════════════

  getActionBadgeClass(action: string): string {
    return ACTION_COLORS[action?.toUpperCase()] ?? 'badge-gray';
  }

  getModuleIcon(module: string): string {
    return MODULE_ICONS[module?.toUpperCase()] ?? 'label';
  }

  formatTimestamp(raw: string): string {
    if (!raw) return '—';
    try {
      return new Date(raw).toLocaleString('en-US', {
        month:  'short',
        day:    'numeric',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch { return raw; }
  }

  formatRelativeTime(raw: string): string {
    if (!raw) return '';
    try {
      const diff = Date.now() - new Date(raw).getTime();
      const s    = Math.floor(diff / 1000);
      if (s < 60)  return `${s}s ago`;
      const m = Math.floor(s / 60);
      if (m < 60)  return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24)  return `${h}h ago`;
      const d = Math.floor(h / 24);
      if (d < 7)   return `${d}d ago`;
      return this.formatTimestamp(raw);
    } catch { return ''; }
  }

  getTimestamp(log: any): string {
    return log.timestamp ?? log.createdAt ?? log.loggedAt ?? log.performedAt ?? '';
  }

  getDescription(log: any): string {
    return log.description ?? log.details ?? log.message ?? log.note ?? '';
  }

  getUserName(log: any): string {
    return log.userName ?? log.performedBy ?? log.userId ?? '—';
  }

  getEntityRef(log: any): string {
    const type = log.entityType ?? log.module ?? '';
    const id   = log.entityId   ?? log.referenceId ?? '';
    if (!type && !id) return '';
    if (!id) return type;
    return `${type} #${id}`;
  }

  getIpAddress(log: any): string {
    return log.ipAddress ?? log.ip ?? '';
  }

  trackById(_: number, log: any): any {
    return log.id ?? log.logId ?? log.activityId ?? _;
  }

  // ── Filtered view (client-side search within loaded page) ─────────
  get filteredLogs(): any[] {
    if (!this.searchQuery.trim()) return this.logs;
    const q = this.searchQuery.toLowerCase();
    return this.logs.filter(l =>
      (this.getDescription(l) + this.getUserName(l) +
       (l.action ?? '') + (l.module ?? '') + this.getEntityRef(l))
        .toLowerCase().includes(q)
    );
  }

  // ── Export current page as CSV ────────────────────────────────────
  exportCsv(): void {
    const rows = [
      ['Timestamp', 'User', 'Module', 'Action', 'Description', 'Entity', 'IP'],
      ...this.filteredLogs.map(l => [
        this.formatTimestamp(this.getTimestamp(l)),
        this.getUserName(l),
        l.module ?? '',
        l.action ?? '',
        this.getDescription(l),
        this.getEntityRef(l),
        this.getIpAddress(l),
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `activity-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}