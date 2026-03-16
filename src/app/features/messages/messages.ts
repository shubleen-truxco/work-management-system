import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewChecked
} from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { Sidebar }       from '../../shared/sidebar/sidebar';
import { ApiService }    from '../../core/services/api.service';
import { ToastService }  from '../../shared/toast/toast.service';

@Component({
  selector:    'app-messages',
  standalone:  true,
  imports:     [CommonModule, FormsModule, Sidebar],
  templateUrl: './messages.html',
  styleUrls:   ['./messages.css'],
})
export class Messages implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('messagesArea')     messagesArea!:    ElementRef;
  @ViewChild('fileInput')        fileInput!:       ElementRef;
  @ViewChild('avatarInput')      avatarInput!:     ElementRef;

  // ── Current user ──────────────────────────────────────
  currentUserId   = sessionStorage.getItem('id')    || '';
  currentUserName = sessionStorage.getItem('user')  || 'Me';
  private token   = sessionStorage.getItem('token') || '';

  // ── WebSocket ─────────────────────────────────────────
  private ws!: WebSocket;
  private wsUrl         = 'ws://localhost:8080/wms/ws/chat';
  private shouldScroll  = false;
  private typingTimer:  any;
  private pingInterval: any;

  // ── E2E ───────────────────────────────────────────────
  private chatAesKeys:      Map<string, CryptoKey> = new Map();
  private readonly E2E_PREFIX = 'E2E:';

  // ── Last read ─────────────────────────────────────────
  private readonly READ_KEY = 'chat_last_read_';

  // ── Typing ────────────────────────────────────────────
  isTyping              = false;
  typingPerson          = '';
  private typingTimeouts: Map<string, any> = new Map();

  // ── UI State ──────────────────────────────────────────
  searchChat        = '';
  activeFilter      = 'all';
  newMessage        = '';
  isLoadingHistory  = false;
  isLoadingChats    = false;
  isCreatingChat    = false;
  isLoadingPeople   = false;
  isUploadingFile   = false;
  isUploadingAvatar = false;
  selectedChat: any = null;
  showNewChatModal  = false;
  showGroupInfoModal = false;
  newChatType       = 'direct';
  newGroupName      = '';
  editGroupName     = '';
  searchPeople      = '';
  selectedPeople:   any[] = [];
  employees:        any[] = [];
  chats:            any[] = [];
  filteredChats:    any[] = [];

  constructor(
    private api:   ApiService,
    private toast: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.loadChatList();
    this.connectWebSocket();
  }

  ngOnDestroy(): void {
    if (this.ws)           this.ws.close();
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.typingTimer)  clearTimeout(this.typingTimer);
    this.typingTimeouts.forEach(t => clearTimeout(t));
    this.typingTimeouts.clear();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  // ══════════════════════════════════════════════════════
  // E2E ENCRYPTION
  // ══════════════════════════════════════════════════════

  private async getOrCreateAesKey(chatId: string): Promise<CryptoKey> {
    if (this.chatAesKeys.has(chatId)) {
      return this.chatAesKeys.get(chatId)!;
    }
    const stored = localStorage.getItem(`aes_${this.currentUserId}_${chatId}`);
    if (stored) {
      try {
        const aesKey = await crypto.subtle.importKey(
          'raw', this.base64ToBuffer(stored),
          { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
        );
        this.chatAesKeys.set(chatId, aesKey);
        return aesKey;
      } catch {}
    }
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
    const raw = await crypto.subtle.exportKey('raw', aesKey);
    localStorage.setItem(
      `aes_${this.currentUserId}_${chatId}`,
      this.bufferToBase64(raw)
    );
    this.chatAesKeys.set(chatId, aesKey);
    return aesKey;
  }

  async encryptMessage(text: string, chatId: string): Promise<string> {
    try {
      const aesKey  = await this.getOrCreateAesKey(chatId);
      const iv      = crypto.getRandomValues(new Uint8Array(12));
      const cipher  = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(text)
      );
      const combined = new Uint8Array(12 + cipher.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(cipher), 12);
      return this.E2E_PREFIX + this.bufferToBase64(combined.buffer);
    } catch { return text; }
  }

  async decryptMessage(text: string, chatId: string): Promise<string> {
    if (!text?.startsWith(this.E2E_PREFIX)) return text ?? '';
    try {
      const aesKey   = await this.getOrCreateAesKey(chatId);
      const combined = this.base64ToBuffer(text.replace(this.E2E_PREFIX, ''));
      const plain    = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(combined.slice(0, 12)) },
        aesKey, combined.slice(12)
      );
      return new TextDecoder().decode(plain);
    } catch { return '[Encrypted message]'; }
  }

  // ── FIX: decrypt preview for chat list ───────────────
  async decryptPreview(text: string, chatId: string): Promise<string> {
    if (!text) return '';
    if (!text.startsWith(this.E2E_PREFIX)) return text;
    const decrypted = await this.decryptMessage(text, chatId);
    return decrypted === '[Encrypted message]' ? '🔒 Encrypted' : decrypted;
  }

  private bufferToBase64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  private base64ToBuffer(b64: string): ArrayBuffer {
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return buf;
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
    return messages.filter(m => !m.isOwn && Number(m.id) > lastReadId).length;
  }

  getChatKey(chat: any): string { return chat.chatId; }

  // ══════════════════════════════════════════════════════
  // WEBSOCKET
  // ══════════════════════════════════════════════════════

  connectWebSocket(): void {
    if (!this.token) { this.toast.show('No auth token found', 'error'); return; }

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

    this.ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.success !== undefined || data.error !== undefined ||
          data.type === 'pong') return;

      switch (data.event) {
        case 'new_message':    await this.handleNewMessageEvent(data); break;
        case 'typing_start':   this.handleTypingEvent(data, true);     break;
        case 'typing_stop':    this.handleTypingEvent(data, false);    break;
        case 'message_seen':   this.handleSeenEvent(data);             break;
        case 'user_online':
        case 'user_offline':   this.handleOnlineStatus(data);          break;
        case 'sync_required':  this.loadChatList();                    break;
        case 'join_ack':       console.log('Joined:', data.chatId);    break;
      }
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'JOIN', chatId }));
    }
  }

  // ══════════════════════════════════════════════════════
  // SOCKET EVENTS
  // ══════════════════════════════════════════════════════

  async handleNewMessageEvent(data: any): Promise<void> {
    const msg    = data.data;
    const chatId = msg?.chatId;
    if (!chatId) return;

    let chat = this.chats.find(c => c.chatId === chatId);
    if (!chat) { this.loadChatList(); return; }

    const isOwn      = String(msg.sender?.userId) === String(this.currentUserId);
    const isChatOpen = this.selectedChat?.chatId === chatId;
    const decrypted  = await this.decryptMessage(msg.text, chatId);

    const newMsg = {
      id:     msg.messageId,
      sender: msg.sender?.name,
      text:   decrypted,
      time:   this.formatTime(msg.createdAt),
      isOwn,
      status: msg.status,
      type:   msg.type || 'text',
      read:   isOwn || isChatOpen,
    };

    chat.messages = chat.messages || [];
    chat.messages.push(newMsg);

    // ── FIX: store decrypted preview ──────────────────
    chat.lastMessage     = decrypted;
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

    const isChatOpen     = this.selectedChat?.chatId === data.chatId;
    chat.isTyping        = isTyping;
    chat.typingPerson    = isTyping ? data.senderName : null;

    if (isChatOpen) {
      this.isTyping     = isTyping;
      this.typingPerson = isTyping ? data.senderName : '';
      if (isTyping) this.shouldScroll = true;
    }

    if (isTyping) {
      const existing = this.typingTimeouts.get(data.chatId);
      if (existing) clearTimeout(existing);
      const timeout = setTimeout(() => {
        chat.isTyping = false; chat.typingPerson = null;
        if (this.selectedChat?.chatId === data.chatId) {
          this.isTyping = false; this.typingPerson = '';
        }
        this.typingTimeouts.delete(data.chatId);
      }, 4000);
      this.typingTimeouts.set(data.chatId, timeout);
    } else {
      const existing = this.typingTimeouts.get(data.chatId);
      if (existing) { clearTimeout(existing); this.typingTimeouts.delete(data.chatId); }
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
      next: async (res: any) => {
        this.isLoadingChats = false;
        if (!res.success) return;

        const items = res.data?.items ?? [];

        // Build chats and decrypt last message previews
        const mapped = await Promise.all(items.map(async (c: any) => {
          // ── FIX: decrypt last message preview ──────────
          let lastMsgText = c.lastMessage?.text ?? '';
          if (lastMsgText.startsWith(this.E2E_PREFIX)) {
            lastMsgText = await this.decryptPreview(lastMsgText, c.chatId);
          }

          return {
            chatId:          c.chatId,
            id:              c.chatId,
            name:            c.name,
            avatar:          c.avatar,
            isGroup:         c.type === 'group',
            online:          c.participants?.[0]?.isOnline ?? false,
            lastMessage:     lastMsgText,
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
          };
        }));

        this.chats = mapped;

        // Build employees from individual chats
        this.employees = items
          .filter((c: any) => c.type === 'individual' && c.participants?.length)
          .map((c: any) => ({
            id:   String(c.participants[0].userId),
            name: c.participants[0].name,
            role: c.participants[0].role || '',
          }));

        this.sortAndFilterChats();

        this.chats
          .filter(c => c.isGroup && c.chatId && this.ws?.readyState === WebSocket.OPEN)
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
      next: async (res: any) => {
        this.isLoadingHistory = false;
        if (!res.success) return;

        const messages = res.data?.items ?? [];

        chat.messages = await Promise.all(
          messages.map(async (m: any) => {
            const isOwn     = String(m.sender?.userId) === String(this.currentUserId);
            const isSystem  = m.type === 'system';

            // ── FIX: only decrypt non-system messages ──
            let text = m.text ?? '';
            if (!isSystem && text.startsWith(this.E2E_PREFIX)) {
              text = await this.decryptMessage(text, chat.chatId);
            }

            return {
              id:     m.messageId,
              sender: isSystem ? 'System' : m.sender?.name,
              text,
              time:   this.formatTime(m.createdAt),
              isOwn,
              status: m.status,
              type:   m.type || 'text',
              read:   true,
            };
          })
        );

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

  async sendMessage(): Promise<void> {
    if (!this.newMessage.trim() || !this.selectedChat) return;
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.toast.show('Not connected. Retrying...', 'error');
      this.connectWebSocket();
      return;
    }

    const plainText = this.newMessage.trim();
    const encrypted = await this.encryptMessage(plainText, this.selectedChat.chatId);

    this.ws.send(JSON.stringify({
      type:    'new_message',
      chatId:  this.selectedChat.chatId,
      text:    encrypted,
      msgType: 'text',
    }));

    this.newMessage = '';
    this.shouldScroll = true;

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

    // Reset input
    input.value = '';

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.toast.show('File too large. Max 10MB allowed.', 'error');
      return;
    }

    this.isUploadingFile = true;

    // try {
    //   // Upload file to server
    //   const formData = new FormData();
    //   formData.append('file',   file);
    //   formData.append('chatId', this.selectedChat.chatId);

    //   this.api.uploadChatFile(formData).subscribe({
    //     next: async (res: any) => {
    //       this.isUploadingFile = false;
    //       if (!res.success) {
    //         this.toast.show('File upload failed', 'error');
    //         return;
    //       }

    //       const fileUrl  = res.data?.url  ?? '';
    //       const fileType = file.type.startsWith('image/') ? 'image' : 'file';

    //       // Send file message via WS
    //       const msgText  = fileType === 'image'
    //         ? `[Image] ${file.name}`
    //         : `[File] ${file.name}`;

    //       const encrypted = await this.encryptMessage(
    //         msgText, this.selectedChat.chatId
    //       );

    //       if (this.ws?.readyState === WebSocket.OPEN) {
    //         this.ws.send(JSON.stringify({
    //           type:    'new_message',
    //           chatId:  this.selectedChat.chatId,
    //           text:    encrypted,
    //           msgType: fileType,
    //           fileUrl,
    //           fileName: file.name,
    //         }));
    //       }
    //     },
    //     error: () => {
    //       this.isUploadingFile = false;
    //       this.toast.show('File upload failed', 'error');
    //     }
    //   });
    // } catch {
    //   this.isUploadingFile = false;
    //   this.toast.show('Something went wrong', 'error');
    // }
  }

  // ══════════════════════════════════════════════════════
  // GROUP AVATAR UPLOAD
  // ══════════════════════════════════════════════════════

  triggerAvatarUpload(): void {
    this.avatarInput?.nativeElement.click();
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file || !this.selectedChat?.isGroup) return;

    input.value = '';

    if (!file.type.startsWith('image/')) {
      this.toast.show('Please select an image file', 'error');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      this.toast.show('Image too large. Max 5MB', 'error');
      return;
    }

    this.isUploadingAvatar = true;

    const formData = new FormData();
    formData.append('file',   file);
    formData.append('chatId', this.selectedChat.chatId);

    // this.api.uploadGroupAvatar(formData).subscribe({
    //   next: (res: any) => {
    //     this.isUploadingAvatar = false;
    //     if (res.success && res.data?.url) {
    //       // Update group avatar
    //       this.api.updateGroupInfo(
    //         this.selectedChat.chatId, undefined, res.data.url
    //       ).subscribe({
    //         next: (updateRes: any) => {
    //           if (updateRes.success) {
    //             this.selectedChat.avatar = res.data.url;
    //             this.toast.show('Group avatar updated!', 'success');
    //             this.loadChatList();
    //           }
    //         }
    //       });
    //     }
    //   },
    //   error: () => {
    //     this.isUploadingAvatar = false;
    //     this.toast.show('Avatar upload failed', 'error');
    //   }
    // });
  }

  // ══════════════════════════════════════════════════════
  // GROUP INFO MODAL
  // ══════════════════════════════════════════════════════

  openGroupInfoModal(): void {
    if (!this.selectedChat?.isGroup) return;
    this.editGroupName     = this.selectedChat.name;
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
      error: () => {
        this.isCreatingChat = false;
        this.toast.show('Something went wrong', 'error');
      }
    });
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
    return this.employees.find(e => String(e.id) === String(userId))?.name || '';
  }

  getInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  isImageMessage(msg: any): boolean {
    return msg.type === 'image' ||
           msg.text?.startsWith('[Image]');
  }

  isFileMessage(msg: any): boolean {
    return msg.type === 'file' ||
           msg.text?.startsWith('[File]');
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
      const d     = new Date(iso);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) {
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
  }
}