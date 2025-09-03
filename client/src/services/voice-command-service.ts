interface VoiceCommand {
  patterns: string[];
  action: (params?: any) => void;
  description: string;
  category: 'navigation' | 'filter' | 'playback' | 'search' | 'help';
}

interface VoiceCommandState {
  isListening: boolean;
  transcript: string;
  error: string | null;
  lastCommand: string | null;
  confidence: number;
}

class VoiceCommandService {
  private recognition: any = null;
  private commands: Map<string, VoiceCommand> = new Map();
  private listeners: Set<(state: VoiceCommandState) => void> = new Set();
  private state: VoiceCommandState = {
    isListening: false,
    transcript: '',
    error: null,
    lastCommand: null,
    confidence: 0
  };
  private isSupported: boolean = false;
  private continuousMode: boolean = false;
  private language: string = 'en-US';

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser');
      this.isSupported = false;
      return;
    }

    this.isSupported = true;
    this.recognition = new SpeechRecognition();
    
    // Configure recognition
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 3;
    this.recognition.lang = this.language;

    // Set up event handlers
    this.setupEventHandlers();
    
    // Register default commands
    this.registerDefaultCommands();
  }

  private setupEventHandlers() {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      this.updateState({ 
        isListening: true, 
        error: null,
        transcript: '' 
      });
      console.log('Voice recognition started');
    };

    this.recognition.onend = () => {
      this.updateState({ isListening: false });
      
      // Restart if in continuous mode
      if (this.continuousMode && this.state.isListening) {
        setTimeout(() => this.start(), 100);
      }
      
      console.log('Voice recognition ended');
    };

    this.recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      let maxConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.toLowerCase().trim();
        const confidence = result[0].confidence || 0.5;

        if (result.isFinal) {
          finalTranscript += transcript;
          maxConfidence = Math.max(maxConfidence, confidence);
        } else {
          interimTranscript += transcript;
        }
      }

      // Update transcript in real-time
      this.updateState({ 
        transcript: finalTranscript || interimTranscript,
        confidence: maxConfidence
      });

      // Process final commands
      if (finalTranscript) {
        this.processCommand(finalTranscript, maxConfidence);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      let errorMessage = 'Voice recognition error';
      switch (event.error) {
        case 'network':
          errorMessage = 'Network error occurred';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone access denied';
          break;
        case 'no-speech':
          errorMessage = 'No speech detected';
          break;
        case 'aborted':
          errorMessage = 'Recognition cancelled';
          break;
      }
      
      this.updateState({ 
        error: errorMessage, 
        isListening: false 
      });
    };

    this.recognition.onnomatch = () => {
      console.log('No command matched');
      this.updateState({ 
        error: 'Command not recognized',
        lastCommand: null
      });
    };
  }

  private registerDefaultCommands() {
    // Navigation commands
    this.registerCommand({
      patterns: ['go to dashboard', 'open dashboard', 'show dashboard'],
      action: () => window.location.href = '/',
      description: 'Navigate to dashboard',
      category: 'navigation'
    });

    this.registerCommand({
      patterns: ['go to analytics', 'open analytics', 'show analytics'],
      action: () => window.location.href = '/analytics',
      description: 'Navigate to analytics',
      category: 'navigation'
    });

    this.registerCommand({
      patterns: ['go to hospital', 'open hospital', 'show hospital calls'],
      action: () => window.location.href = '/hospital',
      description: 'Navigate to hospital calls',
      category: 'navigation'
    });

    this.registerCommand({
      patterns: ['go to settings', 'open settings', 'show settings'],
      action: () => window.location.href = '/admin',
      description: 'Navigate to settings',
      category: 'navigation'
    });

    this.registerCommand({
      patterns: ['go back', 'back', 'previous page'],
      action: () => window.history.back(),
      description: 'Go back to previous page',
      category: 'navigation'
    });

    // Filter commands
    this.registerCommand({
      patterns: ['show medical calls', 'filter medical', 'medical only'],
      action: () => this.triggerFilter('medical'),
      description: 'Show only medical calls',
      category: 'filter'
    });

    this.registerCommand({
      patterns: ['show fire calls', 'filter fire', 'fire only'],
      action: () => this.triggerFilter('fire'),
      description: 'Show only fire calls',
      category: 'filter'
    });

    this.registerCommand({
      patterns: ['show all calls', 'clear filter', 'remove filter'],
      action: () => this.triggerFilter('all'),
      description: 'Show all calls',
      category: 'filter'
    });

    // Playback commands
    this.registerCommand({
      patterns: ['play audio', 'play', 'start playback'],
      action: () => this.triggerPlayback('play'),
      description: 'Play audio',
      category: 'playback'
    });

    this.registerCommand({
      patterns: ['pause audio', 'pause', 'stop playback'],
      action: () => this.triggerPlayback('pause'),
      description: 'Pause audio',
      category: 'playback'
    });

    this.registerCommand({
      patterns: ['next audio', 'next', 'skip'],
      action: () => this.triggerPlayback('next'),
      description: 'Play next audio',
      category: 'playback'
    });

    this.registerCommand({
      patterns: ['previous audio', 'previous', 'back audio'],
      action: () => this.triggerPlayback('previous'),
      description: 'Play previous audio',
      category: 'playback'
    });

    // Help commands
    this.registerCommand({
      patterns: ['help', 'show commands', 'what can you do'],
      action: () => this.showHelp(),
      description: 'Show available commands',
      category: 'help'
    });

    this.registerCommand({
      patterns: ['stop listening', 'stop', 'cancel'],
      action: () => this.stop(),
      description: 'Stop voice recognition',
      category: 'help'
    });
  }

  public registerCommand(command: VoiceCommand) {
    command.patterns.forEach(pattern => {
      this.commands.set(pattern.toLowerCase(), command);
    });
  }

  private processCommand(transcript: string, confidence: number) {
    const normalizedTranscript = transcript.toLowerCase().trim();
    
    // Try exact match first
    let matchedCommand = this.commands.get(normalizedTranscript);
    
    // Try fuzzy matching if no exact match
    if (!matchedCommand) {
      matchedCommand = this.findBestMatch(normalizedTranscript);
    }

    if (matchedCommand) {
      console.log(`Executing command: ${normalizedTranscript} (confidence: ${confidence})`);
      this.updateState({ 
        lastCommand: normalizedTranscript,
        confidence 
      });
      
      // Add a small delay for visual feedback
      setTimeout(() => {
        matchedCommand!.action();
      }, 200);
      
      // Announce command execution for accessibility
      this.announce(`Executing: ${matchedCommand.description}`);
    } else {
      console.log(`No command found for: ${normalizedTranscript}`);
      this.updateState({ 
        error: `Command not recognized: "${normalizedTranscript}"`,
        lastCommand: null 
      });
      this.announce('Command not recognized');
    }
  }

  private findBestMatch(transcript: string): VoiceCommand | null {
    let bestMatch: VoiceCommand | null = null;
    let bestScore = 0;
    const threshold = 0.7; // Similarity threshold

    for (const [pattern, command] of this.commands.entries()) {
      const score = this.calculateSimilarity(transcript, pattern);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = command;
      }
    }

    return bestMatch;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    
    let matches = 0;
    for (const word1 of words1) {
      if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
        matches++;
      }
    }
    
    return matches / Math.max(words1.length, words2.length);
  }

  private triggerFilter(type: string) {
    // Dispatch custom event that components can listen to
    window.dispatchEvent(new CustomEvent('voice-filter', { 
      detail: { type } 
    }));
  }

  private triggerPlayback(action: string) {
    // Dispatch custom event for playback control
    window.dispatchEvent(new CustomEvent('voice-playback', { 
      detail: { action } 
    }));
  }

  private showHelp() {
    const commandsByCategory = new Map<string, VoiceCommand[]>();
    
    this.commands.forEach(command => {
      if (!commandsByCategory.has(command.category)) {
        commandsByCategory.set(command.category, []);
      }
      const commands = commandsByCategory.get(command.category)!;
      if (!commands.some(c => c.description === command.description)) {
        commands.push(command);
      }
    });

    // Dispatch event with available commands
    window.dispatchEvent(new CustomEvent('voice-help', { 
      detail: { commands: commandsByCategory } 
    }));
  }

  private announce(message: string) {
    // Create an invisible aria-live region for screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.style.position = 'absolute';
    announcement.style.left = '-10000px';
    announcement.style.width = '1px';
    announcement.style.height = '1px';
    announcement.style.overflow = 'hidden';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  private updateState(partial: Partial<VoiceCommandState>) {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }

  public subscribe(listener: (state: VoiceCommandState) => void) {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  public start() {
    if (!this.isSupported) {
      this.updateState({ 
        error: 'Voice commands not supported in this browser' 
      });
      return;
    }

    if (this.state.isListening) {
      return;
    }

    this.recognition.start();
  }

  public stop() {
    if (!this.recognition || !this.state.isListening) {
      return;
    }

    this.continuousMode = false;
    this.recognition.stop();
  }

  public setContinuousMode(enabled: boolean) {
    this.continuousMode = enabled;
    if (enabled && !this.state.isListening) {
      this.start();
    } else if (!enabled && this.state.isListening) {
      this.stop();
    }
  }

  public setLanguage(lang: string) {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public getState(): VoiceCommandState {
    return this.state;
  }

  public isAvailable(): boolean {
    return this.isSupported;
  }

  public getCommands(): Map<string, VoiceCommand> {
    return this.commands;
  }
}

// Create singleton instance
export const voiceCommandService = new VoiceCommandService();
export type { VoiceCommand, VoiceCommandState };