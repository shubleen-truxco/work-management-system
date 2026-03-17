import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewChecked
} from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { Sidebar }       from '../../shared/sidebar/sidebar';
import { ApiService }    from '../../core/services/api.service';
import { ToastService }  from '../../shared/toast/toast.service';
import { FcmService }    from '../../core/services/fcm.service';

@Component({
  selector:    'app-messages',
  standalone:  true,
  imports:     [CommonModule, FormsModule, Sidebar],
  templateUrl: './messages.html',
  styleUrls:   ['./messages.css'],
})
export class Messages implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('messagesArea') messagesArea!:  ElementRef;
  @ViewChild('fileInput')    fileInput!:     ElementRef;
  @ViewChild('avatarInput')  avatarInput!:   ElementRef;

  // ── Current user ──────────────────────────────────────
  currentUserId   = sessionStorage.getItem('id')    || '';
  currentUserName = sessionStorage.getItem('user')  || 'Me';
  private token   = sessionStorage.getItem('token') || '';

  // ── WebSocket ─────────────────────────────────────────
  private ws!:          WebSocket;
  private wsUrl         = 'ws://localhost:8080/wms/ws/chat';
  private shouldScroll  = false;
  private typingTimer:  any;
  private pingInterval: any;

  // ── Last read ─────────────────────────────────────────
  private readonly READ_KEY = 'chat_last_read_';

  // ── Typing ────────────────────────────────────────────
  isTyping               = false;
  typingPerson           = '';
  private typingTimeouts: Map<string, any> = new Map();

  // ── UI State ──────────────────────────────────────────
  searchChat         = '';
  activeFilter       = 'all';
  newMessage         = '';
  isLoadingHistory   = false;
  isLoadingChats     = false;
  isCreatingChat     = false;
  isLoadingPeople    = false;
  isUploadingFile    = false;
  isUploadingAvatar  = false;
  selectedChat: any  = null;
  showNewChatModal   = false;
  showGroupInfoModal = false;
  newChatType        = 'direct';
  newGroupName       = '';
  editGroupName      = '';
  searchPeople       = '';
  selectedPeople:    any[] = [];
  employees:         any[] = [];
  chats:             any[] = [];
  filteredChats:     any[] = [];

  // ── Image viewer ──────────────────────────────────────
  showImageViewer   = false;
  viewerImageUrl    = '';

  constructor(
    private api:   ApiService,
    private toast: ToastService,
    private fcm:   FcmService,
  ) {}

  // ══════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════

  ngOnInit(): void {
    this.loadChatList();
    this.connectWebSocket();
    this.initFcm();
  }

  ngOnDestroy(): void {
    if (this.ws)           this.ws.close();
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.typingTimer)  clearTimeout(this.typingTimer);
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

  // ══════════════════════════════════════════════════════
  // FCM
  // ══════════════════════════════════════════════════════

  private initFcm(): void {
    this.fcm.requestPermission();

    this.fcm.listenForeground((payload) => {
      const title  = payload.notification?.title ?? 'New Message';
      const body   = payload.notification?.body  ?? '';
      const chatId = payload.data?.chatId;

      this.toast.show(`${title}: ${body}`, 'info');

      if (chatId && this.selectedChat?.chatId !== chatId) {
        const chat = this.chats.find(c => c.chatId === chatId);
        if (chat) {
          chat.unreadCount = (chat.unreadCount || 0) + 1;
          this.filterChats();
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // LAST READ TRACKING
  // ══════════════════════════════════════════════════════

  saveLastRead(chatId: string, messageId: number): void {
    localStorage.setItem(`${this.READ_KEY}${chatId}`, String(messageId));
  }

  getLastRead(chatId: string): number {
    return Number(localStorage.getItem(`${this.READ_KEY}${chatId}`) || 0);
  }

  countUnread(messages: any[], chatId: string): number {
    const lastReadId = this.getLastRead(chatId);
    return messages.filter(
      m => !m.isOwn && Number(m.id) > lastReadId
    ).length;
  }

  // ══════════════════════════════════════════════════════
  // WEBSOCKET
  // ══════════════════════════════════════════════════════

  connectWebSocket(): void {
    if (!this.token) {
      this.toast.show('No auth token found', 'error');
      return;
    }

    this.ws = new WebSocket(`${this.wsUrl}?token=${this.token}`);

    this.ws.onopen = () => {
      console.log('✅ WS connected');
      this.chats
        .filter(c => c.isGroup && c.chatId)
        .forEach(c => this.joinRoom(c.chatId));

      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.success !== undefined ||
          data.error   !== undefined ||
          data.type    === 'pong') return;

      switch (data.event) {
        case 'new_message':   this.handleNewMessageEvent(data);    break;
        case 'typing_start':  this.handleTypingEvent(data, true);  break;
        case 'typing_stop':   this.handleTypingEvent(data, false); break;
        case 'message_seen':  this.handleSeenEvent(data);          break;
        case 'user_online':
        case 'user_offline':  this.handleOnlineStatus(data);       break;
        case 'sync_required': this.loadChatList();                 break;
        case 'join_ack':      console.log('Joined:', data.chatId); break;
      }
    };

    this.ws.onerror = () =>
      this.toast.show('Connection error. Retrying...', 'error');

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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'JOIN', chatId }));
    }
  }

  // ══════════════════════════════════════════════════════
  // SOCKET EVENTS
  // ══════════════════════════════════════════════════════

  handleNewMessageEvent(data: any): void {
  const msg    = data.data;
  const chatId = msg?.chatId;
  if (!chatId) return;

  const chat = this.chats.find(c => c.chatId === chatId);
  if (!chat) { this.loadChatList(); return; }

  const isOwn      = String(msg.sender?.userId) === String(this.currentUserId);
  const isChatOpen = this.selectedChat?.chatId === chatId;

  // ✅ Check if this is our own message (optimistic update confirmation)
  if (isOwn && isChatOpen) {
    // Find and update the optimistic message
    const tempMsg = chat.messages?.find((m: any) => m.status === 'sending' && m.isOwn);
    if (tempMsg) {
      // ✅ Update the temporary message with real data
      tempMsg.id = msg.messageId;
      tempMsg.status = msg.status || 'sent';
      tempMsg.time = this.formatTime(msg.createdAt);
      delete tempMsg.tempId; // Remove temporary marker
      
      // ✅ Don't add duplicate message
      this.saveLastRead(chatId, msg.messageId);
      chat.unreadCount = 0;
      return;
    }
  }

  // ✅ For messages from others or not found optimistic message
  const newMsg = {
    id:      msg.messageId,
    sender:  msg.sender?.name,
    text:    msg.text ?? '',
    time:    this.formatTime(msg.createdAt),
    isOwn,
    status:  msg.status,
    type:    msg.type || 'text',
    read:    isOwn || isChatOpen,
    fileUrl: msg.fileUrl
             ? this.api.getProfileImageUrl(msg.fileUrl)
             : null,
  };

  chat.messages = chat.messages || [];
  chat.messages.push(newMsg);
  chat.lastMessage     = msg.text ?? '';
  chat.lastMessageTime = newMsg.time;

  if (isOwn || isChatOpen) {
    this.saveLastRead(chatId, msg.messageId);
    chat.unreadCount = 0;
    if (isChatOpen) {
      this.api.markMessagesSeen(chatId, [msg.messageId]).subscribe();
    }
  } else {
    chat.unreadCount = this.countUnread(chat.messages, chatId);
  }

  if (isChatOpen) this.shouldScroll = true;
  this.sortAndFilterChats();
}

  handleTypingEvent(data: any, isTyping: boolean): void {
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (!chat) return;

    const isChatOpen  = this.selectedChat?.chatId === data.chatId;
    chat.isTyping     = isTyping;
    chat.typingPerson = isTyping ? data.senderName : null;

    if (isChatOpen) {
      this.isTyping     = isTyping;
      this.typingPerson = isTyping ? data.senderName : '';
      if (isTyping) this.shouldScroll = true;
    }

    if (isTyping) {
      const existing = this.typingTimeouts.get(data.chatId);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        chat.isTyping     = false;
        chat.typingPerson = null;
        if (this.selectedChat?.chatId === data.chatId) {
          this.isTyping     = false;
          this.typingPerson = '';
        }
        this.typingTimeouts.delete(data.chatId);
      }, 4000);

      this.typingTimeouts.set(data.chatId, timeout);
    } else {
      const existing = this.typingTimeouts.get(data.chatId);
      if (existing) {
        clearTimeout(existing);
        this.typingTimeouts.delete(data.chatId);
      }
    }
  }

  handleSeenEvent(data: any): void {
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (chat && data.messageIds) {
      chat.messages?.forEach((m: any) => {
        if (data.messageIds.includes(m.id)) m.status = 'seen';
      });
    }
  }

  handleOnlineStatus(data: any): void {
    const isOnline = data.event === 'user_online';
    this.chats.forEach(c => {
      if (!c.isGroup && String(c.userId) === String(data.userId)) {
        c.online = isOnline;
      }
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
          chatId:          c.chatId,
          id:              c.chatId,
          name:            c.name,
          avatar:          c.avatar
                             ? this.api.getProfileImageUrl(c.avatar)
                             : null,
          isGroup:         c.type === 'group',
          online:          c.participants?.[0]?.isOnline ?? false,
          lastMessage:     c.lastMessage?.text ?? '',
          lastMessageTime: c.lastMessage?.createdAt
                             ? this.formatTime(c.lastMessage.createdAt)
                             : '',
          unreadCount:     c.unreadCount ?? 0,
          members:         c.participantsCount,
          lastSender:      c.lastMessage?.senderName,
          isPinned:        c.isPinned,
          isMuted:         c.isMuted,
          updatedAt:       c.updatedAt,
          userId:          c.type === 'individual'
                             ? String(c.participants?.[0]?.userId) : null,
          roomId:          c.type === 'group' ? c.chatId : null,
          participants:    c.participants ?? [],
          messages:        [],
          historyLoaded:   false,
          isTyping:        false,
          typingPerson:    null,
        }));

        this.employees = items
          .filter((c: any) => c.type === 'individual' && c.participants?.length)
          .map((c: any) => ({
            id:   String(c.participants[0].userId),
            name: c.participants[0].name,
            role: c.participants[0].role || '',
          }));

        this.sortAndFilterChats();

        this.chats
          .filter(c => c.isGroup && c.chatId
            && this.ws?.readyState === WebSocket.OPEN)
          .forEach(c => this.joinRoom(c.chatId));
      },
      error: () => {
        this.isLoadingChats = false;
        this.toast.show('Failed to load chats', 'error');
      }
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

        const messages = res.data?.items ?? [];

        chat.messages = messages.map((m: any) => ({
          id:      m.messageId,
          sender:  m.type === 'system' ? 'System' : m.sender?.name,
          text:    m.text ?? '',
          time:    this.formatTime(m.createdAt),
          isOwn:   String(m.sender?.userId) === String(this.currentUserId),
          status:  m.status,
          type:    m.type || 'text',
          read:    true,
          // ── Build full file URL ───────────────────
          fileUrl: m.fileUrl
                   ? this.api.getProfileImageUrl(m.fileUrl)
                   : null,
        }));

        chat.historyLoaded = true;

        const ids = chat.messages
          .filter((m: any) => !m.isOwn && m.type !== 'system')
          .map((m: any) => m.id);

        if (ids.length > 0) {
          this.api.markMessagesSeen(chat.chatId, ids).subscribe();
          this.saveLastRead(chat.chatId, Math.max(...ids));
        }

        chat.unreadCount  = 0;
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
    chat.unreadCount  = 0;
    this.isTyping     = chat.isTyping     ?? false;
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
  
  const tempId = Date.now(); // Temporary ID until we get real one from server
  const optimisticMessage = {
    id:      tempId,
    sender:  this.currentUserName,
    text:    messageText,
    time:    this.formatTime(new Date().toISOString()),
    isOwn:   true,
    status:  'sending', // ✅ Show as "sending" first
    type:    'text',
    read:    true,
    fileUrl: null,
    tempId:  tempId  // ✅ Mark as temporary
  };

  this.selectedChat.messages = this.selectedChat.messages || [];
  this.selectedChat.messages.push(optimisticMessage);
  
  this.selectedChat.lastMessage = messageText;
  this.selectedChat.lastMessageTime = optimisticMessage.time;
  
  this.newMessage = '';
  this.shouldScroll = true;

  this.ws.send(JSON.stringify({
    type:    'new_message',
    chatId:  this.selectedChat.chatId,
    text:    messageText,
    msgType: 'text',
    tempId:  tempId  // ✅ Send temp ID so we can match response
  }));

  this.ws.send(JSON.stringify({
    type:   'typing_stop',
    chatId: this.selectedChat.chatId,
  }));
}
  // ══════════════════════════════════════════════════════
  // FILE UPLOAD
  // ══════════════════════════════════════════════════════

  triggerFileUpload(): void {
    this.fileInput?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file || !this.selectedChat) return;
    input.value = '';

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      this.toast.show('File too large. Max 10MB allowed.', 'error');
      return;
    }

    this.isUploadingFile = true;

    try {
      const base64 = await this.fileToBase64(file);

      this.api.uploadChatFile(
        base64, this.selectedChat.chatId, file.name
      ).subscribe({
        next: (res: any) => {
          this.isUploadingFile = false;
          if (!res.success) {
            this.toast.show('File upload failed', 'error');
            return;
          }

          const rawUrl   = res.data?.url ?? '';
          const fullUrl  = this.api.getProfileImageUrl(rawUrl);
          const fileType = file.type.startsWith('image/') ? 'image' : 'file';
          const msgText  = fileType === 'image'
            ? `[Image] ${file.name}`
            : `[File] ${file.name}`;

          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type:     'new_message',
              chatId:   this.selectedChat.chatId,
              text:     msgText,
              msgType:  fileType,
              fileUrl:  rawUrl,     // ← send raw path to BE
              fileName: file.name,
            }));
          }

          // ── Optimistically add message to UI ──────
          const newMsg = {
            id:      Date.now(),
            sender:  this.currentUserName,
            text:    msgText,
            time:    this.formatTime(new Date().toISOString()),
            isOwn:   true,
            status:  'sent',
            type:    fileType,
            read:    true,
            fileUrl: fullUrl,    // ← full URL for display
          };

          this.selectedChat.messages = this.selectedChat.messages || [];
          this.selectedChat.messages.push(newMsg);
          this.shouldScroll = true;
        },
        error: () => {
          this.isUploadingFile = false;
          this.toast.show('File upload failed', 'error');
        }
      });
    } catch {
      this.isUploadingFile = false;
      this.toast.show('Failed to read file', 'error');
    }
  }

  // ══════════════════════════════════════════════════════
  // GROUP AVATAR UPLOAD
  // ══════════════════════════════════════════════════════

  triggerAvatarUpload(): void {
    this.avatarInput?.nativeElement.click();
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file || !this.selectedChat?.isGroup) return;
    input.value = '';

    if (!file.type.startsWith('image/')) {
      this.toast.show('Please select an image file', 'error');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      this.toast.show('Image too large. Max 5MB', 'error');
      return;
    }

    this.isUploadingAvatar = true;

    try {
      const base64 = await this.fileToBase64(file);

      this.api.uploadGroupAvatar(
        base64, this.selectedChat.chatId
      ).subscribe({
        next: (res: any) => {
          this.isUploadingAvatar = false;
          if (res.success && res.data?.url) {
            const fullUrl = this.api.getProfileImageUrl(res.data.url);
            this.selectedChat.avatar = fullUrl;

            // Also update in chats array
            const chat = this.chats.find(
              c => c.chatId === this.selectedChat.chatId
            );
            if (chat) chat.avatar = fullUrl;

            this.toast.show('Group avatar updated!', 'success');
            this.loadChatList();
          } else {
            this.toast.show('Avatar upload failed', 'error');
          }
        },
        error: () => {
          this.isUploadingAvatar = false;
          this.toast.show('Avatar upload failed', 'error');
        }
      });
    } catch {
      this.isUploadingAvatar = false;
      this.toast.show('Failed to read image', 'error');
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader   = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  // ══════════════════════════════════════════════════════
  // GROUP INFO MODAL
  // ══════════════════════════════════════════════════════

  openGroupInfoModal(): void {
    if (!this.selectedChat?.isGroup) return;
    this.editGroupName      = this.selectedChat.name;
    this.showGroupInfoModal = true;
  }

  closeGroupInfoModal(): void {
    this.showGroupInfoModal = false;
    this.editGroupName      = '';
  }

  saveGroupInfo(): void {
    if (!this.editGroupName.trim() || !this.selectedChat) return;

    this.api.updateGroupInfo(
      this.selectedChat.chatId,
      this.editGroupName.trim()
    ).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.selectedChat.name = this.editGroupName.trim();
          this.toast.show('Group name updated!', 'success');
          this.closeGroupInfoModal();
          this.loadChatList();
        } else {
          this.toast.show(res.message || 'Update failed', 'error');
        }
      },
      error: () => this.toast.show('Something went wrong', 'error')
    });
  }

  leaveGroup(): void {
    if (!this.selectedChat?.isGroup) return;
    if (!confirm('Are you sure you want to leave this group?')) return;

    this.api.removeParticipant(
      this.selectedChat.chatId, Number(this.currentUserId)
    ).subscribe({
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

    this.ws.send(JSON.stringify({
      type:   'typing_start',
      chatId: this.selectedChat.chatId,
    }));

    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type:   'typing_stop',
          chatId: this.selectedChat.chatId,
        }));
      }
    }, 2000);
  }

  // ══════════════════════════════════════════════════════
  // NEW CHAT MODAL
  // ══════════════════════════════════════════════════════

  openNewChatModal(): void {
    this.showNewChatModal = true;
    this.newChatType      = 'direct';
    this.newGroupName     = '';
    this.searchPeople     = '';
    this.selectedPeople   = [];
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
              id:    String(e.id),
              name:  `${e.firstName} ${e.lastName}`.trim(),
              role:  e.designationName || e.role || '',
              empId: e.empId,
            }));
        }
      },
      error: () => { this.isLoadingPeople = false; }
    });
  }

  isSelected(p: any): boolean {
    return this.selectedPeople.some(s => s.id === p.id);
  }

  togglePerson(p: any): void {
    if (this.newChatType === 'direct') {
      this.selectedPeople = [p];
    } else {
      this.isSelected(p)
        ? (this.selectedPeople = this.selectedPeople.filter(s => s.id !== p.id))
        : this.selectedPeople.push(p);
    }
  }

  createChat(): void {
    if (this.selectedPeople.length === 0) return;

    const isGroup  = this.newChatType === 'group';
    const payload: any = {
      type:           isGroup ? 'group' : 'individual',
      participantIds: this.selectedPeople.map(p => Number(p.id)),
    };
    if (isGroup) payload.name = this.newGroupName.trim() || 'New Group';

    this.isCreatingChat = true;

    this.api.createOrGetChat(payload).subscribe({
      next: (res: any) => {
        this.isCreatingChat = false;
        if (!res.success) {
          this.toast.show(res.message || 'Failed', 'error');
          return;
        }

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
      error: () => {
        this.isCreatingChat = false;
        this.toast.show('Something went wrong', 'error');
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // IMAGE VIEWER
  // ══════════════════════════════════════════════════════

  openImage(msg: any): void {
    const url = this.getFileUrl(msg);
    if (url) {
      this.viewerImageUrl = url;
      this.showImageViewer = true;
    }
  }

  closeImageViewer(): void {
    this.showImageViewer = false;
    this.viewerImageUrl  = '';
  }

  // ══════════════════════════════════════════════════════
  // FILTER / SEARCH
  // ══════════════════════════════════════════════════════

  sortAndFilterChats(): void {
    this.chats.sort((a, b) => {
      if (!a.lastMessageTime && !b.lastMessageTime) return 0;
      if (!a.lastMessageTime) return 1;
      if (!b.lastMessageTime) return -1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    this.filterChats();
  }

  filterChats(): void {
    let list = [...this.chats];
    if (this.searchChat.trim()) {
      const q = this.searchChat.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
      );
    }
    if (this.activeFilter === 'unread') list = list.filter(c => c.unreadCount > 0);
    if (this.activeFilter === 'groups') list = list.filter(c => c.isGroup);
    this.filteredChats = list;
  }

  setFilter(f: string): void {
    this.activeFilter = f;
    this.filterChats();
  }

  // ══════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════

  get filteredPeople(): any[] {
    if (!this.searchPeople.trim()) return this.employees;
    const q = this.searchPeople.toLowerCase();
    return this.employees.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.role?.toLowerCase().includes(q)
    );
  }

  get unreadCount(): number {
    return this.chats.filter(c => c.unreadCount > 0).length;
  }

  getLastMsgId(chat: any): number {
    if (!chat.messages?.length) return 0;
    return Math.max(...chat.messages.map((m: any) => Number(m.id) || 0));
  }

  getEmployeeName(userId: string): string {
    return this.employees.find(
      e => String(e.id) === String(userId)
    )?.name || '';
  }

  getInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  // ── Get full file URL from message ────────────────────
  getFileUrl(msg: any): string {
    if (msg.fileUrl) return msg.fileUrl;
    return '';
  }

  // ── Get clean filename from message text ─────────────
  getFileName(text: string): string {
    return (text ?? '')
      .replace('[Image] ', '')
      .replace('[File] ', '')
      .trim();
  }

  // ── Download file ─────────────────────────────────────
  downloadFile(msg: any): void {
    const url      = this.getFileUrl(msg);
    const fileName = this.getFileName(msg.text);
    if (!url) return;
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    a.target   = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Image load error fallback ─────────────────────────
  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.img-error')) {
      const err = document.createElement('div');
      err.className   = 'img-error';
      err.innerHTML   = '<span class="material-icons">broken_image</span><span>Image unavailable</span>';
      parent.appendChild(err);
    }
  }

  isImageMessage(msg: any): boolean {
    return msg.type === 'image' || msg.text?.startsWith('[Image]');
  }

  isFileMessage(msg: any): boolean {
    return msg.type === 'file' || msg.text?.startsWith('[File]');
  }

  isSystemMessage(msg: any): boolean {
    return msg.type === 'system';
  }

  scrollToBottom(): void {
    try {
      if (this.messagesArea) {
        this.messagesArea.nativeElement.scrollTop =
          this.messagesArea.nativeElement.scrollHeight;
      }
    } catch {}
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    try {
      const d         = new Date(iso);
      const today     = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      if (d.toDateString() === today.toDateString()) {
        return d.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit'
        });
      }
      if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric'
      });
    } catch { return ''; }
  }
}