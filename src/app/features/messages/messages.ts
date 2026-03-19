import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewChecked,
  HostListener,
  NgZone,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { FcmService } from '../../core/services/fcm.service';
import { Emojipicker } from '../../shared/emojipicker/emojipicker';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar, Emojipicker],
  templateUrl: './messages.html',
  styleUrls: ['./messages.css'],
})
export class Messages implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('messagesArea') messagesArea!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('avatarInput') avatarInput!: ElementRef;

  currentUserId = sessionStorage.getItem('id') || '';
  currentUserName = sessionStorage.getItem('user') || 'Me';
  private token = sessionStorage.getItem('token') || '';

  private ws!: WebSocket;
  private wsUrl = 'ws://localhost:8080/wms/ws/chat';
  private shouldScroll = false;
  private typingTimer: any;
  private pingInterval: any;
  private readonly READ_KEY = 'chat_last_read_';

  isTyping = false;
  typingPerson = '';
  private typingTimeouts: Map<string, any> = new Map();

  searchChat = '';
  activeFilter = 'all';
  newMessage = '';
  isLoadingHistory = false;
  isLoadingChats = false;
  isCreatingChat = false;
  isLoadingPeople = false;
  isUploadingFile = false;
  isUploadingAvatar = false;
  selectedChat: any = null;
  showNewChatModal = false;
  showGroupInfoModal = false;
  newChatType = 'direct';
  newGroupName = '';
  editGroupName = '';
  searchPeople = '';
  selectedPeople: any[] = [];
  employees: any[] = [];
  chats: any[] = [];
  filteredChats: any[] = [];
  showImageViewer = false;
  viewerImageUrl = '';

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private fcm: FcmService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef   // ✅ inject for manual change detection
  ) { }

  // ══════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════

  ngOnInit(): void {
    this.loadChatList();
    this.connectWebSocket();
    this.initFcm();
  }

  ngOnDestroy(): void {
    if (this.ws) this.ws.close();
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimeouts.forEach(t => clearTimeout(t));
    this.typingTimeouts.clear();
    this.fcm.removeToken();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  showEmojiPicker = false;

  toggleEmojiPicker(event: MouseEvent): void {
    event.stopPropagation();
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  onEmojiSelected(emoji: string): void {
    this.newMessage += emoji;

    setTimeout(() => {
      const el = document.querySelector('.message-input') as HTMLInputElement;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 0);
  }

  // ══════════════════════════════════════════════════════
  // SAFE URL BUILDER
  // ══════════════════════════════════════════════════════

  private buildFileUrl(rawPath: string | null | undefined): string | null {
    if (!rawPath) return null;
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) return rawPath;
    return this.api.getProfileImageUrl(rawPath);
  }

  // ══════════════════════════════════════════════════════
  // MAP SERVER MESSAGE → local msg object
  // ══════════════════════════════════════════════════════

  private mapMessage(m: any, isOwn: boolean, read: boolean): any {
    const rawFileUrl = Array.isArray(m.fileUrl) ? (m.fileUrl[0] ?? null) : (m.fileUrl ?? null);
    const fileUrl = this.buildFileUrl(rawFileUrl);
    const attachments = (m.attachments ?? []).map((a: any) => ({
      url: this.buildFileUrl(a.url),
      name: a.name,
      type: a.type,
    }));
    let text = m.text ?? '';
    if (!text && attachments.length > 0) {
      const first = attachments[0];
      text = first.type === 'image' ? `[Image] ${first.name}` : `[File] ${first.name}`;
    }
    return {
      id: m.messageId,
      sender: m.type === 'system' ? 'System' : (m.sender?.name ?? ''),
      text,
      profile: this.buildFileUrl(m.sender?.profile),
      time: this.formatTime(m.createdAt),
      isOwn,
      status: m.status,
      type: m.type || 'text',
      read,
      fileUrl,
      attachments,
    };
  }

  // ══════════════════════════════════════════════════════
  // FCM
  // ══════════════════════════════════════════════════════

  private initFcm(): void {
    this.fcm.requestPermission();
    this.fcm.listenForeground((payload) => {
      const title = payload.notification?.title ?? 'New Message';
      const body = payload.notification?.body ?? '';
      const chatId = payload.data?.chatId;
      this.toast.show(`${title}: ${body}`, 'info');
      if (chatId && this.selectedChat?.chatId !== chatId) {
        const chat = this.chats.find(c => c.chatId === chatId);
        if (chat) { chat.unreadCount = (chat.unreadCount || 0) + 1; this.filterChats(); }
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // LAST READ
  // ══════════════════════════════════════════════════════

  saveLastRead(chatId: string, messageId: number): void {
    localStorage.setItem(`${this.READ_KEY}${chatId}`, String(messageId));
  }

  getLastRead(chatId: string): number {
    return Number(localStorage.getItem(`${this.READ_KEY}${chatId}`) || 0);
  }

  countUnread(messages: any[], chatId: string): number {
    const lastReadId = this.getLastRead(chatId);
    return messages.filter(m => !m.isOwn && Number(m.id) > lastReadId).length;
  }

  // ══════════════════════════════════════════════════════
  // WEBSOCKET
  // ══════════════════════════════════════════════════════

  connectWebSocket(): void {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';

    if (!token) {
      this.toast.show('No auth token found', 'error');
      return;
    }

    if (this.ws) this.ws.close();

    try {
      this.ws = new WebSocket(`${this.wsUrl}?token=${token}`);
    } catch (e) {
      console.error('❌ Failed to create WebSocket:', e);
      return;
    }

    this.ws.onopen = () => {
      console.log('✅ WS CONNECTED');
      this.chats.filter(c => c.isGroup && c.chatId).forEach(c => this.joinRoom(c.chatId));
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN)
          this.ws.send(JSON.stringify({ type: 'ping' }));
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      this.ngZone.run(() => {
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.success !== undefined) return;
        if (data.error !== undefined) { console.error('❌ WS error:', data.error); return; }
        if (data.type === 'pong') return;

        switch (data.event) {
          case 'new_message': this.handleNewMessageEvent(data); break;
          case 'message_ack': this.handleMessageAck(data); break;
          case 'message_delivered': this.handleDeliveredEvent(data); break;
          case 'typing_start': this.handleTypingEvent(data, true); break;
          case 'typing_stop': this.handleTypingEvent(data, false); break;
          case 'message_seen': this.handleSeenEvent(data); break;
          case 'seen_ack': break;
          case 'user_online':
          case 'user_offline': this.handleOnlineStatus(data); break;
          case 'sync_required': this.loadChatList(); break;
          case 'join_ack': break;
          default: console.warn('⚠️ Unknown WS event:', data.event);
        }
      });
    };

    this.ws.onerror = () => this.toast.show('Connection error. Retrying...', 'error');
    this.ws.onclose = (event) => {
      clearInterval(this.pingInterval);
      if (event.code === 1008) {
        this.toast.show('Session expired. Please login again.', 'error');
        sessionStorage.clear();
        window.location.href = '/login';
        return;
      }
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  joinRoom(chatId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type: 'JOIN', chatId }));
  }

  // ══════════════════════════════════════════════════════
  // SOCKET EVENTS
  // ══════════════════════════════════════════════════════

  handleMessageAck(data: any): void {
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (!chat) return;
    const tempMsg = chat.messages?.find((m: any) => m.status === 'sending' && m.isOwn);
    if (tempMsg) { tempMsg.id = data.messageId; tempMsg.status = data.status || 'sent'; }
  }

  handleDeliveredEvent(data: any): void {
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (!chat) return;
    chat.messages?.forEach((m: any) => { if (m.id === data.messageId) m.status = 'delivered'; });
  }

  handleNewMessageEvent(data: any): void {
    const msg = data.data;
    const chatId = msg?.chatId;
    if (!chatId) return;

    const chat = this.chats.find(c => c.chatId === chatId);
    if (!chat) { this.loadChatList(); return; }

    const isOwn = String(msg.sender?.userId) === String(this.currentUserId);
    const isChatOpen = this.selectedChat?.chatId === chatId;

    if (isOwn && isChatOpen) {
      const tempMsg = chat.messages?.find((m: any) => m.status === 'sending' && m.isOwn);
      if (tempMsg) {
        const mapped = this.mapMessage(msg, true, true);
        tempMsg.id = mapped.id;
        tempMsg.status = mapped.status || 'sent';
        tempMsg.time = mapped.time;
        tempMsg.fileUrl = mapped.fileUrl;
        tempMsg.attachments = mapped.attachments;
        tempMsg.text = mapped.text || tempMsg.text;
        delete tempMsg.tempId;
        this.saveLastRead(chatId, msg.messageId);
        chat.unreadCount = 0;
        return;
      }
    }

    const newMsg = this.mapMessage(msg, isOwn, isOwn || isChatOpen);
    chat.messages = chat.messages || [];
    chat.messages.push(newMsg);
    chat.lastMessage = newMsg.text;
    chat.lastMessageTime = newMsg.time;

    if (isOwn || isChatOpen) {
      this.saveLastRead(chatId, msg.messageId);
      chat.unreadCount = 0;
      if (isChatOpen) this.api.markMessagesSeen(chatId, [msg.messageId]).subscribe();
    } else {
      chat.unreadCount = this.countUnread(chat.messages, chatId);
    }

    if (isChatOpen) this.shouldScroll = true;
    this.sortAndFilterChats();
  }

  handleTypingEvent(data: any, isTyping: boolean): void {
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (!chat) return;
    const isChatOpen = this.selectedChat?.chatId === data.chatId;
    chat.isTyping = isTyping;
    chat.typingPerson = isTyping ? data.senderName : null;
    if (isChatOpen) {
      this.isTyping = isTyping;
      this.typingPerson = isTyping ? data.senderName : '';
      if (isTyping) this.shouldScroll = true;
    }
    if (isTyping) {
      const existing = this.typingTimeouts.get(data.chatId);
      if (existing) clearTimeout(existing);
      const timeout = setTimeout(() => {
        chat.isTyping = false; chat.typingPerson = null;
        if (this.selectedChat?.chatId === data.chatId) { this.isTyping = false; this.typingPerson = ''; }
        this.typingTimeouts.delete(data.chatId);
      }, 4000);
      this.typingTimeouts.set(data.chatId, timeout);
    } else {
      const existing = this.typingTimeouts.get(data.chatId);
      if (existing) { clearTimeout(existing); this.typingTimeouts.delete(data.chatId); }
    }
  }

  // ══════════════════════════════════════════════════════
  // ✅ FIXED handleSeenEvent
  // Updates BOTH chat.messages AND selectedChat.messages
  // Then calls cdr.detectChanges() to force UI refresh
  // ══════════════════════════════════════════════════════

  handleSeenEvent(data: any): void {
    console.log('👁️ message_seen received:', data);

    const chatId = data.chatId;
    const messageIds = (data.messageIds ?? []).map((id: any) => Number(id));
    if (!chatId || messageIds.length === 0) return;

    // ── Update chats array ────────────────────────────────────────
    const chat = this.chats.find(c => c.chatId === chatId);
    if (chat?.messages) {
      chat.messages = chat.messages.map((m: any) =>
        messageIds.includes(Number(m.id)) ? { ...m, status: 'seen' } : m
      );
    }

    // ── Update selectedChat — also reassign the reference ────────
    if (this.selectedChat?.chatId === chatId) {
      // Step 1: map to new objects
      const updatedMessages = (this.selectedChat.messages || []).map((m: any) =>
        messageIds.includes(Number(m.id)) ? { ...m, status: 'seen' } : m
      );

      // Step 2: apply detailed updates if present
      const detailedUpdates: any[] = data.messages ?? [];
      const finalMessages = detailedUpdates.length > 0
        ? updatedMessages.map((m: any) => {
          const u = detailedUpdates.find((d: any) => Number(d.messageId) === Number(m.id));
          return u ? { ...m, status: u.status, seenBy: u.seenBy, seenCount: u.seenCount } : m;
        })
        : updatedMessages;

      // ✅ CRITICAL: reassign selectedChat itself as a new object
      // This forces Angular to detect the change on the bound property
      this.selectedChat = { ...this.selectedChat, messages: finalMessages };

      console.log('✅ selectedChat reassigned with updated messages');
    }

    // ✅ Force change detection
    this.cdr.detectChanges();
  }

  // ══════════════════════════════════════════════════════
  // 2. Add trackBy method to messages.ts class
  // ══════════════════════════════════════════════════════

  trackByMsgId(index: number, msg: any): any {
    return msg.id;
  }

  handleOnlineStatus(data: any): void {
    const isOnline = data.event === 'user_online';
    this.chats.forEach(c => {
      if (!c.isGroup && String(c.userId) === String(data.userId)) c.online = isOnline;
    });
  }

  // ══════════════════════════════════════════════════════
  // LOAD CHAT LIST
  // ══════════════════════════════════════════════════════

  loadChatList(): void {
    this.isLoadingChats = true;
    this.api.getChatList(1, 50).subscribe({
      next: (res: any) => {
        this.isLoadingChats = false;
        if (!res.success) return;
        const items = res.data?.items ?? [];
        this.chats = items.map((c: any) => ({
          chatId: c.chatId,
          id: c.chatId,
          name: c.name,
          profile: c.type === 'individual'
            ? this.buildFileUrl(c.participants?.[0]?.profile)
            : null,
          avatar: c.type === 'group'
            ? this.buildFileUrl(c.avatar)
            : this.buildFileUrl(c.participants?.[0]?.profile),
          isGroup: c.type === 'group',
          online: c.participants?.[0]?.isOnline ?? false,
          lastMessage: c.lastMessage?.text ?? '',
          lastMessageTime: c.lastMessage?.createdAt ? this.formatTime(c.lastMessage.createdAt) : '',
          unreadCount: c.unreadCount ?? 0,
          members: c.participantsCount,
          lastSender: c.lastMessage?.senderName,
          isPinned: c.isPinned,
          isMuted: c.isMuted,
          updatedAt: c.updatedAt,
          userId: c.type === 'individual' ? String(c.participants?.[0]?.userId) : null,
          roomId: c.type === 'group' ? c.chatId : null,
          participants: c.participants ?? [],
          messages: [],
          historyLoaded: false,
          isTyping: false,
          typingPerson: null,
        }));
        this.employees = items
          .filter((c: any) => c.type === 'individual' && c.participants?.length)
          .map((c: any) => ({
            id: String(c.participants[0].userId),
            name: c.participants[0].name,
            role: c.participants[0].role || '',
            profile: this.buildFileUrl(c.participants[0].profile)
          }));
        this.sortAndFilterChats();
        this.chats
          .filter(c => c.isGroup && c.chatId && this.ws?.readyState === WebSocket.OPEN)
          .forEach(c => this.joinRoom(c.chatId));
      },
      error: () => { this.isLoadingChats = false; this.toast.show('Failed to load chats', 'error'); }
    });
  }

  // ══════════════════════════════════════════════════════
  // LOAD CHAT HISTORY
  // ══════════════════════════════════════════════════════

  loadChatHistory(chat: any): void {
    if (chat.historyLoaded) { this.shouldScroll = true; return; }
    this.isLoadingHistory = true;
    this.api.getChatMessages(chat.chatId, 1, 30).subscribe({
      next: (res: any) => {
        this.isLoadingHistory = false;
        if (!res.success) return;
        chat.messages = (res.data?.items ?? []).map((m: any) => {
          const isOwn = String(m.sender?.userId) === String(this.currentUserId);
          return this.mapMessage(m, isOwn, true);
        });
        chat.historyLoaded = true;
        const ids = chat.messages
          .filter((m: any) => !m.isOwn && m.type !== 'system')
          .map((m: any) => m.id);
        if (ids.length > 0) {
          this.api.markMessagesSeen(chat.chatId, ids).subscribe();
          this.saveLastRead(chat.chatId, Math.max(...ids));
        }
        chat.unreadCount = 0;
        this.shouldScroll = true;
        this.sortAndFilterChats();
      },
      error: () => { this.isLoadingHistory = false; }
    });
  }

  // ══════════════════════════════════════════════════════
  // SELECT CHAT
  // ══════════════════════════════════════════════════════

  selectChat(chat: any): void {
    this.selectedChat = chat;
    chat.unreadCount = 0;
    this.isTyping = chat.isTyping ?? false;
    this.typingPerson = chat.typingPerson ?? '';
    this.loadChatHistory(chat);
    if (chat.isGroup && chat.chatId) this.joinRoom(chat.chatId);
    this.shouldScroll = true;
  }

  // ══════════════════════════════════════════════════════
  // SEND MESSAGE
  // ══════════════════════════════════════════════════════

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.selectedChat) return;
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.toast.show('Not connected. Retrying...', 'error');
      this.connectWebSocket();
      return;
    }
    const messageText = this.newMessage.trim();
    const tempId = Date.now();
    this.selectedChat.messages = this.selectedChat.messages || [];
    this.selectedChat.messages.push({
      id: tempId, sender: this.currentUserName, text: messageText,
      time: this.formatTime(new Date().toISOString()), isOwn: true,
      status: 'sending', type: 'text', read: true,
      fileUrl: null, attachments: [], tempId,
    });
    this.selectedChat.lastMessage = messageText;
    this.selectedChat.lastMessageTime = this.formatTime(new Date().toISOString());
    this.newMessage = '';
    this.shouldScroll = true;
    this.ws.send(JSON.stringify({
      type: 'new_message', chatId: this.selectedChat.chatId,
      text: messageText, msgType: 'text', tempId,
    }));
    this.ws.send(JSON.stringify({ type: 'typing_stop', chatId: this.selectedChat.chatId }));
  }

  // ══════════════════════════════════════════════════════
  // FILE UPLOAD
  // ══════════════════════════════════════════════════════

  triggerFileUpload(): void { this.fileInput?.nativeElement.click(); }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0 || !this.selectedChat) return;
    const fileArray: File[] = Array.from(input.files);
    input.value = '';
    const MAX_BYTES = 10485760;
    const validFiles = fileArray.filter(f => {
      if (f.size > MAX_BYTES) { this.toast.show(`${f.name} is too large (max 10MB)`, 'error'); return false; }
      return true;
    });
    if (validFiles.length === 0) return;
    this.isUploadingFile = true;
    try {
      const base64List = await Promise.all(validFiles.map(f => this.fileToBase64(f)));
      const payload: any = { chatId: this.selectedChat.chatId };
      if (validFiles.length === 1) { payload.file = base64List[0]; payload.fileName = validFiles[0].name; }
      else { payload.files = base64List; payload.fileNames = validFiles.map(f => f.name); }
      this.api.uploadChatFile(payload).subscribe({
        next: (res: any) => {
          this.isUploadingFile = false;
          if (!res.success) { this.toast.show(res.message || 'Upload failed', 'error'); return; }
          const uploaded = Array.isArray(res.data) ? res.data : [res.data];
          this.handleUploadedFiles(uploaded, validFiles);
        },
        error: (err: any) => {
          this.isUploadingFile = false;
          this.toast.show(err?.error?.message ?? `Upload failed (${err.status})`, 'error');
        }
      });
    } catch { this.isUploadingFile = false; this.toast.show('File processing failed', 'error'); }
  }

  handleUploadedFiles(uploadedFiles: any[], originalFiles: File[]): void {
    if (!uploadedFiles?.length) return;
    const attachments = uploadedFiles.map((f: any, i: number) => ({
      url: f.url ?? '',
      name: f.name ?? originalFiles[i]?.name ?? 'file',
      type: f.type ?? (originalFiles[i]?.type?.startsWith('image/') ? 'image' : 'file'),
    }));
    const msgType = attachments.every(a => a.type === 'image') ? 'image' : 'file';
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.toast.show('Not connected. Please retry.', 'error'); return;
    }
    this.ws.send(JSON.stringify({ type: 'new_message', chatId: this.selectedChat.chatId, msgType, text: '', attachments }));
    this.selectedChat.messages = this.selectedChat.messages || [];
    attachments.forEach((att: any, i: number) => {
      const fullUrl = this.buildFileUrl(att.url);
      this.selectedChat.messages.push({
        id: Date.now() + i, sender: this.currentUserName,
        text: att.type === 'image' ? `[Image] ${att.name}` : `[File] ${att.name}`,
        time: this.formatTime(new Date().toISOString()), isOwn: true,
        status: 'sending', type: att.type, read: true,
        fileUrl: fullUrl, attachments: [{ url: fullUrl, name: att.name, type: att.type }],
      });
    });
    this.shouldScroll = true;
  }

  // ══════════════════════════════════════════════════════
  // GROUP AVATAR UPLOAD
  // ══════════════════════════════════════════════════════

  triggerAvatarUpload(): void { this.avatarInput?.nativeElement.click(); }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedChat?.isGroup) return;
    input.value = '';
    if (!file.type.startsWith('image/')) { this.toast.show('Please select an image file', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { this.toast.show('Image too large. Max 5MB', 'error'); return; }
    this.isUploadingAvatar = true;
    try {
      const base64 = await this.fileToBase64(file);
      this.api.uploadGroupAvatar(base64, this.selectedChat.chatId).subscribe({
        next: (res: any) => {
          this.isUploadingAvatar = false;
          if (res.success && res.data?.url) {
            const fullUrl = this.buildFileUrl(res.data.url);
            this.selectedChat.avatar = fullUrl;
            const chat = this.chats.find(c => c.chatId === this.selectedChat.chatId);
            if (chat) chat.avatar = fullUrl;
            this.toast.show('Group avatar updated!', 'success');
            this.loadChatList();
          } else { this.toast.show('Avatar upload failed', 'error'); }
        },
        error: () => { this.isUploadingAvatar = false; this.toast.show('Avatar upload failed', 'error'); }
      });
    } catch { this.isUploadingAvatar = false; this.toast.show('Failed to read image', 'error'); }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // ══════════════════════════════════════════════════════
  // GROUP INFO MODAL
  // ══════════════════════════════════════════════════════

  openGroupInfoModal(): void {
    if (!this.selectedChat?.isGroup) return;
    this.editGroupName = this.selectedChat.name;
    this.showGroupInfoModal = true;
  }

  closeGroupInfoModal(): void { this.showGroupInfoModal = false; this.editGroupName = ''; }

  saveGroupInfo(): void {
    if (!this.editGroupName.trim() || !this.selectedChat) return;
    this.api.updateGroupInfo(this.selectedChat.chatId, this.editGroupName.trim()).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.selectedChat.name = this.editGroupName.trim();
          this.toast.show('Group name updated!', 'success');
          this.closeGroupInfoModal();
          this.loadChatList();
        } else { this.toast.show(res.message || 'Update failed', 'error'); }
      },
      error: () => this.toast.show('Something went wrong', 'error')
    });
  }

  leaveGroup(): void {
    if (!this.selectedChat?.isGroup) return;
    if (!confirm('Are you sure you want to leave this group?')) return;
    this.api.removeParticipant(this.selectedChat.chatId, Number(this.currentUserId)).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.toast.show('You left the group', 'success');
          this.selectedChat = null;
          this.closeGroupInfoModal();
          this.loadChatList();
        }
      },
      error: () => this.toast.show('Failed to leave group', 'error')
    });
  }

  // ══════════════════════════════════════════════════════
  // TYPING
  // ══════════════════════════════════════════════════════

  onTyping(): void {
    if (!this.selectedChat || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'typing_start', chatId: this.selectedChat.chatId }));
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ type: 'typing_stop', chatId: this.selectedChat.chatId }));
    }, 2000);
  }

  // ══════════════════════════════════════════════════════
  // NEW CHAT MODAL
  // ══════════════════════════════════════════════════════

  openNewChatModal(): void {
    this.showNewChatModal = true;
    this.newChatType = 'direct';
    this.newGroupName = '';
    this.searchPeople = '';
    this.selectedPeople = [];
    this.loadEmployeesForModal();
  }

  closeNewChatModal(): void { this.showNewChatModal = false; }

  loadEmployeesForModal(): void {
    this.isLoadingPeople = true;
    this.api.getEmployeeList(1, 100).subscribe({
      next: (res: any) => {
        this.isLoadingPeople = false;
        if (res.success) {
          const all = res.data?.items ?? res.data?.content ?? [];
          this.employees = all
            .filter((e: any) => String(e.id) !== String(this.currentUserId))
            .map((e: any) => ({
              id: String(e.id),
              name: `${e.firstName} ${e.lastName}`.trim(),
              role: e.designationName || e.role || '',
              empId: e.empId,
            }));
        }
      },
      error: () => { this.isLoadingPeople = false; }
    });
  }

  isSelected(p: any): boolean { return this.selectedPeople.some(s => s.id === p.id); }

  togglePerson(p: any): void {
    if (this.newChatType === 'direct') { this.selectedPeople = [p]; }
    else {
      this.isSelected(p)
        ? (this.selectedPeople = this.selectedPeople.filter(s => s.id !== p.id))
        : this.selectedPeople.push(p);
    }
  }

  createChat(): void {
    if (this.selectedPeople.length === 0) return;
    const isGroup = this.newChatType === 'group';
    const payload: any = {
      type: isGroup ? 'group' : 'individual',
      participantIds: this.selectedPeople.map(p => Number(p.id)),
    };
    if (isGroup) payload.name = this.newGroupName.trim() || 'New Group';
    this.isCreatingChat = true;
    this.api.createOrGetChat(payload).subscribe({
      next: (res: any) => {
        this.isCreatingChat = false;
        if (!res.success) { this.toast.show(res.message || 'Failed', 'error'); return; }
        this.closeNewChatModal();
        this.loadChatList();
        const newChatId = res.data?.chatId;
        if (newChatId) {
          setTimeout(() => {
            const found = this.chats.find(c => c.chatId === newChatId);
            if (found) this.selectChat(found);
          }, 600);
        }
      },
      error: () => { this.isCreatingChat = false; this.toast.show('Something went wrong', 'error'); }
    });
  }

  // ══════════════════════════════════════════════════════
  // IMAGE VIEWER
  // ══════════════════════════════════════════════════════

  openImage(msg: any): void {
    if (msg.fileUrl) { this.viewerImageUrl = msg.fileUrl; this.showImageViewer = true; }
  }
  closeImageViewer(): void { this.showImageViewer = false; this.viewerImageUrl = ''; }

  // ══════════════════════════════════════════════════════
  // FILTER / SEARCH
  // ══════════════════════════════════════════════════════

  sortAndFilterChats(): void {
    this.chats.sort((a, b) => {
      if (!a.updatedAt && !b.updatedAt) return 0;
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    this.filterChats();
  }

  filterChats(): void {
    let list = [...this.chats];
    if (this.searchChat.trim()) {
      const q = this.searchChat.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q));
    }
    if (this.activeFilter === 'unread') list = list.filter(c => c.unreadCount > 0);
    if (this.activeFilter === 'groups') list = list.filter(c => c.isGroup);
    this.filteredChats = list;
  }

  setFilter(f: string): void { this.activeFilter = f; this.filterChats(); }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  get filteredPeople(): any[] {
    if (!this.searchPeople.trim()) return this.employees;
    const q = this.searchPeople.toLowerCase();
    return this.employees.filter(p => p.name?.toLowerCase().includes(q) || p.role?.toLowerCase().includes(q));
  }

  get unreadCount(): number { return this.chats.filter(c => c.unreadCount > 0).length; }

  getInitial(name: string): string { return (name || '?').charAt(0).toUpperCase(); }
  getFileUrl(msg: any): string { return msg.fileUrl || ''; }

  getFileName(text: string): string {
    return (text ?? '').replace('[Image] ', '').replace('[File] ', '').trim();
  }

  downloadFile(msg: any): void {
    const url = msg.fileUrl;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = this.getFileName(msg.text);
    a.target = '_blank'; document.body.appendChild(a);
    a.click(); document.body.removeChild(a);
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.img-error')) {
      const err = document.createElement('div');
      err.className = 'img-error';
      err.innerHTML = '<span class="material-icons">broken_image</span><span>Image unavailable</span>';
      parent.appendChild(err);
    }
  }

  isImageMessage(msg: any): boolean { return msg.type === 'image' || msg.text?.startsWith('[Image]'); }
  isFileMessage(msg: any): boolean { return msg.type === 'file' || msg.text?.startsWith('[File]'); }
  isSystemMessage(msg: any): boolean { return msg.type === 'system'; }

  scrollToBottom(): void {
    try {
      if (this.messagesArea)
        this.messagesArea.nativeElement.scrollTop = this.messagesArea.nativeElement.scrollHeight;
    } catch { }
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso), today = new Date(), yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString())
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
  }
}