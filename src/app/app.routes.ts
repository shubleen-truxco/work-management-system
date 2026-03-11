import { Routes } from '@angular/router';
import { EmployeeList } from './features/employee/employee';
import { Login } from './features/login/login';
import { Settings } from './features/settings/settings';
import { Dashboard } from './features/dashboard/dashboard';
import { Tasks } from './features/tasks/tasks';
import { Reports } from './features/reports/reports';
import { Messages } from './features/messages/messages';
import { Attendance } from './features/attendance/attendance';

export const routes: Routes = [
  {
    path: '',
    children: [
      { path: '', component: Login },
      { path: 'employee', component: EmployeeList },
      { path: 'dashboard', component: Dashboard },
      { path: 'attendance', component: Attendance },
      { path: 'messages', component: Messages },
      { path: 'task-management', component: Tasks },
      { path: 'report', component: Reports },
      { path: 'settings', component: Settings },

    ]
  },
  { path: '', redirectTo: '', pathMatch: 'full' },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];