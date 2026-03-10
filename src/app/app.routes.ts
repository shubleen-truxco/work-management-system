import { Routes } from '@angular/router';
import { EmployeeList } from './features/employee/employee';
import { Login } from './features/login/login';
import { Sidebar } from './shared/sidebar/sidebar';

export const routes: Routes = [
  {
    path: '',
    children: [
      { path: '', component: Login },
      { path: 'employee', component: EmployeeList },

    ]
  },
  { path: '', redirectTo: '', pathMatch: 'full' },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];