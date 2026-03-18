import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, AfterViewChecked,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../shared/toast/toast.service';
import { FcmService } from '../../core/services/fcm.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar],
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
  showEmojiPicker = false;
  emojiSearch = '';
  activeEmojiCategory = 0;
  emojiSearchResults: { emoji: string; name: string }[] = [];


  emojiCategories = [
  { icon: '😀', label: 'Smileys', emojis: [
    {emoji:'😀',name:'grinning'},{emoji:'😁',name:'beaming'},{emoji:'😂',name:'joy'},
    {emoji:'🤣',name:'rofl'},{emoji:'😃',name:'smile'},{emoji:'😄',name:'grin'},
    {emoji:'😅',name:'sweat smile'},{emoji:'😆',name:'laughing'},{emoji:'😉',name:'wink'},
    {emoji:'😊',name:'blush'},{emoji:'😋',name:'yum'},{emoji:'😎',name:'sunglasses'},
    {emoji:'😍',name:'heart eyes'},{emoji:'🥰',name:'smiling hearts'},{emoji:'😘',name:'kissing heart'},
    {emoji:'🙂',name:'slightly smiling'},{emoji:'🤗',name:'hugging'},{emoji:'🤩',name:'star struck'},
    {emoji:'🤔',name:'thinking'},{emoji:'😐',name:'neutral'},{emoji:'😑',name:'expressionless'},
    {emoji:'🙄',name:'eye roll'},{emoji:'😏',name:'smirk'},{emoji:'😒',name:'unamused'},
    {emoji:'😞',name:'disappointed'},{emoji:'😔',name:'pensive'},{emoji:'😟',name:'worried'},
    {emoji:'😕',name:'confused'},{emoji:'🥺',name:'pleading'},{emoji:'😢',name:'crying'},
    {emoji:'😭',name:'loudly crying'},{emoji:'😤',name:'huffing'},{emoji:'😠',name:'angry'},
    {emoji:'😡',name:'rage'},{emoji:'🤬',name:'symbols'},{emoji:'😈',name:'smiling devil'},
    {emoji:'👿',name:'angry devil'},{emoji:'💀',name:'skull'},{emoji:'🤡',name:'clown'},
    {emoji:'👻',name:'ghost'},{emoji:'🤖',name:'robot'},{emoji:'🥱',name:'yawning'},
    {emoji:'🤤',name:'drooling'},{emoji:'🤢',name:'nauseated'},{emoji:'🥵',name:'hot face'},
    {emoji:'🥶',name:'cold face'},{emoji:'😇',name:'angel'},{emoji:'🤠',name:'cowboy'},
    {emoji:'🥸',name:'disguised'},{emoji:'🤓',name:'nerd'},{emoji:'🧐',name:'monocle'},
  ]},
  { icon: '👋', label: 'Gestures', emojis: [
    {emoji:'👋',name:'wave'},{emoji:'🤚',name:'raised back hand'},{emoji:'✋',name:'raised hand'},
    {emoji:'🖖',name:'vulcan'},{emoji:'👌',name:'ok hand'},{emoji:'🤌',name:'pinched fingers'},
    {emoji:'✌️',name:'victory'},{emoji:'🤞',name:'crossed fingers'},{emoji:'🤙',name:'call me'},
    {emoji:'👈',name:'point left'},{emoji:'👉',name:'point right'},{emoji:'👆',name:'point up'},
    {emoji:'👇',name:'point down'},{emoji:'👍',name:'thumbs up'},{emoji:'👎',name:'thumbs down'},
    {emoji:'✊',name:'raised fist'},{emoji:'👊',name:'oncoming fist'},{emoji:'👏',name:'clapping'},
    {emoji:'🙌',name:'raising hands'},{emoji:'👐',name:'open hands'},{emoji:'🤲',name:'palms up'},
    {emoji:'🙏',name:'folded hands'},{emoji:'✍️',name:'writing'},{emoji:'💪',name:'flexed bicep'},
    {emoji:'🫶',name:'heart hands'},{emoji:'🤝',name:'handshake'},{emoji:'🫂',name:'people hugging'},
  ]},
  { icon: '❤️', label: 'Hearts', emojis: [
    {emoji:'❤️',name:'red heart'},{emoji:'🧡',name:'orange heart'},{emoji:'💛',name:'yellow heart'},
    {emoji:'💚',name:'green heart'},{emoji:'💙',name:'blue heart'},{emoji:'💜',name:'purple heart'},
    {emoji:'🖤',name:'black heart'},{emoji:'🤍',name:'white heart'},{emoji:'🤎',name:'brown heart'},
    {emoji:'💔',name:'broken heart'},{emoji:'❣️',name:'heart exclamation'},{emoji:'💕',name:'two hearts'},
    {emoji:'💞',name:'revolving hearts'},{emoji:'💓',name:'beating heart'},{emoji:'💗',name:'growing heart'},
    {emoji:'💖',name:'sparkling heart'},{emoji:'💘',name:'heart arrow'},{emoji:'💝',name:'heart ribbon'},
    {emoji:'💌',name:'love letter'},{emoji:'💋',name:'kiss mark'},{emoji:'😻',name:'cat heart eyes'},
  ]},
  { icon: '🎉', label: 'Celebration', emojis: [
    {emoji:'🎉',name:'party popper'},{emoji:'🎊',name:'confetti ball'},{emoji:'🎈',name:'balloon'},
    {emoji:'🎁',name:'gift'},{emoji:'🏆',name:'trophy'},{emoji:'🥇',name:'gold medal'},
    {emoji:'🥈',name:'silver medal'},{emoji:'🥉',name:'bronze medal'},{emoji:'🎯',name:'bullseye'},
    {emoji:'🎮',name:'video game'},{emoji:'🎲',name:'dice'},{emoji:'🎭',name:'performing arts'},
    {emoji:'🎨',name:'artist palette'},{emoji:'🎤',name:'microphone'},{emoji:'🎵',name:'music note'},
    {emoji:'🎶',name:'notes'},{emoji:'🥳',name:'partying face'},{emoji:'🍾',name:'champagne'},
    {emoji:'🍻',name:'beers'},{emoji:'🥂',name:'clinking glasses'},{emoji:'🎂',name:'birthday cake'},
  ]},
  { icon: '🔥', label: 'Symbols', emojis: [
    {emoji:'🔥',name:'fire'},{emoji:'✨',name:'sparkles'},{emoji:'⭐',name:'star'},
    {emoji:'🌟',name:'glowing star'},{emoji:'💫',name:'dizzy'},{emoji:'⚡',name:'lightning'},
    {emoji:'💥',name:'collision'},{emoji:'🌈',name:'rainbow'},{emoji:'☀️',name:'sun'},
    {emoji:'🌙',name:'crescent moon'},{emoji:'💯',name:'hundred'},{emoji:'✅',name:'check mark'},
    {emoji:'❌',name:'cross mark'},{emoji:'💢',name:'anger symbol'},{emoji:'💬',name:'speech bubble'},
    {emoji:'💤',name:'zzz'},{emoji:'🔔',name:'bell'},{emoji:'📢',name:'loudspeaker'},
    {emoji:'🚀',name:'rocket'},{emoji:'💎',name:'gem'},{emoji:'⚽',name:'soccer'},
    {emoji:'🏀',name:'basketball'},{emoji:'🆗',name:'ok'},{emoji:'🆒',name:'cool'},
  ]},
  { icon: '🐶', label: 'Animals', emojis: [
    {emoji:'🐶',name:'dog'},{emoji:'🐱',name:'cat'},{emoji:'🐭',name:'mouse'},
    {emoji:'🐰',name:'rabbit'},{emoji:'🦊',name:'fox'},{emoji:'🐻',name:'bear'},
    {emoji:'🐼',name:'panda'},{emoji:'🐨',name:'koala'},{emoji:'🐯',name:'tiger'},
    {emoji:'🦁',name:'lion'},{emoji:'🐮',name:'cow'},{emoji:'🐷',name:'pig'},
    {emoji:'🐸',name:'frog'},{emoji:'🐵',name:'monkey'},{emoji:'🦄',name:'unicorn'},
    {emoji:'🦋',name:'butterfly'},{emoji:'🐢',name:'turtle'},{emoji:'🦖',name:'trex'},
    {emoji:'🦕',name:'sauropod'},{emoji:'🦈',name:'shark'},{emoji:'🐬',name:'dolphin'},
  ]},
  { icon: '🍎', label: 'Food', emojis: [
    {emoji:'🍎',name:'apple'},{emoji:'🍊',name:'orange'},{emoji:'🍋',name:'lemon'},
    {emoji:'🍇',name:'grapes'},{emoji:'🍓',name:'strawberry'},{emoji:'🍒',name:'cherries'},
    {emoji:'🥑',name:'avocado'},{emoji:'🍕',name:'pizza'},{emoji:'🍔',name:'burger'},
    {emoji:'🌮',name:'taco'},{emoji:'🍣',name:'sushi'},{emoji:'🍜',name:'noodles'},
    {emoji:'🍩',name:'doughnut'},{emoji:'🍪',name:'cookie'},{emoji:'🎂',name:'cake'},
    {emoji:'🍫',name:'chocolate'},{emoji:'☕',name:'coffee'},{emoji:'🧋',name:'bubble tea'},
    {emoji:'🍺',name:'beer'},{emoji:'🍷',name:'wine'},{emoji:'🧃',name:'juice box'},
  ]},
];
  constructor(
    private api: ApiService,
    private toast: ToastService,
    private fcm: FcmService,
  ) { }
