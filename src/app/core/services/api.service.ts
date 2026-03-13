import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';


@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  login(payload: any = {}): Observable<any> {
    return this.http.post(`${this.baseUrl}/login`, payload);
  }

  empLogin(payload: any = {}): Observable<any> {
    return this.http.post(`${this.baseUrl}/employee-login`, payload);
  }

  saveUser(userData: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/save-user`, userData);
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/user-logout`, {});
  }

  getMyProfile(): Observable<any> {
    return this.http.post(`${this.baseUrl}/user-profile`, {});
  }

  getEmployeeList(
    page: number = 1,
    size: number = 10,
    search?: string
  ): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http.post(`${this.baseUrl}/employee-list`, {}, { params });
  }

  getProfileImageUrl(path: string | null): string {
    if (!path) return '';
    const base = environment.apiUrl.replace('/api', '/wms');
    return `${base}${path}`;
  }

  getEmployeeById(id: number | string): Observable<any> {
    const params = new HttpParams().set('id', id.toString());
    return this.http.post(`${this.baseUrl}/employee-details`, {}, { params });
  }

  addDesignation(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/designation`, payload);
  }

  getDesignations(): Observable<any> {
    return this.http.get(`${this.baseUrl}/designation-list`);
  }

  getAttendanceReport(startDate: string, endDate: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/report?startDate=${startDate}&endDate=${endDate}`,
      {}
    );
  }

  createOrUpdateTask(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/create-update-task`, payload);
  }

  getTaskList(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/task-list`,payload);
  }

  getTaskById(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/task-details`,payload);
  }

}