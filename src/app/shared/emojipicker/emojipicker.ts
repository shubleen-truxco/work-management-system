
import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-emojipicker',
  imports: [ CommonModule, FormsModule],
  templateUrl: './emojipicker.html',
  styleUrl: './emojipicker.css',
})
export class Emojipicker {
  emojiSearch = '';
  activeCategory = 0;
  searchResults: any[] = [];


  @Output() emojiSelect = new EventEmitter<string>();
  emojiCategories = [
    {
      icon: '😀', label: 'Smileys', emojis: [
        { emoji: '😀', name: 'grinning' }, { emoji: '😁', name: 'beaming' }, { emoji: '😂', name: 'joy' },
        { emoji: '🤣', name: 'rofl' }, { emoji: '😃', name: 'smile' }, { emoji: '😄', name: 'grin' },
        { emoji: '😅', name: 'sweat smile' }, { emoji: '😆', name: 'laughing' }, { emoji: '😉', name: 'wink' },
        { emoji: '😊', name: 'blush' }, { emoji: '😋', name: 'yum' }, { emoji: '😎', name: 'sunglasses' },
        { emoji: '😍', name: 'heart eyes' }, { emoji: '🥰', name: 'smiling hearts' }, { emoji: '😘', name: 'kissing heart' },
        { emoji: '🙂', name: 'slightly smiling' }, { emoji: '🤗', name: 'hugging' }, { emoji: '🤩', name: 'star struck' },
        { emoji: '🤔', name: 'thinking' }, { emoji: '😐', name: 'neutral' }, { emoji: '😑', name: 'expressionless' },
        { emoji: '🙄', name: 'eye roll' }, { emoji: '😏', name: 'smirk' }, { emoji: '😒', name: 'unamused' },
        { emoji: '😞', name: 'disappointed' }, { emoji: '😔', name: 'pensive' }, { emoji: '😟', name: 'worried' },
        { emoji: '😕', name: 'confused' }, { emoji: '🥺', name: 'pleading' }, { emoji: '😢', name: 'crying' },
        { emoji: '😭', name: 'loudly crying' }, { emoji: '😤', name: 'huffing' }, { emoji: '😠', name: 'angry' },
        { emoji: '😡', name: 'rage' }, { emoji: '🤬', name: 'symbols' }, { emoji: '😈', name: 'smiling devil' },
        { emoji: '👿', name: 'angry devil' }, { emoji: '💀', name: 'skull' }, { emoji: '🤡', name: 'clown' },
        { emoji: '👻', name: 'ghost' }, { emoji: '🤖', name: 'robot' }, { emoji: '🥱', name: 'yawning' },
        { emoji: '🤤', name: 'drooling' }, { emoji: '🤢', name: 'nauseated' }, { emoji: '🥵', name: 'hot face' },
        { emoji: '🥶', name: 'cold face' }, { emoji: '😇', name: 'angel' }, { emoji: '🤠', name: 'cowboy' },
        { emoji: '🥸', name: 'disguised' }, { emoji: '🤓', name: 'nerd' }, { emoji: '🧐', name: 'monocle' },
      ]
    },
    {
      icon: '👋', label: 'Gestures', emojis: [
        { emoji: '👋', name: 'wave' }, { emoji: '🤚', name: 'raised back hand' }, { emoji: '✋', name: 'raised hand' },
        { emoji: '🖖', name: 'vulcan' }, { emoji: '👌', name: 'ok hand' }, { emoji: '🤌', name: 'pinched fingers' },
        { emoji: '✌️', name: 'victory' }, { emoji: '🤞', name: 'crossed fingers' }, { emoji: '🤙', name: 'call me' },
        { emoji: '👈', name: 'point left' }, { emoji: '👉', name: 'point right' }, { emoji: '👆', name: 'point up' },
        { emoji: '👇', name: 'point down' }, { emoji: '👍', name: 'thumbs up' }, { emoji: '👎', name: 'thumbs down' },
        { emoji: '✊', name: 'raised fist' }, { emoji: '👊', name: 'oncoming fist' }, { emoji: '👏', name: 'clapping' },
        { emoji: '🙌', name: 'raising hands' }, { emoji: '👐', name: 'open hands' }, { emoji: '🤲', name: 'palms up' },
        { emoji: '🙏', name: 'folded hands' }, { emoji: '✍️', name: 'writing' }, { emoji: '💪', name: 'flexed bicep' },
        { emoji: '🫶', name: 'heart hands' }, { emoji: '🤝', name: 'handshake' }, { emoji: '🫂', name: 'people hugging' },
      ]
    },
    {
      icon: '❤️', label: 'Hearts', emojis: [
        { emoji: '❤️', name: 'red heart' }, { emoji: '🧡', name: 'orange heart' }, { emoji: '💛', name: 'yellow heart' },
        { emoji: '💚', name: 'green heart' }, { emoji: '💙', name: 'blue heart' }, { emoji: '💜', name: 'purple heart' },
        { emoji: '🖤', name: 'black heart' }, { emoji: '🤍', name: 'white heart' }, { emoji: '🤎', name: 'brown heart' },
        { emoji: '💔', name: 'broken heart' }, { emoji: '❣️', name: 'heart exclamation' }, { emoji: '💕', name: 'two hearts' },
        { emoji: '💞', name: 'revolving hearts' }, { emoji: '💓', name: 'beating heart' }, { emoji: '💗', name: 'growing heart' },
        { emoji: '💖', name: 'sparkling heart' }, { emoji: '💘', name: 'heart arrow' }, { emoji: '💝', name: 'heart ribbon' },
        { emoji: '💌', name: 'love letter' }, { emoji: '💋', name: 'kiss mark' }, { emoji: '😻', name: 'cat heart eyes' },
      ]
    },
    {
      icon: '🎉', label: 'Celebration', emojis: [
        { emoji: '🎉', name: 'party popper' }, { emoji: '🎊', name: 'confetti ball' }, { emoji: '🎈', name: 'balloon' },
        { emoji: '🎁', name: 'gift' }, { emoji: '🏆', name: 'trophy' }, { emoji: '🥇', name: 'gold medal' },
        { emoji: '🥈', name: 'silver medal' }, { emoji: '🥉', name: 'bronze medal' }, { emoji: '🎯', name: 'bullseye' },
        { emoji: '🎮', name: 'video game' }, { emoji: '🎲', name: 'dice' }, { emoji: '🎭', name: 'performing arts' },
        { emoji: '🎨', name: 'artist palette' }, { emoji: '🎤', name: 'microphone' }, { emoji: '🎵', name: 'music note' },
        { emoji: '🎶', name: 'notes' }, { emoji: '🥳', name: 'partying face' }, { emoji: '🍾', name: 'champagne' },
        { emoji: '🍻', name: 'beers' }, { emoji: '🥂', name: 'clinking glasses' }, { emoji: '🎂', name: 'birthday cake' },
      ]
    },
    {
      icon: '🔥', label: 'Symbols', emojis: [
        { emoji: '🔥', name: 'fire' }, { emoji: '✨', name: 'sparkles' }, { emoji: '⭐', name: 'star' },
        { emoji: '🌟', name: 'glowing star' }, { emoji: '💫', name: 'dizzy' }, { emoji: '⚡', name: 'lightning' },
        { emoji: '💥', name: 'collision' }, { emoji: '🌈', name: 'rainbow' }, { emoji: '☀️', name: 'sun' },
        { emoji: '🌙', name: 'crescent moon' }, { emoji: '💯', name: 'hundred' }, { emoji: '✅', name: 'check mark' },
        { emoji: '❌', name: 'cross mark' }, { emoji: '💢', name: 'anger symbol' }, { emoji: '💬', name: 'speech bubble' },
        { emoji: '💤', name: 'zzz' }, { emoji: '🔔', name: 'bell' }, { emoji: '📢', name: 'loudspeaker' },
        { emoji: '🚀', name: 'rocket' }, { emoji: '💎', name: 'gem' }, { emoji: '⚽', name: 'soccer' },
        { emoji: '🏀', name: 'basketball' }, { emoji: '🆗', name: 'ok' }, { emoji: '🆒', name: 'cool' },
      ]
    },
    {
      icon: '🐶', label: 'Animals', emojis: [
        { emoji: '🐶', name: 'dog' }, { emoji: '🐱', name: 'cat' }, { emoji: '🐭', name: 'mouse' },
        { emoji: '🐰', name: 'rabbit' }, { emoji: '🦊', name: 'fox' }, { emoji: '🐻', name: 'bear' },
        { emoji: '🐼', name: 'panda' }, { emoji: '🐨', name: 'koala' }, { emoji: '🐯', name: 'tiger' },
        { emoji: '🦁', name: 'lion' }, { emoji: '🐮', name: 'cow' }, { emoji: '🐷', name: 'pig' },
        { emoji: '🐸', name: 'frog' }, { emoji: '🐵', name: 'monkey' }, { emoji: '🦄', name: 'unicorn' },
        { emoji: '🦋', name: 'butterfly' }, { emoji: '🐢', name: 'turtle' }, { emoji: '🦖', name: 'trex' },
        { emoji: '🦕', name: 'sauropod' }, { emoji: '🦈', name: 'shark' }, { emoji: '🐬', name: 'dolphin' },
      ]
    },
    {
      icon: '🍎', label: 'Food', emojis: [
        { emoji: '🍎', name: 'apple' }, { emoji: '🍊', name: 'orange' }, { emoji: '🍋', name: 'lemon' },
        { emoji: '🍇', name: 'grapes' }, { emoji: '🍓', name: 'strawberry' }, { emoji: '🍒', name: 'cherries' },
        { emoji: '🥑', name: 'avocado' }, { emoji: '🍕', name: 'pizza' }, { emoji: '🍔', name: 'burger' },
        { emoji: '🌮', name: 'taco' }, { emoji: '🍣', name: 'sushi' }, { emoji: '🍜', name: 'noodles' },
        { emoji: '🍩', name: 'doughnut' }, { emoji: '🍪', name: 'cookie' }, { emoji: '🎂', name: 'cake' },
        { emoji: '🍫', name: 'chocolate' }, { emoji: '☕', name: 'coffee' }, { emoji: '🧋', name: 'bubble tea' },
        { emoji: '🍺', name: 'beer' }, { emoji: '🍷', name: 'wine' }, { emoji: '🧃', name: 'juice box' },
      ]
    },
  ];


  get visibleEmojis() {
    if (this.emojiSearch.trim()) return this.searchResults;
    return this.emojiCategories[this.activeCategory]?.emojis || [];
  }

  selectEmoji(e: string) {
    this.emojiSelect.emit(e);
  }

  onSearch() {
    const q = this.emojiSearch.toLowerCase();
    this.searchResults = this.emojiCategories
      .flatMap(c => c.emojis)
      .filter(e => e.name.includes(q));
  }
}
