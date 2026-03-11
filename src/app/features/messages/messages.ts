import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Sidebar } from '../../shared/sidebar/sidebar';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, Sidebar],
  templateUrl: './messages.html',
  styleUrls: ['./messages.css'],
})
export class Messages implements OnInit, AfterViewChecked {

  @ViewChild('messagesArea') messagesArea!: ElementRef;

  searchChat    = '';
  activeFilter  = 'all';
  newMessage    = '';
  isTyping      = false;
  selectedChat: any = null;
  showNewChatModal  = false;
  newChatType       = 'direct';
  newGroupName      = '';
  searchPeople      = '';
  selectedPeople: any[] = [];

  // ── Static Chat Data ──────────────────────────────────
  chats: any[] = [
    {
      id: 1, name: 'John Doe', isGroup: false, online: true,
      lastMessage: 'Sure, I will send the report by EOD.',
      lastMessageTime: '10:42 AM', unreadCount: 2, lastSeen: '',
      messages: [
        { id: 1, sender: 'John Doe', text: 'Hey, good morning!', time: '9:00 AM', isOwn: false, read: true },
        { id: 2, sender: 'Me', text: 'Good morning John! How are you?', time: '9:01 AM', isOwn: true, read: true },
        { id: 3, sender: 'John Doe', text: 'Doing well, thanks. Can you share the Q3 report?', time: '9:15 AM', isOwn: false, read: true },
        { id: 4, sender: 'Me', text: 'Yes, I will prepare it. Give me some time.', time: '9:16 AM', isOwn: true, read: true },
        { id: 5, sender: 'John Doe', text: 'No rush, whenever you are ready.', time: '10:00 AM', isOwn: false, read: true },
        { id: 6, sender: 'John Doe', text: 'Sure, I will send the report by EOD.', time: '10:42 AM', isOwn: false, read: false, dateDivider: '' },
      ]
    },
    {
      id: 2, name: 'Testing User', isGroup: false, online: false,
      lastMessage: 'The deployment is done ✓',
      lastMessageTime: '9:30 AM', unreadCount: 0, lastSeen: 'Last seen 2h ago',
      messages: [
        { id: 1, sender: 'Testing User', text: 'Hey, the build failed again on staging.', time: '8:00 AM', isOwn: false, read: true },
        { id: 2, sender: 'Me', text: 'I will check the logs now.', time: '8:05 AM', isOwn: true, read: true },
        { id: 3, sender: 'Me', text: 'Found the issue — missing env variable. Fixed!', time: '8:45 AM', isOwn: true, read: true },
        { id: 4, sender: 'Testing User', text: 'The deployment is done ✓', time: '9:30 AM', isOwn: false, read: true },
      ]
    },
    {
      id: 3, name: 'Dev Team', isGroup: true, online: false,
      lastMessage: 'Sprint review is at 4 PM today.',
      lastMessageTime: 'Yesterday', unreadCount: 5, members: 6, lastSender: 'Prabhdeep',
      messages: [
        { id: 1, sender: 'Prabhdeep', text: 'Good morning team!', time: '9:00 AM', isOwn: false, read: true, dateDivider: 'Yesterday' },
        { id: 2, sender: 'Me', text: 'Morning! Ready for the sprint review?', time: '9:05 AM', isOwn: true, read: true },
        { id: 3, sender: 'John Doe', text: 'Yes, I have updated all the tickets.', time: '9:10 AM', isOwn: false, read: true },
        { id: 4, sender: 'Testing User', text: 'Same here. All tests are passing.', time: '9:12 AM', isOwn: false, read: true },
        { id: 5, sender: 'Prabhdeep', text: 'Sprint review is at 4 PM today.', time: '10:00 AM', isOwn: false, read: false },
      ]
    },
    {
      id: 4, name: 'HR Department', isGroup: true, online: false,
      lastMessage: 'Please submit your timesheets.',
      lastMessageTime: 'Mon', unreadCount: 1, members: 4, lastSender: 'Admin',
      messages: [
        { id: 1, sender: 'Admin', text: 'Reminder: Monthly timesheets due Friday.', time: '10:00 AM', isOwn: false, read: true, dateDivider: 'Monday' },
        { id: 2, sender: 'Me', text: 'Noted, will submit by Thursday.', time: '10:30 AM', isOwn: true, read: true },
        { id: 3, sender: 'Admin', text: 'Please submit your timesheets.', time: '11:00 AM', isOwn: false, read: false },
      ]
    },
    {
      id: 5, name: 'Prabhdeep Singh', isGroup: false, online: true,
      lastMessage: 'Sounds good, let us connect tomorrow.',
      lastMessageTime: 'Sun', unreadCount: 0, lastSeen: '',
      messages: [
        { id: 1, sender: 'Prabhdeep Singh', text: 'Can we discuss the new feature requirements?', time: '3:00 PM', isOwn: false, read: true, dateDivider: 'Sunday' },
        { id: 2, sender: 'Me', text: 'Sure! What time works for you?', time: '3:05 PM', isOwn: true, read: true },
        { id: 3, sender: 'Prabhdeep Singh', text: 'Tomorrow morning around 10?', time: '3:10 PM', isOwn: false, read: true },
        { id: 4, sender: 'Me', text: 'Sounds good, let us connect tomorrow.', time: '3:15 PM', isOwn: true, read: true },
      ]
    },
  ];

