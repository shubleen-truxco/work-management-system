import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { forkJoin } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl = environment.apiUrl;
  private readonly chatV1 = `${environment.apiUrl}/chats`;

  constructor(private http: HttpClient) { }

  // ══════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════

  getDashboardStats() {
    return this.http.get('/api/dashboard/stats');
  }

  login(payload: any = {}): Observable<any> {
    return this.http.post(`${this.baseUrl}/login`, payload);
  }

  saveUser(userData: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/save-user`, userData);
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/user-logout`, {});
  }

  // ══════════════════════════════════════════════════════
  // USER / EMPLOYEE
  // ══════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════
  // DESIGNATION
  // ══════════════════════════════════════════════════════

  addDesignation(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/designation`, payload);
  }

  getDesignations(): Observable<any> {
    return this.http.get(`${this.baseUrl}/designation-list`);
  }


  // ══════════════════════════════════════════════════════
  // ATTENDANCE
  // ══════════════════════════════════════════════════════

  getAttendanceReport(startDate: string, endDate: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/report?startDate=${startDate}&endDate=${endDate}`,
      {}
    );
  }

  getTodayAttendance(): Observable<any> {
    const today = new Date().toISOString().split('T')[0]; // "2026-03-19"
    return this.http.post(
      `${this.baseUrl}/attendance-list?page=1&size=100&date=${today}`,
      {}   // empty body — all params are @RequestParam query params
    );
  }

  // Weekly summary — calls attendance-list for each day Mon–Fri
  // Returns array of { day, present, absent } for the chart
  getWeeklyAttendanceSummary(): Observable<any> {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const requests = days.map((day, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      return this.http.post<any>(
        `${this.baseUrl}/attendance-list?page=1&size=200&date=${dateStr}`, {}
      );
    });
    return forkJoin(requests);
  }

  // Add these methods to api.service.ts

  // ── Base URL getter (for PDF window.open) ─────────────────────
  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ── Generic POST helper (for email endpoint) ──────────────────
  post(endpoint: string, body: any): Observable<any> {
    return this.http.post(`${this.baseUrl}${endpoint}`, body);
  }

  // ── Attendance list — matches your controller exactly ─────────
  // POST /attendance-list?page=1&size=10&userId=3&date=2026-03-01
  getAttendanceList(params: {
    page?: number;
    size?: number;
    id?: number;
    userId?: number | string;
    date?: string;
  } = {}): Observable<any> {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page ?? 1));
    if (params.size) q.set('size', String(params.size ?? 10));
    if (params.id) q.set('id', String(params.id));
    if (params.userId) q.set('userId', String(params.userId));
    if (params.date) q.set('date', params.date);
    return this.http.post(`${this.baseUrl}/attendance-list?${q.toString()}`, {});
  }




  // ══════════════════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════════════════

  createOrUpdateTask(dto: any, comment?: string): Observable<any> {
    const params = comment?.trim()
      ? `?comment=${encodeURIComponent(comment.trim())}`
      : '';
    return this.http.post(
      `${this.baseUrl}/create-update-task${params}`,
      dto,
    );
  }

  getTaskList(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/task-list`, payload);
  }

  getTaskById(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/task-details`, payload);
  }

  // ══════════════════════════════════════════════════════
  // MESSAGES / CHAT
  // ══════════════════════════════════════════════════════

  getChatList(page = 1, size = 50,
    type = 'all', search?: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page)
      .set('size', size)
      .set('type', type);
    if (search?.trim()) params = params.set('search', search.trim());
    return this.http.get(this.chatV1, { params });
  }

  createOrGetChat(payload: any): Observable<any> {
    return this.http.post(this.chatV1, payload);
  }

  getChatMessages(chatId: string, page = 1,
    size = 30, beforeMessageId?: number): Observable<any> {
    let params = new HttpParams()
      .set('chatId', chatId)
      .set('page', page)
      .set('size', size);
    if (beforeMessageId) {
      params = params.set('beforeMessageId', beforeMessageId);
    }
    return this.http.get(`${this.chatV1}/messages`, { params });
  }

  sendMessageRest(payload: any): Observable<any> {
    return this.http.post(`${this.chatV1}/messages`, payload);
  }

  markMessagesSeen(chatId: string, messageIds: number[]): Observable<any> {
    return this.http.post(`${this.chatV1}/messages/seen`, { chatId, messageIds });
  }

  getGroupParticipants(chatId: string): Observable<any> {
    return this.http.get(`${this.chatV1}/participants?chatId=${chatId}`, {
    });
  }

  addParticipants(chatId: string, participantIds: number[]): Observable<any> {
    return this.http.post(
      `${this.chatV1}/${chatId}/participants`, { participantIds }
    );
  }

  removeParticipant(chatId: string, userId: number): Observable<any> {
    return this.http.delete(`${this.chatV1}/${chatId}/participants/${userId}`);
  }

  updateGroupInfo(chatId: string,
    name?: string, avatar?: string): Observable<any> {
    return this.http.post(`${this.chatV1}/${chatId}`, { name, avatar });
  }

  saveFcmToken(data: any) {
    return this.http.post(`${this.chatV1}/fcm-token`, data);
  }
  removeFcmToken(data: any) {
    return this.http.post(`${this.chatV1}/remove-token`, data);
  }

  // ── File upload ───────────────────────────────────────

  uploadChatFile(payload: {
    chatId: string;
    file?: string;        // base64 — single file
    fileName?: string;
    files?: string[];      // base64 list — multiple files
    fileNames?: string[];
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/chats/upload-file`, payload);
  }

  uploadGroupAvatar(
    base64Data: string,
    chatId: string
  ): Observable<any> {
    return this.http.post(`${this.baseUrl}/chats/upload-avatar`, {
      file: base64Data,
      chatId,
    });
  }

  getChatMessagesWithCursor(chatId: string, beforeMessageId: number, size: number = 30): Observable<any> {
    return this.http.get(`${this.baseUrl}/chats/messages`, {
      params: {
        chatId,
        beforeMessageId: beforeMessageId.toString(),
        size: size.toString()
      }
    });
  }


  // ── Add comment to a task ─────────────────────────────────────────
  addTaskComment(taskId: number, comment: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/task-comment`, { taskId, comment });
  }

  getActivityQuery(params: { module?: string; id?: string; page?: number; size?: number }): Observable<any> {
    const query = new URLSearchParams();
    if (params.module) query.set('module', params.module);
    if (params.id) query.set('id', params.id);
    if (params.page) query.set('page', String(params.page));
    if (params.size) query.set('size', String(params.size ?? 50));
    return this.http.get(`${this.baseUrl}/activity/query?${query.toString()}`);
  }


}