@HostListener('document:click')
closeEmojiPicker(): void {
  this.showEmojiPicker = false;
}
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



  // 4. Add these methods
get visibleEmojis(): { emoji: string; name: string }[] {
  if (this.emojiSearch.trim()) return this.emojiSearchResults;
  return this.emojiCategories[this.activeEmojiCategory]?.emojis ?? [];
}
 
// 5. Add methods:
 
toggleEmojiPicker(event: MouseEvent): void {
  event.stopPropagation();
  this.showEmojiPicker = !this.showEmojiPicker;
}
 
onEmojiSelected(emoji: string): void {
  this.newMessage += emoji;
  // Keep focus on message input
  setTimeout(() => {
    const el = document.querySelector('.message-input') as HTMLInputElement;
    if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); }
  }, 0);
}
 
onEmojiSearch(): void {
  const q = this.emojiSearch.trim().toLowerCase();
  if (!q) { this.emojiSearchResults = []; return; }
  this.emojiSearchResults = this.emojiCategories
    .flatMap(c => c.emojis)
    .filter(e => e.name.includes(q));
}
 
// 6. Add HostListener to close picker on outside click:

  // ══════════════════════════════════════════════════════
  // SAFE URL BUILDER
  // Call ONLY on raw relative paths from the server.
  // Never call on a URL already built — will double-prefix.
  // ══════════════════════════════════════════════════════

  private buildFileUrl(rawPath: string | null | undefined): string | null {
    if (!rawPath) return null;
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
      return rawPath;
    }
    return this.api.getProfileImageUrl(rawPath);
  }

  // ══════════════════════════════════════════════════════
  // MAP SERVER MESSAGE → local msg object
  // Single place that handles attachments[], fileUrl[]
  // Called from handleNewMessageEvent + loadChatHistory
  // ══════════════════════════════════════════════════════

  private mapMessage(m: any, isOwn: boolean, read: boolean): any {
    // Backend returns fileUrl as List<String> — pick first
    const rawFileUrl = Array.isArray(m.fileUrl)
      ? (m.fileUrl[0] ?? null)
      : (m.fileUrl ?? null);

    // Build full display URL once here — never again
    const fileUrl = this.buildFileUrl(rawFileUrl);

    // Map attachments array — each has { url, name, type }
    const attachments = (m.attachments ?? []).map((a: any) => ({
      url: this.buildFileUrl(a.url),
      name: a.name,
      type: a.type,
    }));

    // Derive display text from attachments if text is empty
    let text = m.text ?? '';
    if (!text && attachments.length > 0) {
      const first = attachments[0];
      text = first.type === 'image'
        ? `[Image] ${first.name}`
        : `[File] ${first.name}`;
    }

    return {
      id: m.messageId,
      sender: m.type === 'system' ? 'System' : (m.sender?.name ?? ''),
      text,
      time: this.formatTime(m.createdAt),
      isOwn,
      status: m.status,
      type: m.type || 'text',
      read,
      fileUrl,        // first attachment full URL — used for display
      attachments,    // full list — used for multi-file
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

  // ══════════════════════════════════════════════════════
  // REPLACE your entire connectWebSocket() method with this
  // Opens DevTools Console and you'll see every WS event
  // ══════════════════════════════════════════════════════

  connectWebSocket(): void {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';

    console.group('🔌 WebSocket Init');
    console.log('token present:', !!token);
    console.log('token preview:', token ? token.substring(0, 30) + '...' : 'MISSING');
    console.log('wsUrl:', this.wsUrl);
    console.log('currentUserId:', this.currentUserId);
    console.groupEnd();

    if (!token) {
      console.error('❌ No token found — cannot connect WebSocket');
      this.toast.show('No auth token found', 'error');
      return;
    }

    // Close existing connection if any
    if (this.ws) {
      console.warn('⚠️ Closing existing WS before reconnecting, readyState:', this.ws.readyState);
      this.ws.close();
    }

    const fullUrl = `${this.wsUrl}?token=${token}`;
    console.log('📡 Connecting to:', fullUrl.replace(token, token.substring(0, 20) + '...'));

    try {
      this.ws = new WebSocket(fullUrl);
    } catch (e) {
      console.error('❌ Failed to create WebSocket:', e);
      return;
    }

    this.ws.onopen = (event) => {
      console.log('✅ WS CONNECTED', event);
      console.log('readyState:', this.ws.readyState); // should be 1

      // Join group rooms
      const groupChats = this.chats.filter(c => c.isGroup && c.chatId);
      console.log('🚪 Joining', groupChats.length, 'group room(s)');
      groupChats.forEach(c => this.joinRoom(c.chatId));

      // Start ping
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
          console.log('🏓 Ping sent');
        }
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      console.group('📨 WS MESSAGE RECEIVED');
      console.log('raw:', event.data);

      let data: any;
      try {
        data = JSON.parse(event.data);
        console.log('parsed:', data);
      } catch (e) {
        console.error('❌ Failed to parse WS message:', e);
        console.groupEnd();
        return;
      }

      // Filter out acks and pongs
      if (data.success !== undefined) { console.log('ℹ️ Ack/success msg — skipping'); console.groupEnd(); return; }
      if (data.error !== undefined) { console.error('❌ Server error:', data.error); console.groupEnd(); return; }
      if (data.type === 'pong') { console.log('🏓 Pong received'); console.groupEnd(); return; }

      console.log('🎯 event type:', data.event);
      console.groupEnd();

      switch (data.event) {
        case 'new_message': this.handleNewMessageEvent(data); break;
        case 'message_ack': this.handleMessageAck(data); break;
        case 'message_delivered': this.handleDeliveredEvent(data); break;
        case 'typing_start': this.handleTypingEvent(data, true); break;
        case 'typing_stop': this.handleTypingEvent(data, false); break;
        case 'message_seen': this.handleSeenEvent(data); break;
        case 'seen_ack': console.log('✅ seen_ack received'); break;
        case 'user_online':
        case 'user_offline': this.handleOnlineStatus(data); break;
        case 'sync_required': console.log('🔄 sync_required — reloading chat list'); this.loadChatList(); break;
        case 'join_ack': console.log('🚪 Joined room:', data.chatId); break;
        default: console.warn('⚠️ Unknown WS event:', data.event, data);
      }
    };

    this.ws.onerror = (error) => {
      console.error('❌ WS ERROR:', error);
      console.log('readyState at error:', this.ws?.readyState);
      this.toast.show('Connection error. Retrying...', 'error');
    };

    this.ws.onclose = (event) => {
      console.group('🔌 WS CLOSED');
      console.log('code:', event.code);
      console.log('reason:', event.reason || '(none)');
      console.log('wasClean:', event.wasClean);
      console.groupEnd();

      clearInterval(this.pingInterval);

      // Code meanings:
      // 1000 = normal close
      // 1001 = going away
      // 1006 = abnormal (network issue, server down, CORS)
      // 1008 = policy violation (bad token)
      // 1011 = server error

      if (event.code === 1008) {
        console.error('❌ Token rejected (1008) — redirecting to login');
        this.toast.show('Session expired. Please login again.', 'error');
        sessionStorage.clear();
        window.location.href = '/login';
        return;
      }

      if (event.code === 1006) {
        console.error('❌ Abnormal close (1006) — server unreachable or CORS issue');
      }

      console.log('🔄 Reconnecting in 3s...');
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  // ══════════════════════════════════════════════════════
  // ADD these two missing event handlers
  // ══════════════════════════════════════════════════════

  // Handles the ack the sender gets immediately after sending
  handleMessageAck(data: any): void {
    console.log('✅ message_ack:', data);
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (!chat) return;

    // Update the optimistic message with real messageId
    const tempMsg = chat.messages?.find((m: any) => m.status === 'sending' && m.isOwn);
    if (tempMsg) {
      tempMsg.id = data.messageId;
      tempMsg.status = data.status || 'sent';
      console.log('🔄 tempMsg updated from ack:', tempMsg.id, tempMsg.status);
    }
  }

  // Handles when message is delivered to recipient
  handleDeliveredEvent(data: any): void {
    console.log('📬 message_delivered:', data);
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (!chat) return;

    chat.messages?.forEach((m: any) => {
      if (m.id === data.messageId) {
        m.status = 'delivered';
        console.log('🔄 Message', m.id, 'marked delivered');
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // REPLACE joinRoom with debug version
  // ══════════════════════════════════════════════════════

  joinRoom(chatId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify({ type: 'JOIN', chatId });
      console.log('🚪 Joining room:', chatId);
      this.ws.send(payload);
    } else {
      console.warn('⚠️ Cannot join room — WS not open. readyState:', this.ws?.readyState);
    }
  }

  // ══════════════════════════════════════════════════════
  // REPLACE sendMessage with debug version
  // ══════════════════════════════════════════════════════

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.selectedChat) return;

    console.group('📤 sendMessage()');
    console.log('text:', this.newMessage.trim());
    console.log('chatId:', this.selectedChat.chatId);
    console.log('WS readyState:', this.ws?.readyState, '(1=OPEN, 3=CLOSED)');

    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.error('❌ WS not open — cannot send. readyState:', this.ws?.readyState);
      this.toast.show('Not connected. Retrying...', 'error');
      this.connectWebSocket();
      console.groupEnd();
      return;
    }

    const messageText = this.newMessage.trim();
    const tempId = Date.now();

    // Optimistic message
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

    const wsPayload = {
      type: 'new_message',
      chatId: this.selectedChat.chatId,
      text: messageText,
      msgType: 'text',
      tempId,
    };
    console.log('📦 WS payload:', wsPayload);
    this.ws.send(JSON.stringify(wsPayload));
    this.ws.send(JSON.stringify({ type: 'typing_stop', chatId: this.selectedChat.chatId }));
    console.groupEnd();
  }

  // ══════════════════════════════════════════════════════
  // SOCKET EVENTS
  // ══════════════════════════════════════════════════════

  handleNewMessageEvent(data: any): void {
    const msg = data.data;
    const chatId = msg?.chatId;
    if (!chatId) return;

    const chat = this.chats.find(c => c.chatId === chatId);
    if (!chat) { this.loadChatList(); return; }

    const isOwn = String(msg.sender?.userId) === String(this.currentUserId);
    const isChatOpen = this.selectedChat?.chatId === chatId;

    // ── Own message: update optimistic placeholder ────────────────
    if (isOwn && isChatOpen) {
      const tempMsg = chat.messages?.find((m: any) => m.status === 'sending' && m.isOwn);
      if (tempMsg) {
        // Merge real data from server into the placeholder
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

    // ── Message from others (or unmatched optimistic) ─────────────
    const newMsg = this.mapMessage(msg, isOwn, isOwn || isChatOpen);

    chat.messages = chat.messages || [];
    chat.messages.push(newMsg);

    // Update chat preview
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

  // handleSeenEvent(data: any): void {
  //   const chat = this.chats.find(c => c.chatId === data.chatId);
  //   if (chat && data.messageIds) {
  //     chat.messages?.forEach((m: any) => {
  //       if (data.messageIds.includes(m.id)) m.status = 'seen';
  //     });
  //   }
  // }

  handleSeenEvent(data: any): void {
    const chat = this.chats.find(c => c.chatId === data.chatId);
    if (!chat) return;

    console.log('👁️ message_seen received:', data);

    // ✅ Use messageIds array (new format) or fall back to legacy messageIds
    const messageIds: number[] = data.messageIds ?? [];
    const seenBy: string = String(data.seenBy ?? '');

    if (messageIds.length > 0) {
      // Update each message status to 'seen'
      chat.messages?.forEach((m: any) => {
        if (messageIds.includes(m.id)) {
          m.status = 'seen';   // ✅ triggers done_all icon in template
          console.log(`✅ Message ${m.id} marked as seen by user ${seenBy}`);
        }
      });
    }

    // Also handle the detailed messages array if present
    const updatedMessages: any[] = data.messages ?? [];
    if (updatedMessages.length > 0) {
      chat.messages?.forEach((m: any) => {
        const update = updatedMessages.find((u: any) => u.messageId === m.id);
        if (update) {
          m.status = update.status;       // "seen"
          m.seenBy = update.seenBy;
          m.seenCount = update.seenCount;
        }
      });
    }
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
          avatar: this.buildFileUrl(c.avatar),
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
        const messages = res.data?.items ?? [];

        // ✅ mapMessage handles fileUrl[] + attachments[] in one place
        chat.messages = messages.map((m: any) => {
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
  // SEND TEXT MESSAGE
  // ══════════════════════════════════════════════════════

  // sendMessage(): void {
  //   if (!this.newMessage.trim() || !this.selectedChat) return;
  //   if (this.ws?.readyState !== WebSocket.OPEN) {
  //     this.toast.show('Not connected. Retrying...', 'error');
  //     this.connectWebSocket();
  //     return;
  //   }

  //   const messageText = this.newMessage.trim();
  //   const tempId = Date.now();

  //   // Optimistic message
  //   this.selectedChat.messages = this.selectedChat.messages || [];
  //   this.selectedChat.messages.push({
  //     id: tempId, sender: this.currentUserName, text: messageText,
  //     time: this.formatTime(new Date().toISOString()), isOwn: true,
  //     status: 'sending', type: 'text', read: true,
  //     fileUrl: null, attachments: [], tempId,
  //   });
  //   this.selectedChat.lastMessage = messageText;
  //   this.selectedChat.lastMessageTime = this.formatTime(new Date().toISOString());
  //   this.newMessage = '';
  //   this.shouldScroll = true;

  //   this.ws.send(JSON.stringify({
  //     type: 'new_message',
  //     chatId: this.selectedChat.chatId,
  //     text: messageText,
  //     msgType: 'text',
  //     tempId,
  //   }));
  //   this.ws.send(JSON.stringify({ type: 'typing_stop', chatId: this.selectedChat.chatId }));
  // }

  // ══════════════════════════════════════════════════════
  // FILE UPLOAD
  // ══════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════
  // REPLACE onFileSelected + handleUploadedFiles with this
  // Has full debug logging at every step
  // ══════════════════════════════════════════════════════

  triggerFileUpload(): void { this.fileInput?.nativeElement.click(); }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;

    // ── Guard ─────────────────────────────────────────────────────
    if (!input.files || input.files.length === 0) {
      console.warn('⚠️ No files selected');
      return;
    }
    if (!this.selectedChat) {
      console.warn('⚠️ No chat selected');
      return;
    }

    // ✅ Convert FileList → real Array immediately
    // FileList is NOT a standard array — forEach/map don't work on it directly
    const fileArray: File[] = Array.from(input.files);

    console.log('📁 fileArray.length:', fileArray.length);
    console.log('📁 files:', fileArray.map(f => ({ name: f.name, size: f.size, type: f.type })));

    // Reset input so same file can be selected again
    input.value = '';

    const MAX_BYTES = 10485760; // 10 * 1024 * 1024 = 10MB — hardcoded to avoid any variable issue
    const validFiles: File[] = [];

    for (const file of fileArray) {
      console.log(`📄 Checking: ${file.name} | size: ${file.size} | MAX: ${MAX_BYTES} | tooLarge: ${file.size > MAX_BYTES}`);

      if (file.size > MAX_BYTES) {
        this.toast.show(`${file.name} is too large (max 10MB)`, 'error');
        continue;
      }

      validFiles.push(file);
    }

    console.log('✅ validFiles:', validFiles.length, validFiles.map(f => f.name));

    if (validFiles.length === 0) {
      console.error('❌ All files rejected');
      return;
    }

    this.isUploadingFile = true;

    try {
      const base64List = await Promise.all(validFiles.map(f => this.fileToBase64(f)));
      const nameList = validFiles.map(f => f.name);

      console.log('✅ base64 done, count:', base64List.length);

      const payload: any = { chatId: this.selectedChat.chatId };

      if (validFiles.length === 1) {
        payload.file = base64List[0];
        payload.fileName = nameList[0];
      } else {
        payload.files = base64List;
        payload.fileNames = nameList;
      }

      console.log('📤 Uploading:', { chatId: payload.chatId, fileName: payload.fileName ?? payload.fileNames });

      this.api.uploadChatFile(payload).subscribe({
        next: (res: any) => {
          this.isUploadingFile = false;
          console.log('📥 Upload response:', res);

          if (!res.success) {
            this.toast.show(res.message || 'Upload failed', 'error');
            return;
          }

          const uploaded: any[] = Array.isArray(res.data) ? res.data : [res.data];
          console.log('✅ Uploaded:', uploaded);
          this.handleUploadedFiles(uploaded, validFiles);
        },
        error: (err: any) => {
          this.isUploadingFile = false;
          console.error('❌ Upload error:', err.status, err.error);
          this.toast.show(err?.error?.message ?? `Upload failed (${err.status})`, 'error');
        }
      });

    } catch (err) {
      this.isUploadingFile = false;
      console.error('❌ Processing error:', err);
      this.toast.show('File processing failed', 'error');
    }
  }

  handleUploadedFiles(uploadedFiles: any[], originalFiles: File[]): void {
    console.log('🔧 handleUploadedFiles called with:', uploadedFiles);

    if (!uploadedFiles?.length) {
      console.warn('⚠️ uploadedFiles is empty');
      return;
    }

    const attachments = uploadedFiles.map((f: any, i: number) => {
      const type = f.type ?? (originalFiles[i]?.type?.startsWith('image/') ? 'image' : 'file');
      console.log(`🔗 Attachment[${i}]: url=${f.url}, name=${f.name}, type=${type}`);
      return { url: f.url ?? '', name: f.name ?? originalFiles[i]?.name ?? 'file', type };
    });

    const msgType = attachments.every(a => a.type === 'image') ? 'image' : 'file';

    // ── WS check ─────────────────────────────────────────────────
    console.log('🔌 WS readyState:', this.ws?.readyState, '(1 = OPEN)');

    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket is NOT open — cannot send message');
      this.toast.show('Not connected. Please retry.', 'error');
      this.isUploadingFile = false;
      return;
    }

    const wsPayload = {
      type: 'new_message',
      chatId: this.selectedChat.chatId,
      msgType,
      text: '',
      attachments,
    };
    console.log('📤 WS SEND:', JSON.stringify(wsPayload, null, 2));
    this.ws.send(JSON.stringify(wsPayload));

    // ── Optimistic UI ─────────────────────────────────────────────
    this.selectedChat.messages = this.selectedChat.messages || [];

    attachments.forEach((att: any, index: number) => {
      const fullUrl = this.buildFileUrl(att.url);
      const msgText = att.type === 'image' ? `[Image] ${att.name}` : `[File] ${att.name}`;

      console.log(`💬 Adding optimistic msg[${index}]: type=${att.type}, fullUrl=${fullUrl}`);

      this.selectedChat.messages.push({
        id: Date.now() + index,
        sender: this.currentUserName,
        text: msgText,
        time: this.formatTime(new Date().toISOString()),
        isOwn: true,
        status: 'sending',
        type: att.type,
        read: true,
        fileUrl: fullUrl,
        attachments: [{ url: fullUrl, name: att.name, type: att.type }],
      });
    });

    this.shouldScroll = true;
    console.log('✅ Optimistic messages added. Total messages:', this.selectedChat.messages.length);
  }


  // ══════════════════════════════════════════════════════
  // ALSO REPLACE handleNewMessageEvent to log what BE returns
  // ══════════════════════════════════════════════════════

  // handleNewMessageEvent(data: any): void {
  //   console.log('📨 WS new_message received:', JSON.stringify(data, null, 2));

  //   const msg    = data.data;
  //   const chatId = msg?.chatId;
  //   if (!chatId) { console.warn('⚠️ No chatId in message'); return; }

  //   const chat = this.chats.find(c => c.chatId === chatId);
  //   if (!chat) { this.loadChatList(); return; }

  //   const isOwn      = String(msg.sender?.userId) === String(this.currentUserId);
  //   const isChatOpen = this.selectedChat?.chatId === chatId;

  //   console.log('👤 isOwn:', isOwn, '| isChatOpen:', isChatOpen);
  //   console.log('📎 msg.attachments:', msg.attachments);
  //   console.log('🔗 msg.fileUrl:', msg.fileUrl);

  //   // Own message — update optimistic placeholder
  //   if (isOwn && isChatOpen) {
  //     const tempMsg = chat.messages?.find((m: any) => m.status === 'sending' && m.isOwn);
  //     console.log('🔄 Found tempMsg to update:', !!tempMsg);
  //     if (tempMsg) {
  //       const mapped        = this.mapMessage(msg, true, true);
  //       tempMsg.id          = mapped.id;
  //       tempMsg.status      = mapped.status || 'sent';
  //       tempMsg.time        = mapped.time;
  //       tempMsg.fileUrl     = mapped.fileUrl;
  //       tempMsg.attachments = mapped.attachments;
  //       tempMsg.text        = mapped.text || tempMsg.text;
  //       delete tempMsg.tempId;
  //       console.log('✅ tempMsg updated:', tempMsg);
  //       this.saveLastRead(chatId, msg.messageId);
  //       chat.unreadCount = 0;
  //       return;
  //     }
  //   }

  //   const newMsg = this.mapMessage(msg, isOwn, isOwn || isChatOpen);
  //   console.log('💬 New mapped message:', newMsg);

  //   chat.messages = chat.messages || [];
  //   chat.messages.push(newMsg);
  //   chat.lastMessage     = newMsg.text;
  //   chat.lastMessageTime = newMsg.time;

  //   if (isOwn || isChatOpen) {
  //     this.saveLastRead(chatId, msg.messageId);
  //     chat.unreadCount = 0;
  //     if (isChatOpen) this.api.markMessagesSeen(chatId, [msg.messageId]).subscribe();
  //   } else {
  //     chat.unreadCount = this.countUnread(chat.messages, chatId);
  //   }

  //   if (isChatOpen) this.shouldScroll = true;
  //   this.sortAndFilterChats();
  // }

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
          } else {
            this.toast.show('Avatar upload failed', 'error');
          }
        },
        error: () => { this.isUploadingAvatar = false; this.toast.show('Avatar upload failed', 'error'); }
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
    // fileUrl is already full URL — use directly
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
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
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
      p.name?.toLowerCase().includes(q) ||
      p.role?.toLowerCase().includes(q)
    );
  }

  get unreadCount(): number { return this.chats.filter(c => c.unreadCount > 0).length; }

  getInitial(name: string): string { return (name || '?').charAt(0).toUpperCase(); }

  // ✅ msg.fileUrl is already a full URL (built in mapMessage or handleUploadedFiles)
  // Just return it — never call buildFileUrl here
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
    console.error('❌ Image failed to load:', img.src);
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