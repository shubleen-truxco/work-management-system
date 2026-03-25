import {
  Component, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule }  from '@angular/router';
import { Sidebar }       from '../../shared/sidebar/sidebar';
import { ApiService }    from '../../core/services/api.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector:    'app-dashboard',
  standalone:  true,
  imports:     [CommonModule, RouterModule, Sidebar,FormsModule],
  templateUrl: './dashboard.html',
  styleUrls:   ['./dashboard.css'],
})
export class Dashboard implements OnInit, OnDestroy {

  // ── State ─────────────────────────────────────────────────────
  isLoading = true;

  // Stats
  totalEmployees  = 0;
  presentToday    = 0;
  attendancePct   = 0;
  openTasks       = 0;
  overdueTasks    = 0;
  unreadMessages  = 0;
  unreadChats     = 0;

  // Attendance chart data (Mon–current day)
  attendanceWeek: { day: string; present: number; absent: number }[] = [];

  // Task progress
  taskStats = { completed: 0, inProgress: 0, pending: 0, overdue: 0, total: 0 };

  // Today's attendance list
  todayAttendance: {
    name: string; role: string; initials: string;
    status: 'Present' | 'Late' | 'Absent'; color: string;
  }[] = [];

  // Recent tasks
  recentTasks: {
    title: string; assignee: string; dueLabel: string;
    priority: 'High' | 'Medium' | 'Low'; isOverdue: boolean;
  }[] = [];

  // Recent chats
  recentChats: {
    name: string; preview: string; time: string;
    initials: string; color: string; unread: boolean; isGroup: boolean;
  }[] = [];

  // Current user
  currentUserName = this.resolveUserName();
  todayDate = this.formatDate(new Date());

  private refreshTimer: any;

  private resolveUserName(): string {
    const candidates = ['firstName', 'name', 'user', 'username'];
    for (const key of candidates) {
      const val = sessionStorage.getItem(key);
      if (val && val !== 'null' && !val.startsWith('{')) return val;
    }
    const raw = sessionStorage.getItem('user') || '';
    try {
      const obj = JSON.parse(raw);
      if (obj.firstName) return (obj.firstName + ' ' + (obj.lastName ?? '')).trim();
      if (obj.name) return obj.name;
      if (obj.username) return obj.username;
    } catch {}
    return 'Admin';
  }

  constructor(private api: ApiService) {}

