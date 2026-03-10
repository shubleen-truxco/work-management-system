import { Routes } from '@angular/router';
import {  EmployeeList } from './features/employee/employee';
import { Login } from './features/login/login';
import { Sidebar } from './shared/sidebar/sidebar';

export const routes: Routes = [

  { path: '', redirectTo: 'Login', pathMatch: 'full' },
 { path: 'Login', component: Login },
{
  path: 'admin',
  component: Sidebar,
  children: [
    { path: '', redirectTo: 'employee', pathMatch: 'full' },
    { path: 'employee', component: EmployeeList },
  ]
},
  { path: '**', redirectTo: 'Login', pathMatch: 'full' }
];