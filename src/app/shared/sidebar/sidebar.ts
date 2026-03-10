import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  imports: [RouterModule,NgClass],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements OnInit {
  isCollapsed = false;

  constructor(
    private api: ApiService,
    private router: Router
  ) {}

  ngOnInit() {
    // You can load collapsed state from localStorage if you want to persist it
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  logout() {
    this.api.logout();
    this.router.navigate(['/auth/login']);
  }
}