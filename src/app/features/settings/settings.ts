import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar],
  templateUrl: './settings.html',
  styleUrls: ['./settings.css'],
})
export class Settings implements OnInit {

  activePanel = 'company';

  // ── Nav Sections ──────────────────────────────────────
  generalSettings = [
    { key: 'company',      label: 'Company Settings',  icon: 'business'   },
    { key: 'work-hours',   label: 'Work Hours',         icon: 'schedule'   },
    { key: 'appearance',   label: 'Appearance',         icon: 'palette'    },
  ];

  managementSettings = [
    { key: 'designation',      label: 'Designations',     icon: 'work'     },
    { key: 'task-categories',  label: 'Task Categories',  icon: 'category' },
  ];

  systemSettings = [
    { key: 'notifications', label: 'Notifications', icon: 'notifications' },
    { key: 'security',      label: 'Security',      icon: 'security'      },
  ];

  setPanel(key: string): void { this.activePanel = key; }

  // ── Company ───────────────────────────────────────────
  company = { name: '', email: '', phone: '', website: '', address: '' };

  saveCompany(): void {
    this.toast.show('Company settings saved!', 'success');
  }

  // ── Designations ──────────────────────────────────────
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

  editDesignation(d: any): void {
    d.editing  = true;
    d.editName = d.name;
  }

  saveDesignation(d: any): void {
    if (!d.editName.trim()) return;
    // Call update API here if available
    d.name    = d.editName;
    d.editing = false;
    this.toast.show('Designation updated!', 'success');
  }

  cancelEdit(d: any): void {
    d.editing  = false;
    d.editName = d.name;
  }

  deleteDesignation(d: any): void {
    this.designations = this.designations.filter(x => x.id !== d.id);
    this.toast.show('Designation removed', 'success');
  }

  // ── Task Categories ───────────────────────────────────
  taskCategories: any[] = [];
  newCategory      = '';
  newCategoryColor = '#0891b2';

  addCategory(): void {
    if (!this.newCategory.trim()) return;
    this.taskCategories.push({
      id:    Date.now(),
      name:  this.newCategory.trim(),
      color: this.newCategoryColor,
    });
    this.newCategory = '';
    this.toast.show('Category added!', 'success');
  }

  deleteCategory(cat: any): void {
    this.taskCategories = this.taskCategories.filter(c => c.id !== cat.id);
    this.toast.show('Category removed', 'success');
  }

  // ── Notifications ─────────────────────────────────────
  emailNotifications = [
    { icon: 'person_add',    label: 'New Employee Added',   desc: 'Get notified when a new employee is added',    enabled: true  },
    { icon: 'task_alt',      label: 'Task Assigned',        desc: 'Get notified when a task is assigned to you',  enabled: true  },
    { icon: 'warning',       label: 'Attendance Alert',     desc: 'Get alerts for attendance issues',             enabled: false },
    { icon: 'report',        label: 'Monthly Reports',      desc: 'Receive monthly summary reports via email',    enabled: true  },
  ];

  pushNotifications = [
    { icon: 'notifications_active', label: 'Real-time Alerts',  desc: 'Instant push notifications for critical events', enabled: true  },
    { icon: 'chat',                 label: 'Messages',           desc: 'Get push notifications for new messages',        enabled: false },
    { icon: 'update',               label: 'System Updates',     desc: 'Notifications for system updates',               enabled: true  },
  ];

  saveNotifications(): void {
    this.toast.show('Notification preferences saved!', 'success');
  }

  // ── Work Hours ────────────────────────────────────────
  workHours = { timeIn: '09:00', breakTime: '01:00', workDays: ['mon','tue','wed','thu','fri'] };

  weekDays = [
    { key: 'sun', label: 'Su' },
    { key: 'mon', label: 'Mo' },
    { key: 'tue', label: 'Tu' },
    { key: 'wed', label: 'We' },
    { key: 'thu', label: 'Th' },
    { key: 'fri', label: 'Fr' },
    { key: 'sat', label: 'Sa' },
  ];

  toggleDay(key: string): void {
    const idx = this.workHours.workDays.indexOf(key);
    idx === -1
      ? this.workHours.workDays.push(key)
      : this.workHours.workDays.splice(idx, 1);
  }

  saveWorkHours(): void {
    this.toast.show('Work hours saved!', 'success');
  }

  // ── Security ──────────────────────────────────────────
  showChangePassword = false;
  passwordForm = { current: '', newPass: '', confirm: '' };

  changePassword(): void {
    if (!this.passwordForm.current || !this.passwordForm.newPass) {
      this.toast.show('Please fill all password fields', 'error');
      return;
    }
    if (this.passwordForm.newPass !== this.passwordForm.confirm) {
      this.toast.show('Passwords do not match', 'error');
      return;
    }
    this.toast.show('Password updated successfully!', 'success');
    this.showChangePassword  = false;
    this.passwordForm        = { current: '', newPass: '', confirm: '' };
  }

  // ── Appearance ────────────────────────────────────────
  appearance = { theme: 'light', language: 'en', timezone: 'IST' };

  saveAppearance(): void {
    this.toast.show('Appearance settings saved!', 'success');
  }

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.fetchDesignations();
  }
}