  // ── Lifecycle ─────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadAll();
    // Auto-refresh every 2 minutes
    this.refreshTimer = setInterval(() => this.loadAll(), 120_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.refreshTimer);
  }

  // ── Load all data ─────────────────────────────────────────────

  loadAll(): void {
    this.isLoading = true;
    let pending = 4;
    const done = () => { if (--pending === 0) this.isLoading = false; };

    this.loadEmployees(done);
    this.loadAttendance(done);
    this.loadTasks(done);
    this.loadChats(done);
  }

  // ── Employees ─────────────────────────────────────────────────

  private loadEmployees(done: () => void): void {
    this.api.getEmployeeList(1, 200).subscribe({
      next: (res: any) => {
        if (res.success) {
          const items = res.data?.items ?? res.data?.content ?? [];
          this.totalEmployees = res.data?.pagination?.totalItems ?? items.length;
        }
        done();
      },
      error: () => done()
    });
  }

  // ── Attendance ────────────────────────────────────────────────

  private loadAttendance(done: () => void): void {
    // Fetch today's attendance — adjust endpoint to your BE
    this.api.getTodayAttendance().subscribe({
      next: (res: any) => {
        if (res.success) {
          const records = res.data?.items ?? res.data ?? [];
          const present = records.filter((r: any) =>
            r.status === 'PRESENT' || r.status === 'present').length;
          const late    = records.filter((r: any) =>
            r.status === 'LATE'    || r.status === 'late').length;
          const absent  = records.filter((r: any) =>
            r.status === 'ABSENT'  || r.status === 'absent').length;

          this.presentToday  = present + late;
          this.attendancePct = records.length > 0
            ? Math.round(((present + late) / records.length) * 100)
            : 0;

          // Build today's attendance list (first 5)
          this.todayAttendance = records.slice(0, 5).map((r: any) => {
            const name  = r.employeeName ?? r.name ?? 'Unknown';
            const role  = r.designationName ?? r.role ?? '';
            const s     = r.status?.toLowerCase();
            const status: 'Present' | 'Late' | 'Absent' =
              s === 'present' ? 'Present' : s === 'late' ? 'Late' : 'Absent';
            return {
              name, role,
              initials: this.getInitials(name),
              status,
              color:  this.avatarColor(name),
            };
          });

          // Weekly chart — fetch week summary if endpoint exists, else fake Mon-Fri
          this.buildWeekChart(res.data?.weekSummary);
        }
        done();
      },
      error: () => {
        // Fallback placeholders so UI doesn't break
        this.buildWeekChart(null);
        done();
      }
    });
  }

  private buildWeekChart(weekData: any[] | null): void {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    if (weekData && weekData.length) {
      this.attendanceWeek = weekData.slice(0, 5).map((d: any, i: number) => ({
        day:     days[i] ?? `D${i+1}`,
        present: d.presentCount ?? d.present ?? 0,
        absent:  d.absentCount  ?? d.absent  ?? 0,
      }));
    } else {
      // Use realistic placeholder — total employees spread across week
      const base = this.totalEmployees || 8;
      const sample = [
        { present: Math.round(base * 0.9), absent: Math.round(base * 0.1) },
        { present: Math.round(base * 0.85), absent: Math.round(base * 0.15) },
        { present: this.presentToday || Math.round(base * 0.85), absent: base - (this.presentToday || Math.round(base * 0.85)) },
        { present: Math.round(base * 0.88), absent: Math.round(base * 0.12) },
        { present: Math.round(base * 0.8), absent: Math.round(base * 0.2) },
      ];
      this.attendanceWeek = days.map((day, i) => ({ day, ...sample[i] }));
    }
  }

  // ── Tasks ─────────────────────────────────────────────────────

  private loadTasks(done: () => void): void {
    const payload = { page: 1, size: 50, status: 'all' };
    this.api.getTaskList(payload).subscribe({
      next: (res: any) => {
        if (res.success) {
          const items: any[] = res.data?.items ?? res.data?.content ?? [];

          const completed  = items.filter(t => this.isStatus(t, ['COMPLETED','completed','done'])).length;
          const inProgress = items.filter(t => this.isStatus(t, ['IN_PROGRESS','in_progress','inprogress','ongoing'])).length;
          const overdue    = items.filter(t => this.isOverdue(t)).length;
          const total      = items.length || 1;

          this.openTasks   = items.filter(t => !this.isStatus(t, ['COMPLETED','completed','done'])).length;
          this.overdueTasks = overdue;

          const completedPct  = Math.round((completed  / total) * 100);
          const inProgressPct = Math.round((inProgress / total) * 100);
          const overduePct    = Math.round((overdue    / total) * 100);
          const pendingRaw    = total - completed - inProgress - overdue;
          const pendingPct    = Math.max(0, Math.round((pendingRaw / total) * 100));

          this.taskStats = {
            completed:  completedPct,
            inProgress: inProgressPct,
            pending:    pendingPct,
            overdue:    overduePct,
            total,
          };

          // Recent tasks — show top 5 sorted by priority then due date
          this.recentTasks = items
            .filter(t => !this.isStatus(t, ['COMPLETED','completed','done']))
            .sort((a, b) => this.prioritySort(a) - this.prioritySort(b))
            .slice(0, 5)
            .map(t => ({
              title:    t.title ?? t.taskTitle ?? 'Untitled',
              assignee: t.assigneeName ?? t.assignedToName ?? '—',
              dueLabel: this.dueLabel(t.endDate ?? t.dueDate),
              priority: this.normPriority(t.priority),
              isOverdue: this.isOverdue(t),
            }));
        }
        done();
      },
      error: () => done()
    });
  }

  // ── Chats ─────────────────────────────────────────────────────

  private loadChats(done: () => void): void {
    this.api.getChatList(1, 10).subscribe({
      next: (res: any) => {
        if (res.success) {
          const items = res.data?.items ?? [];
          this.unreadMessages = items.reduce((s: number, c: any) => s + (c.unreadCount ?? 0), 0);
          this.unreadChats    = items.filter((c: any) => (c.unreadCount ?? 0) > 0).length;

          this.recentChats = items.slice(0, 5).map((c: any) => ({
            name:    c.name ?? 'Chat',
            preview: this.chatPreview(c),
            time:    c.lastMessage?.createdAt ? this.formatTime(c.lastMessage.createdAt) : '',
            initials: this.getInitials(c.name ?? 'C'),
            color:   this.avatarColor(c.name ?? 'C'),
            unread:  (c.unreadCount ?? 0) > 0,
            isGroup: c.type === 'group',
          }));
        }
        done();
      },
      error: () => done()
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  private isStatus(task: any, statuses: string[]): boolean {
    return statuses.includes(task.status ?? '');
  }

  private isOverdue(task: any): boolean {
    const due = task.endDate ?? task.dueDate;
    if (!due) return false;
    return new Date(due) < new Date() &&
      !this.isStatus(task, ['COMPLETED','completed','done']);
  }

  private prioritySort(t: any): number {
    const p = (t.priority ?? '').toUpperCase();
    if (p === 'HIGH')   return 0;
    if (p === 'MEDIUM') return 1;
    return 2;
  }

  private normPriority(p: string): 'High' | 'Medium' | 'Low' {
    const up = (p ?? '').toUpperCase();
    if (up === 'HIGH')   return 'High';
    if (up === 'MEDIUM') return 'Medium';
    return 'Low';
  }

  private dueLabel(dateStr: string): string {
    if (!dateStr) return '';
    const due   = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (diff < 0)  return 'Overdue';
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `Due ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  }

  private chatPreview(c: any): string {
    const text = c.lastMessage?.text ?? '';
    if (!text) return 'No messages yet';
    if (text.startsWith('[Image]') || text.startsWith('📷')) return '📷 Photo';
    if (text.startsWith('[File]')  || text.startsWith('📎')) return '📎 File';
    return text.length > 35 ? text.substring(0, 35) + '…' : text;
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  // Deterministic color per name
  avatarColor(name: string): string {
    const colors = [
      { bg: '#E1F5EE', text: '#085041' },
      { bg: '#E6F1FB', text: '#0C447C' },
      { bg: '#EEEDFE', text: '#3C3489' },
      { bg: '#FAEEDA', text: '#633806' },
      { bg: '#EAF3DE', text: '#27500A' },
      { bg: '#FBEAF0', text: '#72243E' },
    ];
    let hash = 0;
    for (const ch of (name ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
    return JSON.stringify(colors[hash % colors.length]);
  }

  parsedColor(json: string): { bg: string; text: string } {
    try { return JSON.parse(json); } catch { return { bg: '#E1F5EE', text: '#085041' }; }
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    const d     = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString())
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  formatDate(d: Date): string {
    return d.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  priorityClass(p: 'High' | 'Medium' | 'Low'): string {
    if (p === 'High')   return 'pri-high';
    if (p === 'Medium') return 'pri-med';
    return 'pri-low';
  }

  statusClass(s: 'Present' | 'Late' | 'Absent'): string {
    if (s === 'Present') return 'status-present';
    if (s === 'Late')    return 'status-late';
    return 'status-absent';
  }

  getBarPct(val: number, total: number): number {
    if (!total || !val) return 0;
    return Math.round((val / total) * 100);
  }

}