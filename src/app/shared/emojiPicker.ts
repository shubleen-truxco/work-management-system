import {
  Component, Output, EventEmitter,
  HostListener, ElementRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';

@Component({
  selector: 'app-emoji-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ep-wrap">

      <!-- Category tabs -->
      <div class="ep-tabs">
        <button *ngFor="let cat of categories; let i = index"
          class="ep-tab"
          [class.active]="activeCategory === i"
          (click)="activeCategory = i; emojiSearch = ''"
          [title]="cat.label">
          {{ cat.icon }}
        </button>
      </div>

      <!-- Search -->
      <div class="ep-search-wrap">
        <input
          class="ep-search"
          type="text"
          placeholder="Search emoji..."
          [(ngModel)]="emojiSearch"
          (input)="onSearch()" />
      </div>

      <!-- Emoji grid -->
      <div class="ep-grid">
        <button *ngFor="let e of visibleEmojis"
          class="ep-btn"
          [title]="e.name"
          (click)="pick(e.emoji)">
          {{ e.emoji }}
        </button>
        <div *ngIf="visibleEmojis.length === 0" class="ep-empty">
          No emojis found
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ep-wrap {
      width: 320px;
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .ep-tabs {
      display: flex;
      gap: 2px;
      padding: 8px 8px 0;
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .ep-tabs::-webkit-scrollbar { display: none; }
    .ep-tab {
      flex-shrink: 0;
      width: 34px; height: 34px;
      border: none; background: transparent;
      border-radius: 8px;
      font-size: 18px;
      cursor: pointer;
      transition: background 0.15s;
      display: flex; align-items: center; justify-content: center;
    }
    .ep-tab:hover  { background: var(--color-bg, #f8fafc); }
    .ep-tab.active { background: var(--color-teal-glow, #e0f7f4); }
    .ep-search-wrap {
      padding: 8px;
      border-bottom: 1px solid var(--color-border, #e2e8f0);
    }
    .ep-search {
      width: 100%;
      padding: 6px 12px;
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 20px;
      font-size: 13px;
      background: var(--color-bg, #f8fafc);
      color: var(--color-text, #1e293b);
      outline: none;
      box-sizing: border-box;
    }
    .ep-search:focus { border-color: var(--color-teal, #0891b2); }
    .ep-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
      padding: 8px;
      height: 220px;
      overflow-y: auto;
      scrollbar-width: thin;
    }
    .ep-btn {
      aspect-ratio: 1;
      border: none; background: transparent;
      border-radius: 6px;
      font-size: 20px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.1s, transform 0.1s;
      line-height: 1;
    }
    .ep-btn:hover {
      background: var(--color-bg, #f8fafc);
      transform: scale(1.2);
    }
    .ep-empty {
      grid-column: 1 / -1;
      text-align: center;
      padding: 24px;
      color: var(--color-text-muted, #94a3b8);
      font-size: 13px;
    }
  `]
})
export class EmojiPickerComponent {

  @Output() emojiSelected = new EventEmitter<string>();

  emojiSearch    = '';
  activeCategory = 0;
  searchResults: { emoji: string; name: string }[] = [];
  isSearching    = false;

  categories = [
    { icon: '😀', label: 'Smileys',    emojis: [
      { emoji: '😀', name: 'grinning' }, { emoji: '😁', name: 'beaming' },
      { emoji: '😂', name: 'joy' },      { emoji: '🤣', name: 'rofl' },
      { emoji: '😃', name: 'smile' },    { emoji: '😄', name: 'grin' },
      { emoji: '😅', name: 'sweat smile' }, { emoji: '😆', name: 'laughing' },
      { emoji: '😉', name: 'wink' },     { emoji: '😊', name: 'blush' },
      { emoji: '😋', name: 'yum' },      { emoji: '😎', name: 'sunglasses' },
      { emoji: '😍', name: 'heart eyes' }, { emoji: '🥰', name: 'smiling hearts' },
      { emoji: '😘', name: 'kissing heart' }, { emoji: '😗', name: 'kissing' },
      { emoji: '😙', name: 'kissing smiling' }, { emoji: '😚', name: 'kissing closed' },
      { emoji: '🙂', name: 'slightly smiling' }, { emoji: '🤗', name: 'hugging' },
      { emoji: '🤩', name: 'star struck' }, { emoji: '🤔', name: 'thinking' },
      { emoji: '🤨', name: 'raised eyebrow' }, { emoji: '😐', name: 'neutral' },
      { emoji: '😑', name: 'expressionless' }, { emoji: '😶', name: 'no mouth' },
      { emoji: '🙄', name: 'eye roll' }, { emoji: '😏', name: 'smirk' },
      { emoji: '😒', name: 'unamused' }, { emoji: '😞', name: 'disappointed' },
      { emoji: '😔', name: 'pensive' },  { emoji: '😟', name: 'worried' },
      { emoji: '😕', name: 'confused' }, { emoji: '🙁', name: 'frowning' },
      { emoji: '☹️', name: 'frown' },    { emoji: '😣', name: 'persevering' },
      { emoji: '😖', name: 'confounded' }, { emoji: '😫', name: 'tired' },
      { emoji: '😩', name: 'weary' },    { emoji: '🥺', name: 'pleading' },
      { emoji: '😢', name: 'crying' },   { emoji: '😭', name: 'loudly crying' },
      { emoji: '😤', name: 'huffing' },  { emoji: '😠', name: 'angry' },
      { emoji: '😡', name: 'rage' },     { emoji: '🤬', name: 'face symbols' },
      { emoji: '😈', name: 'smiling devil' }, { emoji: '👿', name: 'angry devil' },
      { emoji: '💀', name: 'skull' },    { emoji: '☠️', name: 'skull crossbones' },
      { emoji: '🤡', name: 'clown' },    { emoji: '👹', name: 'ogre' },
      { emoji: '👺', name: 'goblin' },   { emoji: '👻', name: 'ghost' },
      { emoji: '👾', name: 'alien monster' }, { emoji: '🤖', name: 'robot' },
      { emoji: '😺', name: 'cat grin' }, { emoji: '😸', name: 'cat joy' },
      { emoji: '🥱', name: 'yawning' },  { emoji: '🤤', name: 'drooling' },
      { emoji: '🤢', name: 'nauseated' }, { emoji: '🤮', name: 'vomiting' },
      { emoji: '🥵', name: 'hot face' }, { emoji: '🥶', name: 'cold face' },
    ]},
    { icon: '👋', label: 'Gestures',   emojis: [
      { emoji: '👋', name: 'wave' },     { emoji: '🤚', name: 'raised back hand' },
      { emoji: '✋', name: 'raised hand' }, { emoji: '🖖', name: 'vulcan' },
      { emoji: '👌', name: 'ok hand' },  { emoji: '🤌', name: 'pinched fingers' },
      { emoji: '✌️', name: 'victory' },  { emoji: '🤞', name: 'crossed fingers' },
      { emoji: '🤙', name: 'call me' },  { emoji: '👈', name: 'point left' },
      { emoji: '👉', name: 'point right' }, { emoji: '👆', name: 'point up' },
      { emoji: '👇', name: 'point down' }, { emoji: '☝️', name: 'index up' },
      { emoji: '👍', name: 'thumbs up' }, { emoji: '👎', name: 'thumbs down' },
      { emoji: '✊', name: 'raised fist' }, { emoji: '👊', name: 'oncoming fist' },
      { emoji: '🤛', name: 'left fist' }, { emoji: '🤜', name: 'right fist' },
      { emoji: '👏', name: 'clapping' }, { emoji: '🙌', name: 'raising hands' },
      { emoji: '👐', name: 'open hands' }, { emoji: '🤲', name: 'palms up' },
      { emoji: '🙏', name: 'folded hands' }, { emoji: '✍️', name: 'writing' },
      { emoji: '💪', name: 'flexed bicep' }, { emoji: '🦾', name: 'mechanical arm' },
      { emoji: '🫶', name: 'heart hands' }, { emoji: '🤝', name: 'handshake' },
    ]},
    { icon: '❤️', label: 'Hearts',     emojis: [
      { emoji: '❤️', name: 'red heart' }, { emoji: '🧡', name: 'orange heart' },
      { emoji: '💛', name: 'yellow heart' }, { emoji: '💚', name: 'green heart' },
      { emoji: '💙', name: 'blue heart' }, { emoji: '💜', name: 'purple heart' },
      { emoji: '🖤', name: 'black heart' }, { emoji: '🤍', name: 'white heart' },
      { emoji: '🤎', name: 'brown heart' }, { emoji: '💔', name: 'broken heart' },
      { emoji: '❣️', name: 'heart exclamation' }, { emoji: '💕', name: 'two hearts' },
      { emoji: '💞', name: 'revolving hearts' }, { emoji: '💓', name: 'beating heart' },
      { emoji: '💗', name: 'growing heart' }, { emoji: '💖', name: 'sparkling heart' },
      { emoji: '💘', name: 'heart arrow' }, { emoji: '💝', name: 'heart ribbon' },
      { emoji: '💟', name: 'heart decoration' }, { emoji: '♥️', name: 'heart suit' },
      { emoji: '😻', name: 'cat heart eyes' }, { emoji: '💌', name: 'love letter' },
      { emoji: '💋', name: 'kiss mark' }, { emoji: '👄', name: 'lips' },
    ]},
    { icon: '🎉', label: 'Celebration', emojis: [
      { emoji: '🎉', name: 'party popper' }, { emoji: '🎊', name: 'confetti ball' },
      { emoji: '🎈', name: 'balloon' },   { emoji: '🎁', name: 'gift' },
      { emoji: '🏆', name: 'trophy' },    { emoji: '🥇', name: 'gold medal' },
      { emoji: '🥈', name: 'silver medal' }, { emoji: '🥉', name: 'bronze medal' },
      { emoji: '🎖️', name: 'medal' },    { emoji: '🏅', name: 'sports medal' },
      { emoji: '🎯', name: 'bullseye' },  { emoji: '🎮', name: 'video game' },
      { emoji: '🎲', name: 'dice' },      { emoji: '🃏', name: 'joker' },
      { emoji: '🎭', name: 'performing arts' }, { emoji: '🎨', name: 'artist palette' },
      { emoji: '🎤', name: 'microphone' }, { emoji: '🎵', name: 'music note' },
      { emoji: '🎶', name: 'notes' },     { emoji: '🎸', name: 'guitar' },
      { emoji: '🥳', name: 'partying face' }, { emoji: '🍾', name: 'champagne' },
      { emoji: '🍻', name: 'beers' },     { emoji: '🥂', name: 'clinking glasses' },
    ]},
    { icon: '🔥', label: 'Symbols',    emojis: [
      { emoji: '🔥', name: 'fire' },      { emoji: '✨', name: 'sparkles' },
      { emoji: '⭐', name: 'star' },       { emoji: '🌟', name: 'glowing star' },
      { emoji: '💫', name: 'dizzy' },     { emoji: '⚡', name: 'lightning' },
      { emoji: '💥', name: 'collision' }, { emoji: '🌈', name: 'rainbow' },
      { emoji: '☀️', name: 'sun' },       { emoji: '🌙', name: 'crescent moon' },
      { emoji: '⚽', name: 'soccer' },    { emoji: '🏀', name: 'basketball' },
      { emoji: '🎯', name: 'target' },    { emoji: '💯', name: 'hundred' },
      { emoji: '✅', name: 'check mark' }, { emoji: '❌', name: 'cross mark' },
      { emoji: '⁉️', name: 'exclamation question' }, { emoji: '‼️', name: 'double exclamation' },
      { emoji: '💢', name: 'anger symbol' }, { emoji: '💬', name: 'speech bubble' },
      { emoji: '💭', name: 'thought bubble' }, { emoji: '💤', name: 'zzz' },
      { emoji: '🔔', name: 'bell' },      { emoji: '🔕', name: 'bell slash' },
      { emoji: '📢', name: 'loudspeaker' }, { emoji: '📣', name: 'megaphone' },
      { emoji: '🆗', name: 'ok' },        { emoji: '🆙', name: 'up' },
      { emoji: '🆒', name: 'cool' },      { emoji: '🆕', name: 'new' },
      { emoji: '🚀', name: 'rocket' },    { emoji: '💎', name: 'gem' },
    ]},
    { icon: '🐶', label: 'Animals',    emojis: [
      { emoji: '🐶', name: 'dog' },       { emoji: '🐱', name: 'cat' },
      { emoji: '🐭', name: 'mouse' },     { emoji: '🐹', name: 'hamster' },
      { emoji: '🐰', name: 'rabbit' },    { emoji: '🦊', name: 'fox' },
      { emoji: '🐻', name: 'bear' },      { emoji: '🐼', name: 'panda' },
      { emoji: '🐨', name: 'koala' },     { emoji: '🐯', name: 'tiger' },
      { emoji: '🦁', name: 'lion' },      { emoji: '🐮', name: 'cow' },
      { emoji: '🐷', name: 'pig' },       { emoji: '🐸', name: 'frog' },
      { emoji: '🐵', name: 'monkey' },    { emoji: '🦄', name: 'unicorn' },
      { emoji: '🐔', name: 'chicken' },   { emoji: '🦆', name: 'duck' },
      { emoji: '🦉', name: 'owl' },       { emoji: '🦋', name: 'butterfly' },
      { emoji: '🐢', name: 'turtle' },    { emoji: '🐍', name: 'snake' },
      { emoji: '🦖', name: 'trex' },      { emoji: '🦕', name: 'sauropod' },
    ]},
    { icon: '🍎', label: 'Food',        emojis: [
      { emoji: '🍎', name: 'apple' },     { emoji: '🍊', name: 'orange' },
      { emoji: '🍋', name: 'lemon' },     { emoji: '🍇', name: 'grapes' },
      { emoji: '🍓', name: 'strawberry' }, { emoji: '🍒', name: 'cherries' },
      { emoji: '🍑', name: 'peach' },     { emoji: '🥭', name: 'mango' },
      { emoji: '🍍', name: 'pineapple' }, { emoji: '🥥', name: 'coconut' },
      { emoji: '🥝', name: 'kiwi' },      { emoji: '🍅', name: 'tomato' },
      { emoji: '🥑', name: 'avocado' },   { emoji: '🍕', name: 'pizza' },
      { emoji: '🍔', name: 'burger' },    { emoji: '🌮', name: 'taco' },
      { emoji: '🍣', name: 'sushi' },     { emoji: '🍜', name: 'noodles' },
      { emoji: '🍩', name: 'doughnut' },  { emoji: '🍪', name: 'cookie' },
      { emoji: '🎂', name: 'birthday cake' }, { emoji: '🍫', name: 'chocolate' },
      { emoji: '☕', name: 'coffee' },    { emoji: '🧋', name: 'bubble tea' },
    ]},
  ];

  get visibleEmojis(): { emoji: string; name: string }[] {
    if (this.isSearching) return this.searchResults;
    return this.categories[this.activeCategory]?.emojis ?? [];
  }

  onSearch(): void {
    const q = this.emojiSearch.trim().toLowerCase();
    if (!q) { this.isSearching = false; return; }
    this.isSearching = true;
    this.searchResults = this.categories
      .flatMap(c => c.emojis)
      .filter(e => e.name.includes(q) || e.emoji.includes(q));
  }

  pick(emoji: string): void {
    this.emojiSelected.emit(emoji);
  }
}