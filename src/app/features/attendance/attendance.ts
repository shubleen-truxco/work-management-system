import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar, DatePipe],
  templateUrl: './attendance.html',
  styleUrls: ['./attendance.css'],
})
export class Attendance implements OnInit {

  viewMode   = 'day';
  searchText = '';
  page       = 1;
  pageSize   = 15;
  totalPages = 1;
  isLoading  = false;

  selectedDate  = this.toDateStr(new Date());
  selectedMonth = this.toMonthStr(new Date());
  rangeStart    = this.toDateStr(new Date(Date.now() - 7 * 86400000));
  rangeEnd      = this.toDateStr(new Date());

  allRecords:   any[] = [];
  filteredData: any[] = [];

  // Break modal
  showBreakModal = false;
  selectedRec: any = null;

  stats = {
    total: 0, present: 0, active: 0,
    absent: 0, late: 0, avgHours: '0'
  };

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void { this.loadData(); }

  // ── View Mode ─────────────────────────────────────────
  setViewMode(mode: string): void {
    this.viewMode = mode;
    this.page     = 1;
    this.loadData();
  }

  // ── Date Range ────────────────────────────────────────
  getDateRange(): { start: string; end: string } {
    if (this.viewMode === 'day') {
      return { start: this.selectedDate, end: this.selectedDate };
    }
    if (this.viewMode === 'month') {
      const [y, m] = this.selectedMonth.split('-').map(Number);
      const start  = `${y}-${String(m).padStart(2, '0')}-01`;
      const end    = this.toDateStr(new Date(y, m, 0));
      return { start, end };
    }
    return { start: this.rangeStart, end: this.rangeEnd };
  }