  filteredChats: any[] = [];

  // ── People for new chat ───────────────────────────────
  people: any[] = [
    { id: 1, name: 'John Doe',        role: 'Developer'  },
    { id: 2, name: 'Testing User',    role: 'QA Engineer' },
    { id: 3, name: 'Prabhdeep Singh', role: 'Team Lead'  },
    { id: 4, name: 'Sarah Johnson',   role: 'Designer'   },
    { id: 5, name: 'Mike Chen',       role: 'Developer'  },
  ];

  get filteredPeople(): any[] {
    if (!this.searchPeople.trim()) return this.people;
    return this.people.filter(p =>
      p.name.toLowerCase().includes(this.searchPeople.toLowerCase())
    );
  }

  get unreadCount(): number {
    return this.chats.filter(c => c.unreadCount > 0).length;
  }

  ngOnInit(): void {
    this.filteredChats = [...this.chats];
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      if (this.messagesArea) {
        this.messagesArea.nativeElement.scrollTop =
          this.messagesArea.nativeElement.scrollHeight;
      }
    } catch {}
  }

  // ── Filter / Search ───────────────────────────────────
  filterChats(): void {
    let list = [...this.chats];
    if (this.searchChat.trim()) {
      list = list.filter(c =>
        c.name.toLowerCase().includes(this.searchChat.toLowerCase()) ||
        c.lastMessage.toLowerCase().includes(this.searchChat.toLowerCase())
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

  // ── Select Chat ───────────────────────────────────────
  selectChat(chat: any): void {
    this.selectedChat    = chat;
    chat.unreadCount     = 0;  // mark as read
  }

  // ── Send Message ──────────────────────────────────────
  sendMessage(): void {
    if (!this.newMessage.trim() || !this.selectedChat) return;
    this.selectedChat.messages.push({
      id:     Date.now(),
      sender: 'Me',
      text:   this.newMessage.trim(),
      time:   this.getCurrentTime(),
      isOwn:  true,
      read:   false,
    });
    this.selectedChat.lastMessage     = this.newMessage.trim();
    this.selectedChat.lastMessageTime = 'Just now';
    this.newMessage = '';
  }

  getCurrentTime(): string {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Typing ────────────────────────────────────────────
  onTyping(): void {
    // Can hook into real-time socket later
  }

  // ── New Chat Modal ────────────────────────────────────
  openNewChatModal(): void {
    this.showNewChatModal = true;
    this.newChatType      = 'direct';
    this.newGroupName     = '';
    this.searchPeople     = '';
    this.selectedPeople   = [];
  }

  closeNewChatModal(): void {
    this.showNewChatModal = false;
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

    const isGroup = this.newChatType === 'group';
    const newChat = {
      id:              Date.now(),
      name:            isGroup
                         ? (this.newGroupName || 'New Group')
                         : this.selectedPeople[0].name,
      isGroup,
      online:          !isGroup,
      lastMessage:     'Chat started',
      lastMessageTime: 'Just now',
      unreadCount:     0,
      members:         isGroup ? this.selectedPeople.length + 1 : undefined,
      lastSeen:        'Just now',
      messages:        [],
    };

    this.chats.unshift(newChat);
    this.filteredChats = [...this.chats];
    this.selectedChat  = newChat;
    this.closeNewChatModal();
  }
}