import { ChangeDetectorRef, Component } from '@angular/core';

type FieldKind =
  | 'start'
  | 'trail'
  | 'mushroom'
  | 'wolf'
  | 'bog'
  | 'stream'
  | 'campfire'
  | 'bridge'
  | 'event'
  | 'finish';

interface BoardField {
  index: number;
  label: string;
  icon: string;
  kind: FieldKind;
  gridColumn: number;
  gridRow: number;
}

interface EventCard {
  title: string;
  text: string;
  points?: number;
  move?: number;
  skipNextTurn?: boolean;
  extraRoll?: boolean;
}

interface PlayerState {
  id: number;
  name: string;
  position: number;
  score: number;
  turns: number;
  skipNextTurn: boolean;
  extraRollAvailable: boolean;
}

type SoundName = 'click' | 'dice' | 'card' | 'bonus' | 'trap' | 'win' | 'forest';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly boardFields: BoardField[] = this.createBoard();
  readonly finishIndex = this.boardFields.length - 1;
  readonly eventDeck: EventCard[] = [
    { title: 'Koszyk grzybów', text: 'Znalazłeś koszyk grzybów. Otrzymujesz +3 żetony.', points: 3 },
    { title: 'Leśniczy', text: 'Spotkałeś leśniczego. Idziesz 2 pola do przodu.', move: 2 },
    { title: 'Zgubiona mapa', text: 'Zgubiłeś mapę. Cofasz się o 2 pola.', move: -2 },
    { title: 'Burza', text: 'Zaczęła się burza. Tracisz następną turę.', skipNextTurn: true },
    { title: 'Jagody', text: 'Znalazłeś jagody. Otrzymujesz +1 żeton.', points: 1 },
    { title: 'Wilk na drodze', text: 'Na drodze pojawił się wilk. Cofasz się o 3 pola.', move: -3 },
    { title: 'Ognisko', text: 'Odpoczywasz przy ognisku. Otrzymujesz dodatkowy rzut.', extraRoll: true },
    { title: 'Stary most', text: 'Znalazłeś stary most. Przechodzisz 2 pola do przodu.', move: 2 }
  ];
  readonly dieFaces: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };
  readonly dieFaceNumbers = [1, 2, 3, 4, 5, 6];

  gameStarted = false;
  players: PlayerState[] = [
    this.createPlayer(1, 'Gracz 1'),
    this.createPlayer(2, 'Gracz 2')
  ];
  activePlayerIndex = 0;
  winner: PlayerState | null = null;
  turns = 0;
  lastRoll: number | null = null;
  gameFinished = false;
  rollingDice = false;
  waitingToMove = false;
  movingPiece = false;
  drawingCard = false;
  resolvingField = false;
  musicEnabled = false;
  lastEventCard: EventCard | null = null;
  messages: string[] = [
    'Witaj w lesie. Kliknij „Rzuć kostką”, aby ruszyć ze STARTU.'
  ];

  private readonly sounds = new Map<SoundName, HTMLAudioElement>();
  private audioContext: AudioContext | null = null;
  private fallbackMusic:
    | { oscillator: OscillatorNode; gain: GainNode }
    | null = null;
  private movementTimerId: number | null = null;

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  get activePlayer(): PlayerState {
    return this.players[this.activePlayerIndex];
  }

  get playerPosition(): number {
    return this.activePlayer.position;
  }

  set playerPosition(position: number) {
    this.activePlayer.position = position;
  }

  get score(): number {
    return this.activePlayer.score;
  }

  set score(score: number) {
    this.activePlayer.score = score;
  }

  get skipNextTurn(): boolean {
    return this.activePlayer.skipNextTurn;
  }

  set skipNextTurn(skipNextTurn: boolean) {
    this.activePlayer.skipNextTurn = skipNextTurn;
  }

  get extraRollAvailable(): boolean {
    return this.activePlayer.extraRollAvailable;
  }

  set extraRollAvailable(extraRollAvailable: boolean) {
    this.activePlayer.extraRollAvailable = extraRollAvailable;
  }

  get currentField(): BoardField {
    return this.boardFields[this.playerPosition];
  }

  get dicePips(): number[] {
    if (this.rollingDice) {
      return this.dieFaces[6];
    }

    return this.dieFaces[this.lastRoll ?? 1];
  }

  get forestTokenIcons(): number[] {
    return Array.from({ length: Math.min(this.score, 12) }, (_, index) => index);
  }

  get hiddenTokenCount(): number {
    return Math.max(0, this.score - this.forestTokenIcons.length);
  }

  startGame(playerOneName: string, playerTwoName: string): void {
    this.playSound('click');
    this.players = [
      this.createPlayer(1, this.normalizePlayerName(playerOneName, 'Gracz 1')),
      this.createPlayer(2, this.normalizePlayerName(playerTwoName, 'Gracz 2'))
    ];
    this.resetRound();
    this.gameStarted = true;
    this.messages = [
      `Witajcie w lesie. Zaczyna ${this.activePlayer.name}.`
    ];
  }

  rollDice(): void {
    if (!this.gameStarted || this.gameFinished || this.rollingDice || this.waitingToMove || this.movingPiece || this.drawingCard || this.resolvingField) {
      return;
    }

    this.playSound('click');

    if (this.skipNextTurn) {
      const skippedPlayer = this.activePlayer.name;
      this.skipNextTurn = false;
      this.extraRollAvailable = false;
      this.turns += 1;
      this.activePlayer.turns += 1;
      this.lastRoll = null;
      this.playSound('trap');
      this.addMessages(...this.finishTurnIfNeeded(), `${skippedPlayer} traci tę turę. Pionek zostaje na miejscu.`);
      return;
    }

    this.rollingDice = true;
    this.playSound('dice');

    window.setTimeout(() => {
      const roll = Math.floor(Math.random() * 6) + 1;
      this.completeRoll(roll);
      this.changeDetector.detectChanges();
    }, 1640);
  }

  restartGame(): void {
    this.playSound('click');
    this.resetRound();
    this.gameStarted = true;
    this.messages = [
      `Nowa wyprawa rozpoczęta. Zaczyna ${this.activePlayer.name}.`
    ];
  }

  showStartScreen(): void {
    this.playSound('click');
    this.resetRound();
    this.gameStarted = false;
    this.messages = [
      'Wpisz imiona graczy i rozpocznij wyprawę.'
    ];
  }

  async toggleMusic(): Promise<void> {
    this.playSound('click');

    if (this.musicEnabled) {
      this.stopBackgroundMusic();
      this.musicEnabled = false;
      return;
    }

    try {
      const music = this.getAudio('forest');
      music.loop = true;
      music.volume = 0.28;
      music.currentTime = 0;
      await music.play();
      this.musicEnabled = true;
    } catch {
      try {
        this.startFallbackMusic();
        this.musicEnabled = true;
      } catch {
        this.musicEnabled = false;
        this.addMessages('Muzyka tła jest niedostępna, ale gra działa dalej.');
      }
    }
  }

  private completeRoll(roll: number): void {
    const previousPosition = this.playerPosition;
    const isBonusRoll = this.extraRollAvailable;
    const playerName = this.activePlayer.name;

    this.lastRoll = roll;
    this.rollingDice = false;
    this.waitingToMove = true;
    this.extraRollAvailable = false;

    if (!isBonusRoll) {
      this.turns += 1;
      this.activePlayer.turns += 1;
    }

    const stepsToMove = Math.min(roll, this.finishIndex - this.playerPosition);

    const turnText = isBonusRoll ? `${playerName}: dodatkowy rzut` : `${playerName}: tura ${this.activePlayer.turns}`;
    this.addMessages(`${turnText}: wynik ${roll}. Pionek ruszy za chwilę.`);
    this.movementTimerId = window.setTimeout(() => {
      this.waitingToMove = false;
      this.movingPiece = true;
      this.animateRolledMove(stepsToMove, previousPosition, turnText, roll);
      this.changeDetector.detectChanges();
    }, 2000);
  }

  private animateRolledMove(
    remainingSteps: number,
    startPosition: number,
    turnText: string,
    roll: number
  ): void {
    if (remainingSteps <= 0 || this.playerPosition === this.finishIndex) {
      this.finishRolledMove(startPosition, turnText, roll);
      return;
    }

    this.movementTimerId = window.setTimeout(() => {
      this.movePlayer(1);
      this.changeDetector.detectChanges();

      this.animateRolledMove(remainingSteps - 1, startPosition, turnText, roll);
    }, 920);
  }

  private finishRolledMove(startPosition: number, turnText: string, roll: number): void {
    this.movingPiece = false;
    this.waitingToMove = false;
    this.clearMovementTimer();

    const moveMessage = `${turnText}: wynik ${roll}. Przechodzisz z pola ${startPosition + 1} na ${this.playerPosition + 1}.`;

    if (this.currentField.kind === 'event') {
      this.resolvingField = true;
      this.addMessages('Stajesz na polu karty. Talia zaraz się przetasuje.', moveMessage);
      this.startCardDrawSequence();
      this.changeDetector.detectChanges();
      return;
    }

    if (this.currentField.kind === 'stream') {
      this.resolvingField = true;
      this.playSound('trap');
      this.addMessages('Rwący strumień porwał pionek. Za chwilę cofniesz się o 2 pola.', moveMessage);
      this.startFieldMoveSequence(-2, 'Strumień cofnął cię o 2 pola.');
      this.changeDetector.detectChanges();
      return;
    }

    const fieldMessages = this.resolveCurrentField();
    this.addMessages(...this.finishTurnIfNeeded(), ...fieldMessages, moveMessage);
    this.changeDetector.detectChanges();
  }

  private startCardDrawSequence(): void {
    this.movementTimerId = window.setTimeout(() => {
      this.drawingCard = true;
      this.changeDetector.detectChanges();

      this.movementTimerId = window.setTimeout(() => {
        this.drawingCard = false;
        this.resolvingField = false;
        const cardMessages = this.drawEventCard();
        this.addMessages(...this.finishTurnIfNeeded(), ...cardMessages);
        this.changeDetector.detectChanges();
      }, 1400);
    }, 1000);
  }

  private startFieldMoveSequence(steps: number, summaryMessage: string): void {
    const direction = steps > 0 ? 1 : -1;
    const availableSteps = direction > 0
      ? this.finishIndex - this.playerPosition
      : this.playerPosition;
    const stepsToMove = Math.min(Math.abs(steps), availableSteps);

    this.movementTimerId = window.setTimeout(() => {
      this.movingPiece = true;
      this.animateFieldMove(stepsToMove, direction, summaryMessage);
      this.changeDetector.detectChanges();
    }, 800);
  }

  private animateFieldMove(remainingSteps: number, direction: number, summaryMessage: string): void {
    if (remainingSteps <= 0) {
      this.movingPiece = false;
      this.resolvingField = false;
      const finishMessages = this.finishIfNeeded();
      this.addMessages(...this.finishTurnIfNeeded(), `${summaryMessage} Teraz jesteś na polu ${this.playerPosition + 1}.`, ...finishMessages);
      this.changeDetector.detectChanges();
      return;
    }

    this.movementTimerId = window.setTimeout(() => {
      this.movePlayer(direction);
      this.changeDetector.detectChanges();
      this.animateFieldMove(remainingSteps - 1, direction, summaryMessage);
    }, 920);
  }

  private resolveCurrentField(): string[] {
    const field = this.currentField;

    switch (field.kind) {
      case 'start':
        return ['START: wyprawa czeka na pierwszy krok.'];
      case 'trail':
        return [`${field.icon} ${field.label}: spokojny krok przez las. Brak efektu.`];
      case 'mushroom':
        this.changeScore(2);
        this.playSound('bonus');
        return ['Znalazłeś grzyby. Otrzymujesz 2 żetony leśne.'];
      case 'wolf':
        this.changeScore(-2);
        this.movePlayer(-1);
        this.playSound('trap');
        return [`Spotkałeś wilka. Tracisz 2 żetony i cofasz się o 1 pole. Teraz jesteś na polu ${this.playerPosition + 1}.`];
      case 'bog':
        this.skipNextTurn = true;
        this.playSound('trap');
        return ['Wpadłeś w bagno. Tracisz następną turę.'];
      case 'stream':
        this.movePlayer(-2);
        this.playSound('trap');
        return [`Rwący strumień cofa cię o 2 pola. Teraz jesteś na polu ${this.playerPosition + 1}.`];
      case 'campfire':
        this.changeScore(1);
        this.extraRollAvailable = true;
        this.playSound('bonus');
        return ['Odpoczywasz przy ognisku. Otrzymujesz 1 żeton i dodatkowy rzut.'];
      case 'bridge':
        this.movePlayer(3);
        this.playSound('bonus');
        return [`Przechodzisz przez mostek. Idziesz 3 pola do przodu. Teraz jesteś na polu ${this.playerPosition + 1}.`, ...this.finishIfNeeded()];
      case 'event':
        return this.drawEventCard();
      case 'finish':
        return this.finishGame();
      default:
        return [];
    }
  }

  private drawEventCard(): string[] {
    const card = this.eventDeck[Math.floor(Math.random() * this.eventDeck.length)];
    const messages = [`Dobierasz kartę zdarzenia: ${card.text}`];

    this.lastEventCard = card;
    this.playSound('card');

    if (card.points) {
      this.changeScore(card.points);
      this.playSound(card.points > 0 ? 'bonus' : 'trap');
    }

    if (card.move) {
      this.movePlayer(card.move);
      this.playSound(card.move > 0 ? 'bonus' : 'trap');
      messages.push(`Po karcie jesteś na polu ${this.playerPosition + 1}.`);
    }

    if (card.skipNextTurn) {
      this.skipNextTurn = true;
      this.playSound('trap');
      messages.push('Następny rzut pomija ruch.');
    }

    if (card.extraRoll) {
      this.extraRollAvailable = true;
      this.playSound('bonus');
      messages.push('Możesz od razu rzucić jeszcze raz. Dodatkowy rzut nie zwiększa licznika tur.');
    }

    return [...messages, ...this.finishIfNeeded()];
  }

  private finishIfNeeded(): string[] {
    return this.playerPosition === this.finishIndex ? this.finishGame() : [];
  }

  private finishGame(): string[] {
    const winnerName = this.activePlayer.name;
    this.playerPosition = this.finishIndex;
    this.gameFinished = true;
    this.winner = this.activePlayer;
    this.skipNextTurn = false;
    this.extraRollAvailable = false;
    this.rollingDice = false;
    this.waitingToMove = false;
    this.movingPiece = false;
    this.drawingCard = false;
    this.resolvingField = false;
    this.clearMovementTimer();
    this.playSound('win');
    return [`${winnerName} dociera do mety. Koniec gry.`];
  }

  private finishTurnIfNeeded(): string[] {
    if (this.gameFinished) {
      return [];
    }

    if (this.extraRollAvailable) {
      return [`${this.activePlayer.name} ma dodatkowy rzut.`];
    }

    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
    return [`Teraz ruch gracza ${this.activePlayer.name}.`];
  }

  private movePlayer(steps: number): void {
    this.playerPosition = Math.max(0, Math.min(this.finishIndex, this.playerPosition + steps));
  }

  private changeScore(points: number): void {
    this.score = Math.max(0, this.score + points);
  }

  private addMessages(...newMessages: string[]): void {
    this.messages = [...newMessages, ...this.messages].slice(0, 8);
  }

  playersOnField(fieldIndex: number): PlayerState[] {
    return this.players.filter((player) => player.position === fieldIndex);
  }

  hasPlayerOnField(fieldIndex: number): boolean {
    return this.players.some((player) => player.position === fieldIndex);
  }

  private resetRound(): void {
    this.clearMovementTimer();
    this.players = this.players.map((player) => ({
      ...player,
      position: 0,
      score: 0,
      turns: 0,
      skipNextTurn: false,
      extraRollAvailable: false
    }));
    this.activePlayerIndex = 0;
    this.winner = null;
    this.turns = 0;
    this.lastRoll = null;
    this.gameFinished = false;
    this.rollingDice = false;
    this.waitingToMove = false;
    this.movingPiece = false;
    this.drawingCard = false;
    this.resolvingField = false;
    this.lastEventCard = null;
  }

  private createPlayer(id: number, name: string): PlayerState {
    return {
      id,
      name,
      position: 0,
      score: 0,
      turns: 0,
      skipNextTurn: false,
      extraRollAvailable: false
    };
  }

  private normalizePlayerName(name: string, fallback: string): string {
    const trimmedName = name.trim();
    return trimmedName.length > 0 ? trimmedName : fallback;
  }

  private clearMovementTimer(): void {
    if (this.movementTimerId === null) {
      return;
    }

    window.clearTimeout(this.movementTimerId);
    this.movementTimerId = null;
  }

  private getAudio(sound: SoundName): HTMLAudioElement {
    const cachedSound = this.sounds.get(sound);

    if (cachedSound) {
      return cachedSound;
    }

    const audio = new Audio(`/sounds/${sound}.mp3`);
    audio.preload = 'auto';
    this.sounds.set(sound, audio);
    return audio;
  }

  private playSound(sound: SoundName): void {
    if (sound === 'forest') {
      return;
    }

    try {
      const audio = this.getAudio(sound);
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch(() => this.playFallbackTone(sound));
    } catch {
      this.playFallbackTone(sound);
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    return this.audioContext;
  }

  private playFallbackTone(sound: SoundName): void {
    try {
      const context = this.getAudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const frequencies: Record<SoundName, number> = {
        click: 420,
        dice: 190,
        card: 520,
        bonus: 680,
        trap: 120,
        win: 760,
        forest: 90
      };

      oscillator.frequency.value = frequencies[sound];
      oscillator.type = sound === 'trap' ? 'sawtooth' : 'sine';
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      // Audio is optional. Missing files or blocked playback must never stop the game.
    }
  }

  private startFallbackMusic(): void {
    const context = this.getAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = 92;
    oscillator.type = 'sine';
    gain.gain.value = 0.025;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    this.fallbackMusic = { oscillator, gain };
  }

  private stopBackgroundMusic(): void {
    try {
      const music = this.sounds.get('forest');
      music?.pause();

      if (music) {
        music.currentTime = 0;
      }
    } catch {
      // Background music is optional.
    }

    try {
      this.fallbackMusic?.oscillator.stop();
      this.fallbackMusic?.gain.disconnect();
      this.fallbackMusic = null;
    } catch {
      this.fallbackMusic = null;
    }
  }

  private createBoard(): BoardField[] {
    const path: Array<Omit<BoardField, 'index' | 'gridColumn' | 'gridRow'>> = [
      { label: 'START', icon: '🏕️', kind: 'start' },
      { label: 'Las', icon: '🌲', kind: 'trail' },
      { label: 'Grzyby', icon: '🍄', kind: 'mushroom' },
      { label: 'Bagno', icon: '🟫', kind: 'bog' },
      { label: 'Strumień', icon: '💧', kind: 'stream' },
      { label: 'Mostek', icon: '🪵', kind: 'bridge' },
      { label: 'Karta', icon: '🎴', kind: 'event' },
      { label: 'Wilk', icon: '🐺', kind: 'wolf' },
      { label: 'Ognisko', icon: '🔥', kind: 'campfire' },
      { label: 'Paprocie', icon: '🌿', kind: 'trail' },
      { label: 'Grzyby', icon: '🍄', kind: 'mushroom' },
      { label: 'Cień', icon: '🌫️', kind: 'trail' },
      { label: 'Strumień', icon: '💧', kind: 'stream' },
      { label: 'Karta', icon: '🎴', kind: 'event' },
      { label: 'Mech', icon: '🍃', kind: 'trail' },
      { label: 'Bagno', icon: '🟫', kind: 'bog' },
      { label: 'Mostek', icon: '🪵', kind: 'bridge' },
      { label: 'Wilk', icon: '🐺', kind: 'wolf' },
      { label: 'Grzyby', icon: '🍄', kind: 'mushroom' },
      { label: 'Ognisko', icon: '🔥', kind: 'campfire' },
      { label: 'Karta', icon: '🎴', kind: 'event' },
      { label: 'Korzeń', icon: '🪵', kind: 'trail' },
      { label: 'Rzeka', icon: '💧', kind: 'stream' },
      { label: 'Dąb', icon: '🌳', kind: 'trail' },
      { label: 'Bagno', icon: '🟫', kind: 'bog' },
      { label: 'Grzyby', icon: '🍄', kind: 'mushroom' },
      { label: 'Mostek', icon: '🪵', kind: 'bridge' },
      { label: 'Karta', icon: '🎴', kind: 'event' },
      { label: 'Wilk', icon: '🐺', kind: 'wolf' },
      { label: 'Polana', icon: '🌼', kind: 'trail' },
      { label: 'Ognisko', icon: '🔥', kind: 'campfire' },
      { label: 'Strumień', icon: '💧', kind: 'stream' },
      { label: 'Grzyby', icon: '🍄', kind: 'mushroom' },
      { label: 'Karta', icon: '🎴', kind: 'event' },
      { label: 'Finał', icon: '🌲', kind: 'trail' },
      { label: 'META', icon: '🏁', kind: 'finish' }
    ];

    return path.map((field, index) => {
      const rowFromBottom = Math.floor(index / 6);
      const columnInRow = index % 6;
      const isReverseRow = rowFromBottom % 2 === 1;

      return {
        ...field,
        index,
        gridColumn: isReverseRow ? 6 - columnInRow : columnInRow + 1,
        gridRow: 6 - rowFromBottom
      };
    });
  }
}