  // ── Load Data ─────────────────────────────────────────
  loadData(): void {
    const { start, end } = this.getDateRange();
    this.isLoading = true;

    this.api.getAttendanceReport(start, end).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (!res.success) {
          this.toast.show(res.message || 'Failed to load attendance', 'error');
          return;
        }

        this.allRecords = (res.data || []).map((r: any) => ({
          empId:        r.empId || ('EMP-' + r.userId),
          name:         r.employeeName || '—',
          date:         r.attendanceDate,
          timeIn:       this.formatTime(r.timeIn),
          timeOut:      this.formatTime(r.timeOut),
          totalBreak:   this.formatMinutes(r.totalBreakMinutes),
          workingHours: this.formatMinutes(r.totalWorkingMinutes),
          status:       this.deriveStatus(r),
          isLate:       this.isLateArrival(r.timeIn),
          overtime:     this.calcOvertime(r.totalWorkingMinutes),
          rawBreaks:    (r.breaks || []).map((b: any) => ({
            id:                   b.id,
            breakStart:           b.breakStart,
            breakEnd:             b.breakEnd,
            breakDurationMinutes: b.breakDurationMinutes ?? 0,
          })),
        }));

        this.computeStats(this.allRecords);
        this.applySearch();
      },
      error: () => {
        this.isLoading = false;
        this.toast.show('Error fetching attendance report', 'error');
      }
    });
  }

  applySearch(): void {
    let data = [...this.allRecords];
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      data = data.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.empId.toLowerCase().includes(q)
      );
    }
    this.totalPages  = Math.max(1, Math.ceil(data.length / this.pageSize));
    this.filteredData = this.viewMode === 'day'
      ? data
      : data.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }

  filterData(): void { this.page = 1; this.applySearch(); }

  // ── Stats ─────────────────────────────────────────────
  computeStats(data: any[]): void {
    const unique = [...new Set(data.map(r => r.empId))];
    const hours  = data
      .filter(r => r.workingHours && r.workingHours !== '—')
      .map(r => this.parseHours(r.workingHours));
    const avg = hours.length
      ? (hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1)
      : '0';

    this.stats = {
      total:    unique.length,
      present:  data.filter(r => r.status === 'Present').length,
      active:   data.filter(r => r.status === 'Active').length,
      absent:   data.filter(r => r.status === 'Absent').length,
      late:     data.filter(r => r.status === 'Late').length,
      avgHours: avg,
    };
  }

  // ── Break Modal ───────────────────────────────────────
  openBreakModal(rec: any): void {
    this.selectedRec   = rec;
    this.showBreakModal = true;
  }

  closeBreakModal(): void {
    this.showBreakModal = false;
    this.selectedRec    = null;
  }

  // ── Helpers ───────────────────────────────────────────
  formatTime(dt: string | null): string | null {
    if (!dt) return null;
    return new Date(dt).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  formatMinutes(minutes: number): string {
    if (!minutes && minutes !== 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  parseHours(str: string): number {
    if (!str || str === '—') return 0;
    const h = str.match(/(\d+)h/);
    const m = str.match(/(\d+)m/);
    return (h ? +h[1] : 0) + (m ? +m[1] / 60 : 0);
  }

  deriveStatus(r: any): string {
    if (!r.timeIn)  return 'Absent';
    if (!r.timeOut) return 'Active';
    if (this.isLateArrival(r.timeIn)) return 'Late';
    if (r.totalWorkingMinutes > 0 && r.totalWorkingMinutes < 240) return 'Half Day';
    return 'Present';
  }

  isLateArrival(timeIn: string | null): boolean {
    if (!timeIn) return false;
    const t = new Date(timeIn);
    return t.getHours() > 9 || (t.getHours() === 9 && t.getMinutes() > 15);
  }

  calcOvertime(mins: number): string {
    const standard = 9 * 60;
    if (!mins || mins <= standard) return '0h 0m';
    return this.formatMinutes(mins - standard);
  }

  getHoursPercent(workingHours: string): number {
    return Math.min(100, Math.round((this.parseHours(workingHours) / 9) * 100));
  }

  // ── Date Helpers ──────────────────────────────────────
  toDateStr(d: Date):  string { return d.toISOString().split('T')[0]; }
  toMonthStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  prevDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() - 1);
    this.selectedDate = this.toDateStr(d);
    this.loadData();
  }

  nextDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + 1);
    this.selectedDate = this.toDateStr(d);
    this.loadData();
  }

  goToday(): void { this.selectedDate = this.toDateStr(new Date()); this.loadData(); }

  prevMonth(): void {
    const [y, m] = this.selectedMonth.split('-').map(Number);
    this.selectedMonth = this.toMonthStr(new Date(y, m - 2, 1));
    this.loadData();
  }

  nextMonth(): void {
    const [y, m] = this.selectedMonth.split('-').map(Number);
    this.selectedMonth = this.toMonthStr(new Date(y, m, 1));
    this.loadData();
  }

  onDateChange():  void { this.loadData(); }
  onMonthChange(): void { this.loadData(); }
  onRangeChange(): void { this.loadData(); }

  getDateLabel(): string {
    if (this.viewMode === 'day') {
      const d = new Date(this.selectedDate);
      return (this.sameDay(d, new Date()) ? 'Today — ' : '') +
        d.toLocaleDateString('en-US', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }
    if (this.viewMode === 'month') {
      const [y, m] = this.selectedMonth.split('-').map(Number);
      return new Date(y, m - 1, 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return `${this.rangeStart} → ${this.rangeEnd}`;
  }

  prevPage(): void { if (this.page > 1)               { this.page--; this.applySearch(); } }
  nextPage(): void { if (this.page < this.totalPages) { this.page++; this.applySearch(); } }

  exportCSV(): void {
    const headers = ['Emp ID','Name','Date','Time In','Time Out','Total Break','Working Hours','Status','Overtime','Breaks'];
    const rows = this.filteredData.map(r => [
      r.empId, r.name, r.date,
      r.timeIn    || '—',
      r.timeOut   || '—',
      r.totalBreak    || '—',
      r.workingHours  || '—',
      r.status,
      r.overtime  || '—',
      r.rawBreaks?.length || 0,
    ]);
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `attendance_${this.selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

}