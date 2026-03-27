import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewChecked,
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
  @ViewChild('messageInput') messageInput!: ElementRef;

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

  showEmojiPicker = false;
  searchChat = '';
  activeFilter = 'all';
  newMessage = '';
  isLoadingHistory = false;
  isLoadingChats = false;
  isCreatingChat = false;
  isLoadingPeople = false;
  isUploadingFile = false;
  isUploadingAvatar = false;
  isLoadingParticipants = false;
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
  isCurrentUserAdmin = false;

  // ── Reply-to state ────────────────────────────────────
  replyingTo: any = null;

  // ── Add Member state ──────────────────────────────────
  addMemberSearch = '';
  addMemberResults: any[] = [];
  isSearchingMembers = false;
  isAddingMember: string | null = null; // holds the emp.id being added
  private addMemberDebounce: any = null;

  asString(val: any): string {
    return String(val ?? '');
  }

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private fcm: FcmService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
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
    if (this.addMemberDebounce) clearTimeout(this.addMemberDebounce);
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
  // REPLY-TO HELPERS
  // ══════════════════════════════════════════════════════

  setReply(msg: any): void {
    this.replyingTo = msg;
    this.cdr.detectChanges();
    setTimeout(() => this.messageInput?.nativeElement?.focus(), 0);
  }

  cancelReply(): void {
    this.replyingTo = null;
    this.cdr.detectChanges();
  }

  getReplyPreviewText(msg: any): string {
    if (!msg) return '';
    if (msg.replyTo) {
      return this.truncate(msg.replyTo.text || '', 80);
    }
    if (msg.type === 'image' || msg.text?.startsWith('[Image]')) return '📷 Photo';
    if (msg.type === 'file'  || msg.text?.startsWith('[File]'))  return '📎 File';
    return this.truncate(msg.text || '', 80);
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? text.substring(0, max) + '…' : text;
  }

  // ══════════════════════════════════════════════════════
  // ADD MEMBER
  // ══════════════════════════════════════════════════════

  /** Called on every keystroke in the add-member search input (debounced) */
  onAddMemberSearchInput(): void {
    if (this.addMemberDebounce) clearTimeout(this.addMemberDebounce);
    const q = this.addMemberSearch.trim();
    if (!q) {
      this.addMemberResults = [];
      this.isSearchingMembers = false;
      return;
    }
    this.addMemberDebounce = setTimeout(() => this.searchEmployeesToAdd(q), 350);
  }

  /** Filter the loaded employees list against existing participants */
  private searchEmployeesToAdd(query: string): void {
    if (!this.selectedChat) return;
    this.isSearchingMembers = true;

    // Collect current participant IDs for quick lookup
    const existingIds = new Set(
      (this.selectedChat.participants ?? []).map((p: any) => String(p.userId))
    );

    // Filter from already-loaded employees list (no extra API call needed)
    const lower = query.toLowerCase();
    this.addMemberResults = this.employees.filter(emp =>
      !existingIds.has(String(emp.id)) &&
      (emp.name?.toLowerCase().includes(lower) || emp.role?.toLowerCase().includes(lower))
    );

    this.isSearchingMembers = false;
    this.cdr.detectChanges();
  }

  /** Send add_member WS event */
  addMemberToGroup(emp: any): void {
    if (!this.selectedChat?.isGroup || !this.isCurrentUserAdmin) return;
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.toast.show('Not connected. Retrying...', 'error');
      this.connectWebSocket();
      return;
    }

    this.isAddingMember = emp.id;
    this.cdr.detectChanges();

    this.ws.send(JSON.stringify({
      type: 'add_member',
      chatId: this.selectedChat.chatId,
      targetUserId: Number(emp.id),
    }));
  }

  /** Handle ACK from server after add_member succeeds */
  private handleAddMemberAck(data: any): void {
    const chatId = data.chatId;
    const userId = String(data.userId);

    // Clear loading state — find the emp whose id matches
    const addedEmp = this.addMemberResults.find(e => String(e.id) === userId);
    this.isAddingMember = null;

    if (!addedEmp) {
      // Refresh participants to get the full info
      if (this.selectedChat?.chatId === chatId) {
        this.loadGroupParticipants(chatId);
      }
      this.cdr.detectChanges();
      return;
    }

    // Optimistically add the new participant to the list
    const newParticipant = {
      userId: Number(userId),
      name: addedEmp.name,
      role: 'member',
      profile: null,
      isOnline: false,
    };

    if (this.selectedChat?.chatId === chatId) {
      this.selectedChat = {
        ...this.selectedChat,
        participants: [...(this.selectedChat.participants ?? []), newParticipant],
        members: (this.selectedChat.members ?? 0) + 1,
      };
    }

    // Update chats array
    const chatIdx = this.chats.findIndex(c => c.chatId === chatId);
    if (chatIdx !== -1) {
      this.chats = [
        ...this.chats.slice(0, chatIdx),
        {
          ...this.chats[chatIdx],
          members: (this.chats[chatIdx].members ?? 0) + 1,
          participants: [...(this.chats[chatIdx].participants ?? []), newParticipant],
        },
        ...this.chats.slice(chatIdx + 1),
      ];
    }

    // Remove the added person from search results
    this.addMemberResults = this.addMemberResults.filter(e => String(e.id) !== userId);
    this.addMemberSearch = '';

    this.toast.show(`${addedEmp.name} added to the group`, 'success');
    this.cdr.detectChanges();
  }

  /** Handle broadcast when someone else was added to a group I'm in */
  private handleMemberAdded(data: any): void {
    const chatId = data.chatId;
    const message = data.message ?? 'A new member was added';

    this.appendSystemMessage(chatId, message);

    // Reload participants so the new member appears
    if (this.selectedChat?.chatId === chatId) {
      this.loadGroupParticipants(chatId);
    }

    this.loadChatList();
    this.cdr.detectChanges();
  }

  /** Handle event sent to the user who was just added to a group */
  private handleAddedToGroup(data: any): void {
    const chatId = data.chatId;
    const message = data.message ?? 'You were added to a group';
    this.toast.show(message, 'success');

    // The new group will appear after reloading chat list
    this.loadChatList();

    setTimeout(() => {
      const found = this.chats.find(c => c.chatId === chatId);
      if (found) this.ngZone.run(() => this.selectChat(found));
    }, 800);

    this.cdr.detectChanges();
  }

  // ══════════════════════════════════════════════════════
  // EMOJI
  // ══════════════════════════════════════════════════════

  toggleEmojiPicker(event: MouseEvent): void {
    event.stopPropagation();
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  onEmojiSelected(emoji: string): void {
    this.newMessage += emoji;
    setTimeout(() => {
      const el = document.querySelector('.message-input') as HTMLInputElement;
      if (el) { el.focus(); const len = el.value.length; el.setSelectionRange(len, len); }
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
    const rawFileUrl = Array.isArray(m.fileUrl)
      ? (m.fileUrl[0] ?? null) : (m.fileUrl ?? null);
    const fileUrl = this.buildFileUrl(rawFileUrl);
    const attachments = (m.attachments ?? []).map((a: any) => ({
      url: this.buildFileUrl(a.url),
      name: a.name,
      type: a.type,
    }));
    let text = m.text ?? '';
    if (!text && attachments.length > 0) {
      const first = attachments[0];
      text = first.type === 'image'
        ? `[Image] ${first.name}` : `[File] ${first.name}`;
    }

    let replyTo: any = null;
    if (m.replyTo) {
      replyTo = {
        messageId:  m.replyTo.messageId,
        text:       m.replyTo.text       ?? '',
        senderName: m.replyTo.senderName ?? '',
        type:       m.replyTo.type       ?? 'text',
      };
    }

    return {
      id: m.messageId,
      sender: m.type === 'system' ? 'System' : (m.sender?.name ?? ''),
      senderAvatar: this.buildFileUrl(m.sender?.avatar ?? m.sender?.profile ?? null),
      text,
      rawDate: m.createdAt,
      time: this.formatMsgTime(m.createdAt),
      isOwn,
      status: m.status,
      type: m.type || 'text',
      read,
      fileUrl,
      attachments,
      replyTo,
    };
  }

  private formatMsgTime(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return ''; }
  }

  private getDateLabel(iso: string): string {
    if (!iso) return 'Today';
    try {
      const d = new Date(iso);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return 'Today';
      if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
      });
    } catch { return 'Today'; }
  }

  private makeDivider(label: string): any {
    return {
      id: `divider_${label}_${Math.random()}`,
      type: 'date_divider',
      dateDivider: label,
      isOwn: false,
      isDivider: true,
    };
  }

  private injectDateDividers(messages: any[]): any[] {
    const result: any[] = [];
    let lastLabel = '';
    for (const msg of messages) {
      if (msg.isDivider) { result.push(msg); continue; }
      if (msg.type === 'system') { result.push(msg); continue; }
      const label = this.getDateLabel(msg.rawDate);
      if (label !== lastLabel) {
        result.push(this.makeDivider(label));
        lastLabel = label;
      }
      result.push(msg);
    }
    return result;
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
        if (chat) {
          chat.unreadCount = (chat.unreadCount || 0) + 1;
          this.filterChats();
        }
      }
    });

    this.fcm.onNotificationClick((data: any) => {
      const chatId = data?.chatId;
      if (!chatId) return;
      const chat = this.chats.find(c => c.chatId === chatId);
      if (chat) {
        this.ngZone.run(() => this.selectChat(chat));
      } else {
        this.loadChatList();
        setTimeout(() => {
          const found = this.chats.find(c => c.chatId === chatId);
          if (found) this.ngZone.run(() => this.selectChat(found));
        }, 1000);
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
    return messages.filter(
      m => !m.isOwn && !m.isDivider && m.type !== 'system' && Number(m.id) > lastReadId
    ).length;
  }

  // ══════════════════════════════════════════════════════
  // WEBSOCKET
  // ══════════════════════════════════════════════════════

  connectWebSocket(): void {
    const token = sessionStorage.getItem('token') || '';
    if (!token) { this.toast.show('No auth token found', 'error'); return; }
    if (this.ws) this.ws.close();

    try { this.ws = new WebSocket(`${this.wsUrl}?token=${token}`); }
    catch (e) { console.error('❌ WS create failed:', e); return; }

    this.ws.onopen = () => {
      console.log('✅ WS connected');
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

        if (data.success !== undefined) {
          // Handle add_member_ack (success: true with event field)
          if (data.event === 'add_member_ack') {
            this.handleAddMemberAck(data);
            return;
          }
          return;
        }
        if (data.error !== undefined) { console.error('❌ WS error:', data.error); return; }
        if (data.type === 'pong') return;

        switch (data.event) {
          case 'new_message':       this.handleNewMessageEvent(data); break;
          case 'message_ack':       this.handleMessageAck(data); break;
          case 'message_delivered': this.handleDeliveredEvent(data); break;
          case 'typing_start':      this.handleTypingEvent(data, true); break;
          case 'typing_stop':       this.handleTypingEvent(data, false); break;
          case 'message_seen':      this.handleSeenEvent(data); break;
          case 'seen_ack':          break;
          case 'user_online':
          case 'user_offline':      this.handleOnlineStatus(data); break;
          case 'sync_required':     this.loadChatList(); break;
          case 'join_ack':          break;
          case 'member_left':       this.handleMemberLeft(data); break;
          case 'member_removed':    this.handleMemberRemoved(data); break;
          case 'you_were_removed':  this.handleYouWereRemoved(data); break;
          // ── Add member events ──────────────────────────
          case 'add_member_ack':    this.handleAddMemberAck(data); break;
          case 'member_added':      this.handleMemberAdded(data); break;
          case 'added_to_group':    this.handleAddedToGroup(data); break;
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
  // SOCKET EVENT HANDLERS
  // ══════════════════════════════════════════════════════

  handleMessageAck(data: any): void {
    const chatId = data.chatId;
    const chat = this.chats.find(c => c.chatId === chatId);
    if (!chat) return;

    const replyTo = data.replyTo ?? null;

    const patchMsg = (m: any) => {
      if (!m.isDivider && m.status === 'sending' && m.isOwn)
        return { ...m, id: data.messageId, status: data.status || 'sent', replyTo };
      return m;
    };

    if (chat.messages) chat.messages = chat.messages.map(patchMsg);

    if (this.selectedChat?.chatId === chatId && this.selectedChat.messages) {
      this.selectedChat = {
        ...this.selectedChat,
        messages: this.selectedChat.messages.map(patchMsg),
      };
    }
    this.cdr.detectChanges();
  }

  handleDeliveredEvent(data: any): void {
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (!chat) return;

    if (chat.messages) {
      chat.messages = chat.messages.map((m: any) =>
        !m.isDivider && m.id === data.messageId ? { ...m, status: 'delivered' } : m
      );
    }
    if (this.selectedChat?.chatId === data.chatId && this.selectedChat.messages) {
      this.selectedChat = {
        ...this.selectedChat,
        messages: this.selectedChat.messages.map((m: any) =>
          !m.isDivider && m.id === data.messageId ? { ...m, status: 'delivered' } : m
        ),
      };
    }
    this.cdr.detectChanges();
  }

  handleNewMessageEvent(data: any): void {
    const msg = data.data;
    const chatId = msg?.chatId;
    if (!chatId) return;

    const chatIdx = this.chats.findIndex(c => c.chatId === chatId);
    if (chatIdx === -1) { this.loadChatList(); return; }

    const chat = this.chats[chatIdx];
    const isOwn = String(msg.sender?.userId) === String(this.currentUserId);
    const isChatOpen = this.selectedChat?.chatId === chatId;

    if (isOwn && isChatOpen) {
      const allMsgs = this.selectedChat?.messages ?? [];
      const tempIdx = allMsgs.findIndex(
        (m: any) => !m.isDivider && m.status === 'sending' && m.isOwn
      );
      if (tempIdx !== -1) {
        const mapped = this.mapMessage(msg, true, true);
        const newMsgs = [...allMsgs];
        newMsgs[tempIdx] = { ...mapped };
        this.selectedChat = { ...this.selectedChat, messages: newMsgs };
        this.chats[chatIdx] = { ...chat, messages: newMsgs };
        this.saveLastRead(chatId, msg.messageId);
        this.cdr.detectChanges();
        return;
      }
    }

    const newMsg = this.mapMessage(msg, isOwn, isOwn || isChatOpen);
    const existingMsgs = [...(chat.messages || [])];

    const lastReal = [...existingMsgs].reverse()
      .find((m: any) => !m.isDivider && m.type !== 'system');
    const newLabel = this.getDateLabel(newMsg.rawDate);
    const lastLabel = lastReal ? this.getDateLabel(lastReal.rawDate) : '';

    const toAdd: any[] = [];
    if (newLabel !== lastLabel) toAdd.push(this.makeDivider(newLabel));
    toAdd.push(newMsg);

    const updatedMsgs = [...existingMsgs, ...toAdd];
    const realMsgs = updatedMsgs.filter((m: any) => !m.isDivider);
    const unreadCount = isOwn || isChatOpen ? 0 : this.countUnread(realMsgs, chatId);

    const updatedChat = {
      ...chat,
      messages: updatedMsgs,
      lastMessage: newMsg.text,
      lastMessageTime: newMsg.time,
      unreadCount,
      updatedAt: new Date().toISOString(),
    };

    this.chats = [
      ...this.chats.slice(0, chatIdx),
      updatedChat,
      ...this.chats.slice(chatIdx + 1),
    ];

    if (isChatOpen) {
      this.selectedChat = { ...updatedChat };
      this.shouldScroll = true;
      if (!isOwn) this.api.markMessagesSeen(chatId, [msg.messageId]).subscribe();
    }

    if (isOwn || isChatOpen) this.saveLastRead(chatId, msg.messageId);

    this.sortAndFilterChats();
    this.cdr.detectChanges();
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
      const ex = this.typingTimeouts.get(data.chatId);
      if (ex) clearTimeout(ex);
      const t = setTimeout(() => {
        chat.isTyping = false; chat.typingPerson = null;
        if (this.selectedChat?.chatId === data.chatId) {
          this.isTyping = false; this.typingPerson = '';
        }
        this.typingTimeouts.delete(data.chatId);
      }, 4000);
      this.typingTimeouts.set(data.chatId, t);
    } else {
      const ex = this.typingTimeouts.get(data.chatId);
      if (ex) { clearTimeout(ex); this.typingTimeouts.delete(data.chatId); }
    }
  }

  handleSeenEvent(data: any): void {
    const chatId = data.chatId;
    const messageIds = (data.messageIds ?? []).map((id: any) => Number(id));
    if (!chatId || messageIds.length === 0) return;

    const updateMsgs = (msgs: any[]) =>
      msgs.map((m: any) =>
        !m.isDivider && messageIds.includes(Number(m.id)) ? { ...m, status: 'seen' } : m
      );

    const chatIdx = this.chats.findIndex(c => c.chatId === chatId);
    if (chatIdx !== -1) {
      const chat = this.chats[chatIdx];
      this.chats = [
        ...this.chats.slice(0, chatIdx),
        { ...chat, messages: updateMsgs(chat.messages ?? []) },
        ...this.chats.slice(chatIdx + 1),
      ];
    }

    if (this.selectedChat?.chatId === chatId) {
      this.selectedChat = {
        ...this.selectedChat,
        messages: updateMsgs(this.selectedChat.messages ?? []),
      };
    }
    this.cdr.detectChanges();
  }

  handleOnlineStatus(data: any): void {
    const isOnline = data.event === 'user_online';
    this.chats.forEach(c => {
      if (!c.isGroup && String(c.userId) === String(data.userId)) c.online = isOnline;
    });
  }

  handleMemberLeft(data: any): void {
    this.appendSystemMessage(data.chatId, data.message ?? `${data.userName} left the group`);
    this.loadChatList();
    this.cdr.detectChanges();
  }

  handleMemberRemoved(data: any): void {
    const chatId = data.chatId;
    this.appendSystemMessage(chatId, data.message ?? `${data.removedName} was removed`);

    if (this.selectedChat?.chatId === chatId) {
      this.selectedChat = {
        ...this.selectedChat,
        participants: (this.selectedChat.participants ?? []).filter(
          (p: any) => String(p.userId) !== String(data.removedUserId)
        ),
        members: (this.selectedChat.members ?? 1) - 1,
      };
    }
    this.loadChatList();
    this.cdr.detectChanges();
  }

  handleYouWereRemoved(data: any): void {
    const chatId = data.chatId;
    this.toast.show('You have been removed from the group', 'error');

    if (this.selectedChat?.chatId === chatId) {
      this.selectedChat = null;
      this.closeGroupInfoModal();
    }

    this.chats = this.chats.filter(c => c.chatId !== chatId);
    this.sortAndFilterChats();
    this.cdr.detectChanges();
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
          avatar: this.buildFileUrl(
            c.avatar ?? c.participants?.[0]?.avatar ?? c.participants?.[0]?.profile
          ),
          isGroup: c.type === 'group',
          online: c.participants?.[0]?.isOnline ?? false,
          lastMessage: c.lastMessage?.text ?? '',
          lastMessageTime: c.lastMessage?.createdAt
            ? this.formatTime(c.lastMessage.createdAt) : '',
          unreadCount: c.unreadCount ?? 0,
          members: c.participantsCount ?? c.participants?.length ?? 0,
          lastSender: c.lastMessage?.senderName,
          isPinned: c.isPinned,
          isMuted: c.isMuted,
          updatedAt: c.updatedAt,
          userId: c.type === 'individual' ? String(c.participants?.[0]?.userId) : null,
          roomId: c.type === 'group' ? c.chatId : null,
          participants: (c.participants ?? []).map((p: any) => ({
            userId: p.userId,
            name: p.name,
            role: p.role,
            profile: this.buildFileUrl(p.avatar ?? p.profile ?? null),
            isOnline: p.isOnline ?? false,
          })),
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
      next: (res: any) => {
        this.isLoadingHistory = false;
        if (!res.success) return;

        const rawMsgs = (res.data?.items ?? []).map((m: any) => {
          const isOwn = String(m.sender?.userId) === String(this.currentUserId);
          return this.mapMessage(m, isOwn, true);
        });

        const withDividers = this.injectDateDividers(rawMsgs);

        const updatedChat = {
          ...chat,
          messages: withDividers,
          historyLoaded: true,
          unreadCount: 0,
        };

        const idx = this.chats.findIndex(c => c.chatId === chat.chatId);
        if (idx !== -1) {
          this.chats = [
            ...this.chats.slice(0, idx),
            updatedChat,
            ...this.chats.slice(idx + 1),
          ];
        }

        if (this.selectedChat?.chatId === chat.chatId) {
          this.selectedChat = { ...updatedChat };
        }

        const ids = rawMsgs
          .filter((m: any) => !m.isOwn && m.type !== 'system')
          .map((m: any) => m.id);

        if (ids.length > 0) {
          this.api.markMessagesSeen(chat.chatId, ids).subscribe();
          this.saveLastRead(chat.chatId, Math.max(...ids));
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'message_seen',
              chatId: chat.chatId,
              messageIds: ids,
            }));
          }
        }

        this.shouldScroll = true;
        this.sortAndFilterChats();
        this.cdr.detectChanges();
      },
      error: () => { this.isLoadingHistory = false; }
    });
  }

  // ══════════════════════════════════════════════════════
  // LOAD GROUP PARTICIPANTS
  // ══════════════════════════════════════════════════════

  loadGroupParticipants(chatId: string): void {
    this.isLoadingParticipants = true;

    this.api.getGroupParticipants(chatId).subscribe({
      next: (pRes: any) => {
        this.isLoadingParticipants = false;
        if (!pRes.success) return;

        const raw: any[] = Array.isArray(pRes.data) ? pRes.data : (pRes.data?.items ?? []);

        const participants = raw.map((p: any) => ({
          userId: p.userId ?? p.id,
          name: p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() ?? 'Unknown',
          role: p.role ?? 'member',
          profile: this.buildFileUrl(p.profile ?? p.avatar ?? null),
          isOnline: p.isOnline ?? false,
        }));

        const me = participants.find(
          (p: any) => String(p.userId) === String(this.currentUserId)
        );
        this.isCurrentUserAdmin = me?.role === 'admin';

        if (this.selectedChat?.chatId === chatId) {
          this.selectedChat = {
            ...this.selectedChat,
            participants,
            members: participants.length,
          };
        }

        const chatIdx = this.chats.findIndex(c => c.chatId === chatId);
        if (chatIdx !== -1) {
          this.chats = [
            ...this.chats.slice(0, chatIdx),
            { ...this.chats[chatIdx], participants, members: participants.length },
            ...this.chats.slice(chatIdx + 1),
          ];
        }

        // Refresh add-member search results if modal is open
        if (this.showGroupInfoModal && this.addMemberSearch.trim()) {
          this.searchEmployeesToAdd(this.addMemberSearch.trim());
        }

        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isLoadingParticipants = false;
        console.error('❌ Participants API error:', err);
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // SELECT CHAT
  // ══════════════════════════════════════════════════════

  selectChat(chat: any): void {
    this.selectedChat = { ...chat, unreadCount: 0 };
    this.isTyping = chat.isTyping ?? false;
    this.typingPerson = chat.typingPerson ?? '';
    this.isCurrentUserAdmin = false;
    this.replyingTo = null;

    const idx = this.chats.findIndex(c => c.chatId === chat.chatId);
    if (idx !== -1) {
      this.chats = [
        ...this.chats.slice(0, idx),
        { ...this.chats[idx], unreadCount: 0 },
        ...this.chats.slice(idx + 1),
      ];
    }

    if (chat.isGroup) {
      this.loadGroupParticipants(chat.chatId);
    }

    this.loadChatHistory(this.selectedChat);
    if (chat.isGroup && chat.chatId) this.joinRoom(chat.chatId);
    this.shouldScroll = true;
    this.cdr.detectChanges();
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
    const now = new Date().toISOString();

    const currentReply = this.replyingTo;

    const tempMsg: any = {
      id: tempId,
      sender: this.currentUserName,
      text: messageText,
      rawDate: now,
      time: this.formatMsgTime(now),
      isOwn: true,
      status: 'sending',
      type: 'text',
      read: true,
      fileUrl: null,
      attachments: [],
      tempId,
      isDivider: false,
      replyTo: currentReply ? {
        messageId:  currentReply.id,
        text:       this.getReplyPreviewText(currentReply),
        senderName: currentReply.sender,
        type:       currentReply.type,
      } : null,
    };

    const existingMsgs = this.selectedChat.messages || [];
    const lastReal = [...existingMsgs].reverse()
      .find((m: any) => !m.isDivider && m.type !== 'system');
    const newLabel = this.getDateLabel(now);
    const lastLabel = lastReal ? this.getDateLabel(lastReal.rawDate) : '';

    const toAdd: any[] = [];
    if (newLabel !== lastLabel) toAdd.push(this.makeDivider(newLabel));
    toAdd.push(tempMsg);

    const newMsgs = [...existingMsgs, ...toAdd];
    this.selectedChat = {
      ...this.selectedChat,
      messages: newMsgs,
      lastMessage: messageText,
      lastMessageTime: this.formatMsgTime(now),
    };

    const chatIdx = this.chats.findIndex(c => c.chatId === this.selectedChat.chatId);
    if (chatIdx !== -1) {
      this.chats = [
        ...this.chats.slice(0, chatIdx),
        { ...this.chats[chatIdx], messages: newMsgs },
        ...this.chats.slice(chatIdx + 1),
      ];
    }

    this.newMessage = '';
    this.replyingTo = null;
    this.shouldScroll = true;
    this.cdr.detectChanges();

    const wsPayload: any = {
      type: 'new_message',
      chatId: this.selectedChat.chatId,
      text: messageText,
      msgType: 'text',
      tempId,
    };
    if (currentReply?.id) {
      wsPayload.replyToId = currentReply.id;
    }

    this.ws.send(JSON.stringify(wsPayload));
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
      if (f.size > MAX_BYTES) { this.toast.show(`${f.name} too large (max 10MB)`, 'error'); return false; }
      return true;
    });
    if (!validFiles.length) return;
    this.isUploadingFile = true;
    try {
      const base64List = await Promise.all(validFiles.map(f => this.fileToBase64(f)));
      const payload: any = { chatId: this.selectedChat.chatId };
      if (validFiles.length === 1) {
        payload.file = base64List[0];
        payload.fileName = validFiles[0].name;
      } else {
        payload.files = base64List;
        payload.fileNames = validFiles.map(f => f.name);
      }
      this.api.uploadChatFile(payload).subscribe({
        next: (res: any) => {
          this.isUploadingFile = false;
          if (!res.success) { this.toast.show(res.message || 'Upload failed', 'error'); return; }
          const uploaded = Array.isArray(res.data) ? res.data : [res.data];
          this.handleUploadedFiles(uploaded, validFiles);
        },
        error: (err: any) => {
          this.isUploadingFile = false;
          this.toast.show(err?.error?.message ?? `Upload failed`, 'error');
        }
      });
    } catch {
      this.isUploadingFile = false;
      this.toast.show('File processing failed', 'error');
    }
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
      this.toast.show('Not connected.', 'error'); return;
    }

    const currentReply = this.replyingTo;
    const wsPayload: any = {
      type: 'new_message',
      chatId: this.selectedChat.chatId,
      msgType,
      text: '',
      attachments,
    };
    if (currentReply?.id) {
      wsPayload.replyToId = currentReply.id;
    }
    this.ws.send(JSON.stringify(wsPayload));
    this.replyingTo = null;

    const now = new Date().toISOString();
    const existingMsgs = this.selectedChat.messages || [];
    const newMsgs = [...existingMsgs];
    attachments.forEach((att: any, i: number) => {
      const fullUrl = this.buildFileUrl(att.url);
      newMsgs.push({
        id: Date.now() + i,
        sender: this.currentUserName,
        text: att.type === 'image' ? `[Image] ${att.name}` : `[File] ${att.name}`,
        rawDate: now,
        time: this.formatMsgTime(now),
        isOwn: true,
        status: 'sending',
        type: att.type,
        read: true,
        fileUrl: fullUrl,
        attachments: [{ url: fullUrl, name: att.name, type: att.type }],
        isDivider: false,
        replyTo: currentReply ? {
          messageId:  currentReply.id,
          text:       this.getReplyPreviewText(currentReply),
          senderName: currentReply.sender,
          type:       currentReply.type,
        } : null,
      });
    });
    this.selectedChat = { ...this.selectedChat, messages: newMsgs };
    this.shouldScroll = true;
    this.cdr.detectChanges();
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
    if (!file.type.startsWith('image/')) {
      this.toast.show('Please select an image file', 'error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.show('Image too large. Max 5MB', 'error'); return;
    }
    this.isUploadingAvatar = true;
    try {
      const base64 = await this.fileToBase64(file);
      this.api.uploadGroupAvatar(base64, this.selectedChat.chatId).subscribe({
        next: (res: any) => {
          this.isUploadingAvatar = false;
          if (res.success && res.data?.url) {
            const fullUrl = this.buildFileUrl(res.data.url);
            this.selectedChat = { ...this.selectedChat, avatar: fullUrl };
            const chatIdx = this.chats.findIndex(c => c.chatId === this.selectedChat.chatId);
            if (chatIdx !== -1) {
              this.chats = [
                ...this.chats.slice(0, chatIdx),
                { ...this.chats[chatIdx], avatar: fullUrl },
                ...this.chats.slice(chatIdx + 1),
              ];
            }
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
    this.addMemberSearch = '';
    this.addMemberResults = [];
    this.isAddingMember = null;
    this.showGroupInfoModal = true;
    this.loadGroupParticipants(this.selectedChat.chatId);
  }

  closeGroupInfoModal(): void {
    this.showGroupInfoModal = false;
    this.editGroupName = '';
    this.addMemberSearch = '';
    this.addMemberResults = [];
    this.isAddingMember = null;
  }

  saveGroupInfo(): void {
    if (!this.editGroupName.trim() || !this.selectedChat) return;
    this.api.updateGroupInfo(this.selectedChat.chatId, this.editGroupName.trim()).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.selectedChat = { ...this.selectedChat, name: this.editGroupName.trim() };
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

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'leave_group',
        chatId: this.selectedChat.chatId,
      }));
    }

    const chatId = this.selectedChat.chatId;
    this.toast.show('You left the group', 'success');
    this.selectedChat = null;
    this.closeGroupInfoModal();
    this.chats = this.chats.filter(c => c.chatId !== chatId);
    this.sortAndFilterChats();
    this.cdr.detectChanges();
  }

  removeMember(participant: any): void {
    if (!this.selectedChat?.isGroup || !this.isCurrentUserAdmin) return;
    if (String(participant.userId) === String(this.currentUserId)) return;

    if (!confirm(`Remove ${participant.name} from the group?`)) return;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'remove_member',
        chatId: this.selectedChat.chatId,
        targetUserId: participant.userId,
      }));
    }

    this.selectedChat = {
      ...this.selectedChat,
      participants: this.selectedChat.participants.filter(
        (p: any) => String(p.userId) !== String(participant.userId)
      ),
      members: (this.selectedChat.members ?? 1) - 1,
    };
    this.cdr.detectChanges();
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
  // APPEND SYSTEM MESSAGE
  // ══════════════════════════════════════════════════════

  private appendSystemMessage(chatId: string, text: string): void {
    const now = new Date().toISOString();
    const sysMsg = {
      id: `sys_${Date.now()}`,
      type: 'system',
      text,
      rawDate: now,
      time: this.formatMsgTime(now),
      isOwn: false,
      isDivider: false,
    };

    const chatIdx = this.chats.findIndex(c => c.chatId === chatId);
    if (chatIdx !== -1) {
      const chat = this.chats[chatIdx];
      this.chats = [
        ...this.chats.slice(0, chatIdx),
        { ...chat, messages: [...(chat.messages ?? []), sysMsg] },
        ...this.chats.slice(chatIdx + 1),
      ];
    }

    if (this.selectedChat?.chatId === chatId) {
      this.selectedChat = {
        ...this.selectedChat,
        messages: [...(this.selectedChat.messages ?? []), sysMsg],
      };
      this.shouldScroll = true;
    }
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
    if (this.newChatType === 'direct') {
      this.selectedPeople = [p];
    } else {
      this.isSelected(p)
        ? (this.selectedPeople = this.selectedPeople.filter(s => s.id !== p.id))
        : this.selectedPeople.push(p);
    }
  }

  createChat(): void {
    if (!this.selectedPeople.length) return;
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
    if (msg.fileUrl) { this.viewerImageUrl = msg.fileUrl; this.showImageViewer = true; }
  }
  closeImageViewer(): void {
    this.showImageViewer = false;
    this.viewerImageUrl = '';
  }

  // ══════════════════════════════════════════════════════
  // FILTER / SORT
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
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q)
      );
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
    return this.employees.filter(p =>
      p.name?.toLowerCase().includes(q) || p.role?.toLowerCase().includes(q)
    );
  }

  get unreadCount(): number {
    return this.chats.filter(c => c.unreadCount > 0).length;
  }

  trackByMsgId(index: number, msg: any): any {
    return msg.isDivider ? msg.id : (msg.id ?? index);
  }

  getInitial(name: string): string { return (name || '?').charAt(0).toUpperCase(); }
  getFileUrl(msg: any): string { return msg.fileUrl || ''; }

  getFileName(text: string): string {
    return (text ?? '')
      .replace('[Image] ', '')
      .replace('[File] ', '')
      .trim();
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
      err.innerHTML =
        '<span class="material-icons">broken_image</span><span>Image unavailable</span>';
      parent.appendChild(err);
    }
  }

  isImageMessage(msg: any): boolean {
    return msg.type === 'image' || msg.text?.startsWith('[Image]');
  }
  isFileMessage(msg: any): boolean {
    return msg.type === 'file' || msg.text?.startsWith('[File]');
  }
  isSystemMessage(msg: any): boolean { return msg.type === 'system'; }

  scrollToBottom(): void {
    try {
      if (this.messagesArea)
        this.messagesArea.nativeElement.scrollTop =
          this.messagesArea.nativeElement.scrollHeight;
    } catch { }
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString())
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
  }
}