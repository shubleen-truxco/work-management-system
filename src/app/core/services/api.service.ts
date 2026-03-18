import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';


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

  // ══════════════════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════════════════

  createOrUpdateTask(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/create-update-task`, payload);
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
    return this.http.patch(`${this.chatV1}/${chatId}`, { name, avatar });
  }

 saveFcmToken(token: string): Observable<any> {
        const userId = sessionStorage.getItem('id');
  return this.http.post(
    `${this.baseUrl}/chats/fcm-token`,
    { token, userId }
  );
}

  removeFcmToken(): Observable<any> {
    return this.http.delete(`${this.chatV1}/fcm-token`);
  }

  // ── File upload ───────────────────────────────────────

 uploadChatFile(payload: {
  chatId:     string;
  file?:      string;        // base64 — single file
  fileName?:  string;
  files?:     string[];      // base64 list — multiple files
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

}