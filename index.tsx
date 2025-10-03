/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

// FIX: Add type definitions for Web Speech API to resolve TypeScript errors.
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
}

import {GoogleGenAI} from '@google/genai';
import {marked} from 'marked';

const MODEL_NAME = 'gemini-2.5-flash';

interface Note {
  id: string;
  title: string;
  rawTranscription: string;
  polishedNote: string;
  timestamp: number;
}

class VoiceNotesApp {
  private genAI: any;
  private mediaRecorder: MediaRecorder | null = null;
  private recordButton: HTMLButtonElement;
  private recordingStatus: HTMLDivElement;
  private rawTranscription: HTMLDivElement;
  private polishedNote: HTMLDivElement;
  private newButton: HTMLButtonElement;
  private themeToggleButton: HTMLButtonElement;
  private exportButton: HTMLButtonElement;
  private exportMenu: HTMLDivElement;
  private themeToggleIcon: HTMLElement;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private currentNote: Note | null = null;
  private stream: MediaStream | null = null;
  private editorTitle: HTMLDivElement;

  private recordingInterface: HTMLDivElement;
  private liveRecordingTitle: HTMLDivElement;
  private liveWaveformCanvas: HTMLCanvasElement | null;
  private liveWaveformCtx: CanvasRenderingContext2D | null = null;
  private liveRecordingTimerDisplay: HTMLDivElement;
  private statusIndicatorDiv: HTMLDivElement | null;

  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private waveformDataArray: Uint8Array | null = null;
  private waveformDrawingId: number | null = null;
  private timerIntervalId: number | null = null;
  private recordingStartTime: number = 0;
  private autoSaveIntervalId: number | null = null;
  private readonly AUTO_SAVE_INTERVAL = 2000; // 2 seconds
  private saveStatus: HTMLDivElement;
  private saveTimeoutId: number | null = null;

  // Note persistence properties
  private notes: Note[] = [];
  private sidebar: HTMLElement;
  private notesList: HTMLElement;
  private sidebarToggleButton: HTMLButtonElement;
  private sidebarCloseButton: HTMLButtonElement;
  private sidebarOverlay: HTMLDivElement;
  private readonly LOCAL_STORAGE_KEY = 'voice-notes-app-data';
  private mainContent: HTMLElement;

  // Tab navigation properties
  private tabNav: HTMLElement;
  private tabButtons: NodeListOf<HTMLButtonElement>;
  private activeTabIndicator: HTMLDivElement;
  private noteContents: NodeListOf<HTMLDivElement>;
  private noteContentWrapper: HTMLDivElement;

  // Formatting toolbar
  private formattingToolbar: HTMLDivElement;

  // Voice command properties
  private speechRecognition: SpeechRecognition | null = null;
  private isListeningForCommands = false;
  private voiceCommandButton: HTMLButtonElement;

  constructor() {
    this.genAI = new GoogleGenAI({apiKey: process.env.API_KEY!});
    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    this.recordButton = document.getElementById(
      'recordButton',
    ) as HTMLButtonElement;
    this.recordingStatus = document.getElementById(
      'recordingStatus',
    ) as HTMLDivElement;
    this.rawTranscription = document.getElementById(
      'rawTranscription',
    ) as HTMLDivElement;
    this.polishedNote = document.getElementById(
      'polishedNote',
    ) as HTMLDivElement;
    this.newButton = document.getElementById('newButton') as HTMLButtonElement;
    this.exportButton = document.getElementById(
      'exportButton',
    ) as HTMLButtonElement;
    this.exportMenu = document.getElementById('exportMenu') as HTMLDivElement;
    this.themeToggleButton = document.getElementById(
      'themeToggleButton',
    ) as HTMLButtonElement;
    this.themeToggleIcon = this.themeToggleButton.querySelector(
      'i',
    ) as HTMLElement;
    this.editorTitle = document.querySelector(
      '.editor-title',
    ) as HTMLDivElement;
    this.saveStatus = document.getElementById('saveStatus') as HTMLDivElement;
    this.sidebar = document.getElementById('notesSidebar') as HTMLElement;
    this.notesList = document.getElementById('notesList') as HTMLElement;
    this.sidebarToggleButton = document.getElementById(
      'sidebarToggleButton',
    ) as HTMLButtonElement;
    this.sidebarCloseButton = document.getElementById(
      'sidebarCloseButton',
    ) as HTMLButtonElement;
    this.sidebarOverlay = document.getElementById(
      'sidebarOverlay',
    ) as HTMLDivElement;
    this.mainContent = document.querySelector(
      '.main-content',
    ) as HTMLElement;

    this.recordingInterface = document.querySelector(
      '.recording-interface',
    ) as HTMLDivElement;
    this.liveRecordingTitle = document.getElementById(
      'liveRecordingTitle',
    ) as HTMLDivElement;
    this.liveWaveformCanvas = document.getElementById(
      'liveWaveformCanvas',
    ) as HTMLCanvasElement;
    this.liveRecordingTimerDisplay = document.getElementById(
      'liveRecordingTimerDisplay',
    ) as HTMLDivElement;

    // Tab elements
    this.tabNav = document.querySelector('.tab-navigation') as HTMLElement;
    this.tabButtons = this.tabNav.querySelectorAll('.tab-button');
    this.activeTabIndicator = this.tabNav.querySelector(
      '.active-tab-indicator',
    ) as HTMLDivElement;
    this.noteContents = document.querySelectorAll(
      '.note-content',
    ) as NodeListOf<HTMLDivElement>;
    this.noteContentWrapper = document.querySelector(
      '.note-content-wrapper',
    ) as HTMLDivElement;

    // Formatting toolbar
    this.formattingToolbar = document.getElementById(
      'formattingToolbar',
    ) as HTMLDivElement;

    // Voice command elements
    this.voiceCommandButton = document.getElementById(
      'voiceCommandButton',
    ) as HTMLButtonElement;

    if (this.liveWaveformCanvas) {
      this.liveWaveformCtx = this.liveWaveformCanvas.getContext('2d');
    } else {
      console.warn(
        'Live waveform canvas element not found. Visualizer will not work.',
      );
    }

    if (this.recordingInterface) {
      this.statusIndicatorDiv = this.recordingInterface.querySelector(
        '.status-indicator',
      ) as HTMLDivElement;
    } else {
      console.warn('Recording interface element not found.');
      this.statusIndicatorDiv = null;
    }

    this.bindEventListeners();
    this.initTheme();
    this.loadNotes();
    this.initializeSpeechRecognition();
    this.setupInitialTabState();

    this.autoSaveIntervalId = window.setInterval(
      () => this.autoSave(),
      this.AUTO_SAVE_INTERVAL,
    );

    this.recordingStatus.textContent = 'Ready to record';
  }

  private bindEventListeners(): void {
    document.addEventListener('keydown', (e) => this.handleGlobalKeyDown(e));
    this.recordButton.addEventListener('click', () => this.toggleRecording());
    this.newButton.addEventListener('click', () => this.createNewNote());
    this.themeToggleButton.addEventListener('click', () => this.toggleTheme());
    this.voiceCommandButton.addEventListener('click', () =>
      this.toggleVoiceCommands(),
    );
    this.exportButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleExportMenu();
    });
    this.exportMenu.addEventListener('click', (e) =>
      this.handleExportOptionClick(e),
    );
    document.addEventListener('click', (e) => {
      if (
        this.exportMenu.classList.contains('visible') &&
        !this.exportButton.contains(e.target as Node) &&
        !this.exportMenu.contains(e.target as Node)
      ) {
        this.exportMenu.classList.remove('visible');
      }
    });

    window.addEventListener('resize', this.handleResize.bind(this));
    this.sidebarToggleButton.addEventListener('click', () =>
      this.toggleSidebar(),
    );
    this.sidebarCloseButton.addEventListener('click', () =>
      this.toggleSidebar(),
    );
    this.sidebarOverlay.addEventListener('click', () =>
      this.toggleSidebar(),
    );
    this.notesList.addEventListener('click', (e) =>
      this.handleNoteListClick(e),
    );
    this.editorTitle.addEventListener('blur', () => this.handleTitleChange());

    // Add new event listeners for the rich text editor
    this.polishedNote.addEventListener('paste', (e) =>
      this.handlePaste(e as ClipboardEvent),
    );
    this.polishedNote.addEventListener('keydown', (e) =>
      this.handleKeyDown(e as KeyboardEvent),
    );
    this.polishedNote.addEventListener('change', (e) =>
      this.handleCheckboxChange(e),
    );
    this.polishedNote.addEventListener('blur', () =>
      this.hideFormattingToolbar(),
    );
    document.addEventListener('selectionchange', () =>
      this.handleSelectionChange(),
    );
    this.formattingToolbar.addEventListener('mousedown', (e) =>
      e.preventDefault(),
    );
    this.formattingToolbar.addEventListener('click', (e) =>
      this.handleToolbarClick(e),
    );
    this.noteContentWrapper.addEventListener('scroll', () =>
      this.hideFormattingToolbar(),
    );

    this.tabButtons.forEach((button) => {
      button.addEventListener('click', (e) => {
        const tabName = (e.currentTarget as HTMLElement).dataset.tab;
        if (tabName === 'note' || tabName === 'raw') {
          this.setActiveTab(tabName);
        }
      });
    });
  }

  private handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this.hideFormattingToolbar();
      return;
    }

    const range = selection.getRangeAt(0);
    // Check if selection is inside our polishedNote editor
    if (!this.polishedNote.contains(range.commonAncestorContainer)) {
      this.hideFormattingToolbar();
      return;
    }

    if (selection.isCollapsed) {
      this.hideFormattingToolbar();
      return;
    }

    this.showFormattingToolbar(selection);
  }

  private showFormattingToolbar(selection: Selection): void {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = this.noteContentWrapper.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      this.hideFormattingToolbar();
      return;
    }

    // Position the toolbar above the selection
    let top =
      rect.top -
      containerRect.top +
      this.noteContentWrapper.scrollTop -
      this.formattingToolbar.offsetHeight -
      8;
    let left =
      rect.left -
      containerRect.left +
      this.noteContentWrapper.scrollLeft +
      rect.width / 2 -
      this.formattingToolbar.offsetWidth / 2;

    // Ensure toolbar doesn't go off the top
    if (top < this.noteContentWrapper.scrollTop) {
      top =
        rect.bottom - containerRect.top + this.noteContentWrapper.scrollTop + 8;
    }

    // Ensure toolbar doesn't go off the sides
    const minLeft = this.noteContentWrapper.scrollLeft + 4;
    const maxLeft =
      this.noteContentWrapper.scrollLeft +
      containerRect.width -
      this.formattingToolbar.offsetWidth -
      4;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    this.formattingToolbar.style.top = `${top}px`;
    this.formattingToolbar.style.left = `${left}px`;
    this.formattingToolbar.classList.add('visible');

    this.updateToolbarState();
  }

  private hideFormattingToolbar(): void {
    if (this.formattingToolbar.classList.contains('visible')) {
      this.formattingToolbar.classList.remove('visible');
    }
  }

  private handleToolbarClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const button = target.closest('button');
    if (!button) return;

    const command = button.dataset.command;
    if (command) {
      document.execCommand(command, false, undefined);
      this.polishedNote.focus(); // Re-focus the editor
      this.updateToolbarState(); // Update active states after command
    }
  }

  private updateToolbarState(): void {
    ['bold', 'italic', 'insertUnorderedList'].forEach((command) => {
      const button = this.formattingToolbar.querySelector(
        `[data-command="${command}"]`,
      );
      if (button) {
        button.classList.toggle('active', document.queryCommandState(command));
      }
    });
  }

  private setupInitialTabState(): void {
    const initiallyActiveButton = this.tabNav.querySelector(
      '.tab-button.active',
    );
    if (initiallyActiveButton) {
      const tabName = initiallyActiveButton.getAttribute('data-tab');
      if (tabName === 'note' || tabName === 'raw') {
        requestAnimationFrame(() => {
          this.setActiveTab(tabName, true);
        });
      }
    }
  }

  public setActiveTab(tabName: 'note' | 'raw', skipAnimation = false): void {
    const activeButton = this.tabNav.querySelector(
      `[data-tab="${tabName}"]`,
    ) as HTMLButtonElement;
    if (!activeButton || !this.activeTabIndicator) return;

    this.tabButtons.forEach((btn) => btn.classList.remove('active'));
    activeButton.classList.add('active');

    this.noteContents.forEach((content) => content.classList.remove('active'));

    if (tabName === 'raw') {
      document.getElementById('rawTranscription')?.classList.add('active');
    } else {
      document.getElementById('polishedNote')?.classList.add('active');
    }

    const originalTransition = this.activeTabIndicator.style.transition;
    if (skipAnimation) {
      this.activeTabIndicator.style.transition = 'none';
    } else {
      this.activeTabIndicator.style.transition = '';
    }

    this.activeTabIndicator.style.left = `${activeButton.offsetLeft}px`;
    this.activeTabIndicator.style.width = `${activeButton.offsetWidth}px`;

    if (skipAnimation) {
      // This is a trick to flush CSS changes before re-enabling transitions
      this.activeTabIndicator.offsetHeight;
      this.activeTabIndicator.style.transition = originalTransition;
    }
  }

  private initializeSpeechRecognition(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported by this browser.');
      this.voiceCommandButton.style.display = 'none';
      return;
    }

    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.lang = 'en-US';

    this.speechRecognition.onresult = this.handleSpeechResult.bind(this);
    this.speechRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error', event.error);
      this.isListeningForCommands = false;
      this.updateVoiceCommandUI();
    };
    this.speechRecognition.onend = () => {
      // If it ends and we still want it to be listening, restart it.
      if (this.isListeningForCommands) {
        this.speechRecognition?.start();
      }
    };
  }

  private toggleVoiceCommands(): void {
    if (!this.speechRecognition) return;
    this.isListeningForCommands = !this.isListeningForCommands;
    if (this.isListeningForCommands) {
      this.speechRecognition.start();
    } else {
      this.speechRecognition.stop();
    }
    this.updateVoiceCommandUI();
  }

  private updateVoiceCommandUI(): void {
    this.voiceCommandButton.classList.toggle(
      'active',
      this.isListeningForCommands,
    );
    if (this.isListeningForCommands) {
      this.voiceCommandButton.setAttribute('title', 'Stop Voice Commands');
    } else {
      this.voiceCommandButton.setAttribute('title', 'Start Voice Commands');
    }
  }

  private handleSpeechResult(event: SpeechRecognitionEvent): void {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    finalTranscript = finalTranscript.toLowerCase().trim();
    if (!finalTranscript) return;

    console.log(`Voice Command: ${finalTranscript}`);

    if (
      finalTranscript.includes('start recording') ||
      finalTranscript.includes('begin recording')
    ) {
      if (!this.isRecording) this.startRecording();
    } else if (
      finalTranscript.includes('stop recording') ||
      finalTranscript.includes('end recording')
    ) {
      if (this.isRecording) this.stopRecording();
    } else if (
      finalTranscript.includes('new note') ||
      finalTranscript.includes('create new note')
    ) {
      this.createNewNote();
    } else if (
      finalTranscript.includes('show polished') ||
      finalTranscript.includes('polished view')
    ) {
      this.setActiveTab('note');
    } else if (
      finalTranscript.includes('show raw') ||
      finalTranscript.includes('raw view')
    ) {
      this.setActiveTab('raw');
    } else if (finalTranscript.includes('new row')) {
      this.insertNewRow();
    }
  }

  private insertNewRow(): void {
    const activeEditor = document.activeElement;
    if (
      activeEditor &&
      (activeEditor.id === 'rawTranscription' ||
        activeEditor.id === 'polishedNote')
    ) {
      (activeEditor as HTMLElement).focus();
      document.execCommand('insertText', false, '.\n');
    } else {
      // Default to raw transcription if no editor is focused
      this.rawTranscription.focus();
      document.execCommand('insertText', false, '.\n');
    }
  }

  private handleGlobalKeyDown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      this.createNewNote();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Use metaKey for MacOS (Command key) and ctrlKey for Windows/Linux
    if (event.metaKey || event.ctrlKey) {
      switch (event.key.toLowerCase()) {
        case 'b':
          event.preventDefault();
          document.execCommand('bold');
          break;
        case 'i':
          event.preventDefault();
          document.execCommand('italic');
          break;
        // Using Shift + L for unordered list
        case 'l':
          if (event.shiftKey) {
            event.preventDefault();
            document.execCommand('insertUnorderedList');
          }
          break;
      }
    }
  }

  private handleCheckboxChange(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    if (!checkbox || checkbox.type !== 'checkbox' || !this.currentNote) return;

    const allCheckboxes = Array.from(
      this.polishedNote.querySelectorAll('input[type="checkbox"]'),
    );
    const checkboxIndex = allCheckboxes.indexOf(checkbox);

    if (checkboxIndex === -1) return;

    const markdown = this.currentNote.polishedNote;
    let count = -1;
    const newMarkdown = markdown.replace(/(- \[[ x]\])/g, (match) => {
      count++;
      if (count === checkboxIndex) {
        return checkbox.checked ? '- [x]' : '- [ ]';
      }
      return match;
    });

    if (this.currentNote.polishedNote !== newMarkdown) {
      this.currentNote.polishedNote = newMarkdown;
      // Manually trigger a save since auto-save interval might miss it
      this.autoSave();
    }
  }

  private handlePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    let pastedData: string;

    if (clipboardData.types.includes('text/html')) {
      pastedData = clipboardData.getData('text/html');
      // NOTE: This is a basic sanitization. For a production application,
      // a more robust HTML sanitizer library (like DOMPurify) is recommended
      // to prevent XSS attacks.
      const sanitizedHtml = pastedData
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // remove script tags
        .replace(/ style="[^"]*"/gi, ''); // remove inline styles
      document.execCommand('insertHTML', false, sanitizedHtml);
    } else if (clipboardData.types.includes('text/plain')) {
      pastedData = clipboardData.getData('text/plain');
      // To preserve line breaks, convert newlines to <br> tags.
      const htmlText = pastedData.replace(/(\r\n|\n|\r)/gm, '<br>');
      document.execCommand('insertHTML', false, htmlText);
    }
  }

  private handleTitleChange(): void {
    if (!this.currentNote) return;
    const newTitle = this.editorTitle.textContent?.trim() || 'Note Title';
    if (this.currentNote.title !== newTitle) {
      this.currentNote.title = newTitle;
      const noteInArray = this.notes.find((n) => n.id === this.currentNote!.id);
      if (noteInArray) {
        noteInArray.title = newTitle;
      }
      this.saveNotes();
    }
  }

  private toggleSidebar(): void {
    document.body.classList.toggle('sidebar-open');
  }

  // FIX: Make method async to handle async calls to deleteNote and loadNote
  private async handleNoteListClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    const noteItem = target.closest('.note-item');
    if (!noteItem) return;

    const noteId = noteItem.getAttribute('data-note-id');
    if (!noteId) return;

    const deleteButton = target.closest('.delete-note-button');
    if (deleteButton) {
      // FIX: await async method
      await this.deleteNote(noteId);
    } else {
      // FIX: await async method
      await this.loadNote(noteId);
    }
  }

  private saveNotes(): void {
    // Sort notes by timestamp, most recent first
    this.notes.sort((a, b) => b.timestamp - a.timestamp);
    localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(this.notes));
    this.renderSidebar();
  }

  private showSavingIndicator(): void {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }
    this.saveStatus.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving...`;
    this.saveStatus.classList.add('visible');
  }

  private showSavedIndicator(): void {
    if (this.saveTimeoutId) clearTimeout(this.saveTimeoutId);
    this.saveStatus.innerHTML = `<i class="fas fa-check"></i> Saved`;
    this.saveStatus.classList.add('visible');
    this.saveTimeoutId = window.setTimeout(() => {
      this.saveStatus.classList.remove('visible');
    }, 2000);
  }

  private autoSave(): void {
    if (!this.currentNote) {
      return;
    }

    let changed = false;

    // Check title
    const titleIsPlaceholder =
      this.editorTitle.classList.contains('placeholder-active');
    const newTitle = titleIsPlaceholder
      ? 'Note Title'
      : this.editorTitle.textContent?.trim() || 'Note Title';
    if (this.currentNote.title !== newTitle) {
      this.currentNote.title = newTitle;
      changed = true;
    }

    // Check raw transcription
    const rawIsPlaceholder =
      this.rawTranscription.classList.contains('placeholder-active');
    const newRawTranscription = rawIsPlaceholder
      ? ''
      : this.rawTranscription.textContent || '';
    if (this.currentNote.rawTranscription !== newRawTranscription) {
      this.currentNote.rawTranscription = newRawTranscription;
      changed = true;
    }

    // Check polished note
    const polishedIsPlaceholder =
      this.polishedNote.classList.contains('placeholder-active');
    const newPolishedNote = polishedIsPlaceholder
      ? ''
      : this.polishedNote.innerHTML;
    if (this.currentNote.polishedNote !== newPolishedNote) {
      this.currentNote.polishedNote = newPolishedNote;
      changed = true;
    }

    if (changed) {
      this.showSavingIndicator();
      const noteInArray = this.notes.find((n) => n.id === this.currentNote!.id);
      if (noteInArray) {
        noteInArray.title = this.currentNote.title;
        noteInArray.rawTranscription = this.currentNote.rawTranscription;
        noteInArray.polishedNote = this.currentNote.polishedNote;
        noteInArray.timestamp = Date.now(); // Update timestamp on edit
        this.saveNotes();
        this.showSavedIndicator();
      } else {
        if (this.saveTimeoutId) clearTimeout(this.saveTimeoutId);
        this.saveStatus.classList.remove('visible');
      }
    }
  }

  // FIX: Make method async to handle async call to loadNote
  private async loadNotes(): Promise<void> {
    const savedNotes = localStorage.getItem(this.LOCAL_STORAGE_KEY);
    if (savedNotes) {
      try {
        this.notes = JSON.parse(savedNotes);
      } catch (e) {
        console.error('Could not parse notes from local storage', e);
        this.notes = [];
      }
    }

    if (this.notes.length > 0) {
      // Load the most recent note
      // FIX: await async method
      await this.loadNote(this.notes[0].id);
    } else {
      // Or create a new one if storage is empty
      this.createNewNote();
    }
    this.renderSidebar();
  }

  private renderSidebar(): void {
    this.notesList.innerHTML = '';
    if (this.notes.length === 0) {
      this.notesList.innerHTML =
        '<p class="empty-notes-message">No saved notes.</p>';
      return;
    }

    this.notes.forEach((note) => {
      const noteEl = document.createElement('div');
      noteEl.className = 'note-item';
      noteEl.setAttribute('data-note-id', note.id);

      if (this.currentNote && note.id === this.currentNote.id) {
        noteEl.classList.add('active');
      }

      const title = note.title || 'Note Title';
      const date = new Date(note.timestamp).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      noteEl.innerHTML = `
            <div class="note-item-title">${title}</div>
            <div class="note-item-timestamp">${date}</div>
            <button class="delete-note-button" title="Delete Note"><i class="fas fa-trash"></i></button>
        `;
      this.notesList.appendChild(noteEl);
    });
  }

  // FIX: Make method async to handle async calls within it.
  private async loadNote(noteId: string): Promise<void> {
    const noteToLoad = this.notes.find((note) => note.id === noteId);
    if (!noteToLoad) {
      console.error(`Note with id ${noteId} not found.`);
      if (this.notes.length === 0) {
        this.createNewNote();
      } else {
        // FIX: await async method
        await this.loadNote(this.notes[0].id);
      }
      return;
    }
    this.currentNote = {...noteToLoad};

    // Update UI
    this.editorTitle.textContent = this.currentNote.title;
    this.editorTitle.classList.toggle(
      'placeholder-active',
      !this.currentNote.title || this.currentNote.title === 'Note Title',
    );

    if (this.currentNote.rawTranscription) {
      this.rawTranscription.textContent = this.currentNote.rawTranscription;
      this.rawTranscription.classList.remove('placeholder-active');
    } else {
      this.rawTranscription.textContent =
        this.rawTranscription.getAttribute('placeholder');
      this.rawTranscription.classList.add('placeholder-active');
    }

    if (this.currentNote.polishedNote) {
      const noteContent = this.currentNote.polishedNote;
      // If content seems to be HTML, render directly. Otherwise, parse as Markdown.
      if (noteContent.trim().startsWith('<')) {
        this.polishedNote.innerHTML = noteContent;
      } else {
        // FIX: Await marked.parse as it can be async and return a Promise.
        let htmlContent = await marked.parse(noteContent);
        htmlContent = htmlContent.replace(/ disabled=""/g, '');
        this.polishedNote.innerHTML = htmlContent;
      }
      this.polishedNote.classList.remove('placeholder-active');
    } else {
      this.polishedNote.innerHTML =
        this.polishedNote.getAttribute('placeholder') || '';
      this.polishedNote.classList.add('placeholder-active');
    }

    if (this.isRecording) {
      // FIX: await async method
      await this.stopRecording();
    }

    this.recordingStatus.textContent = 'Note loaded. Ready to record.';
    this.renderSidebar(); // Re-render to update active state
  }

  // FIX: Make method async to handle async call to loadNote
  private async deleteNote(noteId: string): Promise<void> {
    this.notes = this.notes.filter((note) => note.id !== noteId);
    this.saveNotes(); // this will also re-render the sidebar

    if (this.currentNote && this.currentNote.id === noteId) {
      // If the active note was deleted, load another or create a new one
      if (this.notes.length > 0) {
        // FIX: await async method
        await this.loadNote(this.notes[0].id);
      } else {
        this.createNewNote();
      }
    }
  }

  private handleResize(): void {
    if (
      this.isRecording &&
      this.liveWaveformCanvas &&
      this.liveWaveformCanvas.style.display === 'block'
    ) {
      requestAnimationFrame(() => {
        this.setupCanvasDimensions();
      });
    }

    const currentActiveButton = this.tabNav.querySelector('.tab-button.active');
    if (currentActiveButton) {
      const tabName = currentActiveButton.getAttribute('data-tab');
      if (tabName === 'note' || tabName === 'raw') {
        this.setActiveTab(tabName, true);
      }
    }
  }

  private setupCanvasDimensions(): void {
    if (!this.liveWaveformCanvas || !this.liveWaveformCtx) return;

    const canvas = this.liveWaveformCanvas;
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width;
    const cssHeight = rect.height;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    this.liveWaveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      this.themeToggleIcon.classList.remove('fa-sun');
      this.themeToggleIcon.classList.add('fa-moon');
    } else {
      document.body.classList.remove('light-mode');
      this.themeToggleIcon.classList.remove('fa-moon');
      this.themeToggleIcon.classList.add('fa-sun');
    }
  }

  private toggleTheme(): void {
    document.body.classList.toggle('light-mode');
    if (document.body.classList.contains('light-mode')) {
      localStorage.setItem('theme', 'light');
      this.themeToggleIcon.classList.remove('fa-sun');
      this.themeToggleIcon.classList.add('fa-moon');
    } else {
      localStorage.setItem('theme', 'dark');
      this.themeToggleIcon.classList.remove('fa-moon');
      this.themeToggleIcon.classList.add('fa-sun');
    }
  }

  private async toggleRecording(): Promise<void> {
    if (!this.isRecording) {
      await this.startRecording();
    } else {
      await this.stopRecording();
    }
  }

  private setupAudioVisualizer(): void {
    if (!this.stream || this.audioContext) return;

    this.audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyserNode = this.audioContext.createAnalyser();

    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.75;

    const bufferLength = this.analyserNode.frequencyBinCount;
    this.waveformDataArray = new Uint8Array(bufferLength);

    source.connect(this.analyserNode);
  }

  private drawLiveWaveform(): void {
    if (
      !this.analyserNode ||
      !this.waveformDataArray ||
      !this.liveWaveformCtx ||
      !this.liveWaveformCanvas ||
      !this.isRecording
    ) {
      if (this.waveformDrawingId) cancelAnimationFrame(this.waveformDrawingId);
      this.waveformDrawingId = null;
      return;
    }

    this.waveformDrawingId = requestAnimationFrame(() =>
      this.drawLiveWaveform(),
    );
    this.analyserNode.getByteFrequencyData(this.waveformDataArray);

    const ctx = this.liveWaveformCtx;
    const canvas = this.liveWaveformCanvas;

    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    const bufferLength = this.analyserNode.frequencyBinCount;
    const numBars = Math.floor(bufferLength * 0.5);

    if (numBars === 0) return;

    const totalBarPlusSpacingWidth = logicalWidth / numBars;
    const barWidth = Math.max(1, Math.floor(totalBarPlusSpacingWidth * 0.7));
    const barSpacing = Math.max(0, Math.floor(totalBarPlusSpacingWidth * 0.3));

    let x = 0;

    const recordingColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-recording')
        .trim() || '#ff3b30';
    ctx.fillStyle = recordingColor;

    for (let i = 0; i < numBars; i++) {
      if (x >= logicalWidth) break;

      const dataIndex = Math.floor(i * (bufferLength / numBars));
      const barHeightNormalized = this.waveformDataArray[dataIndex] / 255.0;
      let barHeight = barHeightNormalized * logicalHeight;

      if (barHeight < 1 && barHeight > 0) barHeight = 1;
      barHeight = Math.round(barHeight);

      const y = Math.round((logicalHeight - barHeight) / 2);

      ctx.fillRect(Math.floor(x), y, barWidth, barHeight);
      x += barWidth + barSpacing;
    }
  }

  private updateLiveTimer(): void {
    if (!this.isRecording || !this.liveRecordingTimerDisplay) return;
    const now = Date.now();
    const elapsedMs = now - this.recordingStartTime;

    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((elapsedMs % 1000) / 10);

    this.liveRecordingTimerDisplay.textContent = `${String(minutes).padStart(
      2,
      '0',
    )}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(
      2,
      '0',
    )}`;
  }

  private startLiveDisplay(): void {
    if (
      !this.recordingInterface ||
      !this.liveRecordingTitle ||
      !this.liveWaveformCanvas ||
      !this.liveRecordingTimerDisplay
    ) {
      console.warn(
        'One or more live display elements are missing. Cannot start live display.',
      );
      return;
    }

    this.recordingInterface.classList.add('is-live');
    this.mainContent.classList.add('recording-live');
    this.liveRecordingTitle.style.display = 'block';
    this.liveWaveformCanvas.style.display = 'block';
    this.liveRecordingTimerDisplay.style.display = 'block';

    this.setupCanvasDimensions();

    if (this.statusIndicatorDiv) this.statusIndicatorDiv.style.display = 'none';

    const iconElement = this.recordButton.querySelector(
      '.record-button-inner i',
    ) as HTMLElement;
    if (iconElement) {
      iconElement.classList.remove('fa-microphone');
      iconElement.classList.add('fa-stop');
    }

    const currentTitle = this.editorTitle.textContent?.trim();
    const placeholder =
      this.editorTitle.getAttribute('placeholder') || 'Note Title';
    this.liveRecordingTitle.textContent =
      currentTitle && currentTitle !== placeholder
        ? currentTitle
        : 'New Recording';

    this.setupAudioVisualizer();
    this.drawLiveWaveform();

    this.recordingStartTime = Date.now();
    this.updateLiveTimer();
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.timerIntervalId = window.setInterval(() => this.updateLiveTimer(), 50);
  }

  private stopLiveDisplay(): void {
    if (
      !this.recordingInterface ||
      !this.liveRecordingTitle ||
      !this.liveWaveformCanvas ||
      !this.liveRecordingTimerDisplay
    ) {
      if (this.recordingInterface) {
        this.recordingInterface.classList.remove('is-live');
        this.mainContent.classList.remove('recording-live');
      }
      return;
    }
    this.recordingInterface.classList.remove('is-live');
    this.mainContent.classList.remove('recording-live');
    this.liveRecordingTitle.style.display = 'none';
    this.liveWaveformCanvas.style.display = 'none';
    this.liveRecordingTimerDisplay.style.display = 'none';

    if (this.statusIndicatorDiv)
      this.statusIndicatorDiv.style.display = 'block';

    const iconElement = this.recordButton.querySelector(
      '.record-button-inner i',
    ) as HTMLElement;
    if (iconElement) {
      iconElement.classList.remove('fa-stop');
      iconElement.classList.add('fa-microphone');
    }

    if (this.waveformDrawingId) {
      cancelAnimationFrame(this.waveformDrawingId);
      this.waveformDrawingId = null;
    }
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    if (this.liveWaveformCtx && this.liveWaveformCanvas) {
      this.liveWaveformCtx.clearRect(
        0,
        0,
        this.liveWaveformCanvas.width,
        this.liveWaveformCanvas.height,
      );
    }

    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext
          .close()
          .catch((e) => console.warn('Error closing audio context', e));
      }
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.waveformDataArray = null;
  }

  private async startRecording(): Promise<void> {
    try {
      this.audioChunks = [];
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
        this.audioContext = null;
      }

      this.recordingStatus.textContent = 'Requesting microphone access...';

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({audio: true});
      } catch (err) {
        console.error('Failed with basic constraints:', err);
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }

      try {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType: 'audio/webm',
        });
      } catch (e) {
        console.error('audio/webm not supported, trying default:', e);
        this.mediaRecorder = new MediaRecorder(this.stream);
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0)
          this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        this.stopLiveDisplay();

        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, {
            type: this.mediaRecorder?.mimeType || 'audio/webm',
          });
          this.processAudio(audioBlob).catch((err) => {
            console.error('Error processing audio:', err);
            this.recordingStatus.textContent = 'Error processing recording';
          });
        } else {
          this.recordingStatus.textContent =
            'No audio data captured. Please try again.';
        }

        if (this.stream) {
          this.stream.getTracks().forEach((track) => {
            track.stop();
          });
          this.stream = null;
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;

      this.recordButton.classList.add('recording');
      this.recordButton.setAttribute('title', 'Stop Recording');

      this.startLiveDisplay();
    } catch (error) {
      console.error('Error starting recording:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';

      if (
        errorName === 'NotAllowedError' ||
        errorName === 'PermissionDeniedError'
      ) {
        this.recordingStatus.textContent =
          'Microphone permission denied. Please check browser settings and reload page.';
      } else if (
        errorName === 'NotFoundError' ||
        (errorName === 'DOMException' &&
          errorMessage.includes('Requested device not found'))
      ) {
        this.recordingStatus.textContent =
          'No microphone found. Please connect a microphone.';
      } else if (
        errorName === 'NotReadableError' ||
        errorName === 'AbortError' ||
        (errorName === 'DOMException' &&
          errorMessage.includes('Failed to allocate audiosource'))
      ) {
        this.recordingStatus.textContent =
          'Cannot access microphone. It may be in use by another application.';
      } else {
        this.recordingStatus.textContent = `Error: ${errorMessage}`;
      }

      this.isRecording = false;
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      this.recordButton.classList.remove('recording');
      this.recordButton.setAttribute('title', 'Start Recording');
      this.stopLiveDisplay();
    }
  }

  private async stopRecording(): Promise<void> {
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
        this.stopLiveDisplay();
      }

      this.isRecording = false;

      this.recordButton.classList.remove('recording');
      this.recordButton.setAttribute('title', 'Start Recording');
      this.recordingStatus.textContent = 'Processing audio...';
    } else {
      if (!this.isRecording) this.stopLiveDisplay();
    }
  }

  private async processAudio(audioBlob: Blob): Promise<void> {
    if (audioBlob.size === 0) {
      this.recordingStatus.textContent =
        'No audio data captured. Please try again.';
      return;
    }

    try {
      URL.createObjectURL(audioBlob);

      this.recordingStatus.textContent = 'Converting audio...';

      const reader = new FileReader();
      const readResult = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          try {
            const base64data = reader.result as string;
            const base64Audio = base64data.split(',')[1];
            resolve(base64Audio);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(reader.error);
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await readResult;

      if (!base64Audio) throw new Error('Failed to convert audio to base64');

      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      await this.getTranscription(base64Audio, mimeType);
    } catch (error) {
      console.error('Error in processAudio:', error);
      this.recordingStatus.textContent =
        'Error processing recording. Please try again.';
    }
  }

  private async getTranscription(
    base64Audio: string,
    mimeType: string,
  ): Promise<void> {
    try {
      this.recordingStatus.textContent = 'Getting transcription...';

      const contents = [
        {
          text: 'You are an expert transcriptionist specializing in technical topics like programming, computer science, and the Internet of Things (IoT). Transcribe the provided audio with high accuracy, paying close attention to technical jargon, acronyms (like API, JSON, HTTP, MQTT), and code-related terms. Focus only on spoken words. Omit any non-speech sounds, background noises, or descriptive sounds often enclosed in parentheses, such as (Sigh) or (Humming sound). Provide a clean, verbatim transcript of the speech.',
        },
        {inlineData: {mimeType: mimeType, data: base64Audio}},
      ];

      const response = await this.genAI.models.generateContent({
        model: MODEL_NAME,
        contents: contents,
      });

      const transcriptionText = response.text;

      if (transcriptionText) {
        this.rawTranscription.textContent = transcriptionText;
        if (transcriptionText.trim() !== '') {
          this.rawTranscription.classList.remove('placeholder-active');
        } else {
          const placeholder =
            this.rawTranscription.getAttribute('placeholder') || '';
          this.rawTranscription.textContent = placeholder;
          this.rawTranscription.classList.add('placeholder-active');
        }

        if (this.currentNote) {
          this.currentNote.rawTranscription = transcriptionText;
          const noteInArray = this.notes.find(
            (n) => n.id === this.currentNote!.id,
          );
          if (noteInArray) {
            noteInArray.rawTranscription = transcriptionText;
            this.saveNotes();
          }
        }
        this.recordingStatus.textContent =
          'Transcription complete. Polishing note...';
        this.getPolishedNote().catch((err) => {
          console.error('Error polishing note:', err);
          this.recordingStatus.textContent =
            'Error polishing note after transcription.';
        });
      } else {
        this.recordingStatus.textContent =
          'Transcription failed or returned empty.';
        this.polishedNote.innerHTML =
          '<p><em>Could not transcribe audio. Please try again.</em></p>';
        this.rawTranscription.textContent =
          this.rawTranscription.getAttribute('placeholder');
        this.rawTranscription.classList.add('placeholder-active');
      }
    } catch (error) {
      console.error('Error getting transcription:', error);
      this.recordingStatus.textContent =
        'Error getting transcription. Please try again.';
      this.polishedNote.innerHTML = `<p><em>Error during transcription: ${
        error instanceof Error ? error.message : String(error)
      }</em></p>`;
      this.rawTranscription.textContent =
        this.rawTranscription.getAttribute('placeholder');
      this.rawTranscription.classList.add('placeholder-active');
    }
  }

  private async getPolishedNote(): Promise<void> {
    try {
      if (
        !this.rawTranscription.textContent ||
        this.rawTranscription.textContent.trim() === '' ||
        this.rawTranscription.classList.contains('placeholder-active')
      ) {
        this.recordingStatus.textContent = 'No transcription to polish';
        this.polishedNote.innerHTML =
          '<p><em>No transcription available to polish.</em></p>';
        const placeholder = this.polishedNote.getAttribute('placeholder') || '';
        this.polishedNote.innerHTML = placeholder;
        this.polishedNote.classList.add('placeholder-active');
        return;
      }

      this.recordingStatus.textContent = 'Polishing note...';

      const prompt = `You are an expert technical writer. Take this raw transcription about a technical subject (like programming, computers, or IoT) and create a polished, well-formatted note. Your tasks are:
1.  Correct any potential transcription errors, especially for technical terms and acronyms.
2.  Remove filler words (um, uh, like), repetitions, and false starts.
3.  Structure the content logically using Markdown. Use headings, lists, bold text, and code blocks (\`\`\`) where appropriate.
4.  Ensure all original content and meaning are preserved.
5.  If there is a clear main topic, create a suitable title using a level 1 Markdown heading (e.g., # My Note Title).

Raw transcription:
${this.rawTranscription.textContent}`;
      const contents = [{text: prompt}];

      const response = await this.genAI.models.generateContent({
        model: MODEL_NAME,
        contents: contents,
      });

      const polishedText = response.text;

      if (polishedText) {
        // FIX: Await marked.parse as it can be async and return a Promise.
        let htmlContent = await marked.parse(polishedText);
        htmlContent = htmlContent.replace(/ disabled=""/g, '');
        this.polishedNote.innerHTML = htmlContent;
        if (polishedText.trim() !== '') {
          this.polishedNote.classList.remove('placeholder-active');
        } else {
          const placeholder =
            this.polishedNote.getAttribute('placeholder') || '';
          this.polishedNote.innerHTML = placeholder;
          this.polishedNote.classList.add('placeholder-active');
        }

        let noteTitleSet = false;
        const lines = polishedText.split('\n').map((l) => l.trim());

        for (const line of lines) {
          if (line.startsWith('#')) {
            const title = line.replace(/^#+\s+/, '').trim();
            if (this.editorTitle && title) {
              this.editorTitle.textContent = title;
              this.editorTitle.classList.remove('placeholder-active');
              if (this.currentNote) {
                this.currentNote.title = title;
              }
              noteTitleSet = true;
              break;
            }
          }
        }

        if (!noteTitleSet && this.editorTitle) {
          for (const line of lines) {
            if (line.length > 0) {
              let potentialTitle = line.replace(
                /^[\*_\`#\->\s\[\]\(.\d)]+/,
                '',
              );
              potentialTitle = potentialTitle.replace(/[\*_\`#]+$/, '');
              potentialTitle = potentialTitle.trim();

              if (potentialTitle.length > 3) {
                const maxLength = 60;
                const finalTitle =
                  potentialTitle.substring(0, maxLength) +
                  (potentialTitle.length > maxLength ? '...' : '');
                this.editorTitle.textContent = finalTitle;
                if (this.currentNote) {
                  this.currentNote.title = finalTitle;
                }
                this.editorTitle.classList.remove('placeholder-active');
                noteTitleSet = true;
                break;
              }
            }
          }
        }

        if (!noteTitleSet && this.editorTitle) {
          const currentEditorText = this.editorTitle.textContent?.trim();
          const placeholderText =
            this.editorTitle.getAttribute('placeholder') || 'Note Title';
          if (
            currentEditorText === '' ||
            currentEditorText === placeholderText
          ) {
            this.editorTitle.textContent = placeholderText;
            if (!this.editorTitle.classList.contains('placeholder-active')) {
              this.editorTitle.classList.add('placeholder-active');
            }
          }
        }

        if (this.currentNote) {
          this.currentNote.polishedNote = polishedText;
          const noteInArray = this.notes.find(
            (n) => n.id === this.currentNote!.id,
          );
          if (noteInArray) {
            noteInArray.polishedNote = this.currentNote.polishedNote;
            noteInArray.title = this.currentNote.title;
            this.saveNotes();
          }
        }

        this.recordingStatus.textContent =
          'Note polished. Ready for next recording.';
      } else {
        this.recordingStatus.textContent =
          'Polishing failed or returned empty.';
        this.polishedNote.innerHTML =
          '<p><em>Polishing returned empty. Raw transcription is available.</em></p>';
        if (
          this.polishedNote.textContent?.trim() === '' ||
          this.polishedNote.innerHTML.includes('<em>Polishing returned empty')
        ) {
          const placeholder =
            this.polishedNote.getAttribute('placeholder') || '';
          this.polishedNote.innerHTML = placeholder;
          this.polishedNote.classList.add('placeholder-active');
        }
      }
    } catch (error) {
      console.error('Error polishing note:', error);
      this.recordingStatus.textContent =
        'Error polishing note. Please try again.';
      this.polishedNote.innerHTML = `<p><em>Error during polishing: ${
        error instanceof Error ? error.message : String(error)
      }</em></p>`;
      if (
        this.polishedNote.textContent?.trim() === '' ||
        this.polishedNote.innerHTML.includes('<em>Error during polishing')
      ) {
        const placeholder = this.polishedNote.getAttribute('placeholder') || '';
        this.polishedNote.innerHTML = placeholder;
        this.polishedNote.classList.add('placeholder-active');
      }
    }
  }

  private toggleExportMenu(): void {
    this.exportMenu.classList.toggle('visible');
  }

  private async handleExportOptionClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLButtonElement;
    if (target.matches('.export-menu-item')) {
      const format = target.dataset.format;
      if (format) {
        await this.exportNote(format as 'default' | 'txt');
        this.exportMenu.classList.remove('visible');
      }
    }
  }

  private stripHtml(html: string): string {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Add newlines after block elements to preserve structure
    tempDiv
      .querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, div')
      .forEach((el) => {
        el.insertAdjacentText('afterend', '\n');
      });

    // Add list markers for list items
    tempDiv.querySelectorAll('li').forEach((li) => {
      li.insertAdjacentText('beforebegin', '* ');
    });

    let text = tempDiv.textContent || tempDiv.innerText || '';

    // Clean up excessive newlines
    text = text.replace(/(\n\s*){3,}/g, '\n\n').trim();

    return text;
  }

  private async exportNote(
    format: 'default' | 'txt' = 'default',
  ): Promise<void> {
    if (
      !this.currentNote ||
      !this.currentNote.polishedNote ||
      this.currentNote.polishedNote.trim() === ''
    ) {
      return;
    }

    let title = this.editorTitle.textContent?.trim() || '';
    const placeholder =
      this.editorTitle.getAttribute('placeholder') || 'Note Title';
    if (!title || title === placeholder) {
      const now = new Date();
      title = `note-${now.toISOString().slice(0, 16).replace('T', '-')}`.replace(
        ':',
        '',
      );
    }

    const sanitizedTitle = title
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w-]+/g, '') // Remove all non-word chars
      .replace(/--+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, ''); // Trim - from end of text

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'txt') {
      const htmlContent = await marked.parse(this.currentNote.polishedNote);
      content = this.stripHtml(htmlContent);
      filename = `${sanitizedTitle || 'note'}.txt`;
      mimeType = 'text/plain;charset=utf-8';
    } else {
      // 'default'
      content = this.currentNote.polishedNote;
      const isHtml = content.trim().startsWith('<');
      filename = `${sanitizedTitle || 'note'}.${isHtml ? 'html' : 'md'}`;
      mimeType = isHtml
        ? 'text/html;charset=utf-8'
        : 'text/markdown;charset=utf-8';
    }

    const blob = new Blob([content], {
      type: mimeType,
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  private createNewNote(): void {
    const newNote: Note = {
      id: `note_${Date.now()}`,
      title: 'Note Title',
      rawTranscription: '',
      polishedNote: '',
      timestamp: Date.now(),
    };
    this.currentNote = newNote;
    this.notes.unshift(newNote); // Add to the beginning of the array

    const rawPlaceholder =
      this.rawTranscription.getAttribute('placeholder') || '';
    this.rawTranscription.textContent = rawPlaceholder;
    this.rawTranscription.classList.add('placeholder-active');

    const polishedPlaceholder =
      this.polishedNote.getAttribute('placeholder') || '';
    this.polishedNote.innerHTML = polishedPlaceholder;
    this.polishedNote.classList.add('placeholder-active');

    if (this.editorTitle) {
      const placeholder =
        this.editorTitle.getAttribute('placeholder') || 'Note Title';
      this.editorTitle.textContent = placeholder;
      this.editorTitle.classList.add('placeholder-active');
    }
    this.recordingStatus.textContent = 'New note created. Ready to record.';

    if (this.isRecording) {
      this.mediaRecorder?.stop();
      this.isRecording = false;
      this.recordButton.classList.remove('recording');
    } else {
      this.stopLiveDisplay();
    }
    this.saveNotes(); // Save notes and re-render sidebar
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VoiceNotesApp();

  document
    .querySelectorAll<HTMLElement>('[contenteditable][placeholder]')
    .forEach((el) => {
      const placeholder = el.getAttribute('placeholder')!;

      function updatePlaceholderState() {
        const currentText = (
          el.id === 'polishedNote' ? el.innerText : el.textContent
        )?.trim();

        if (currentText === '' || currentText === placeholder) {
          if (el.id === 'polishedNote' && currentText === '') {
            el.innerHTML = placeholder;
          } else if (currentText === '') {
            el.textContent = placeholder;
          }
          el.classList.add('placeholder-active');
        } else {
          el.classList.remove('placeholder-active');
        }
      }

      updatePlaceholderState();

      el.addEventListener('focus', function () {
        const currentText = (
          this.id === 'polishedNote' ? this.innerText : this.textContent
        )?.trim();
        if (currentText === placeholder) {
          if (this.id === 'polishedNote') this.innerHTML = '';
          else this.textContent = '';
          this.classList.remove('placeholder-active');
        }
      });

      el.addEventListener('blur', function () {
        updatePlaceholderState();
      });
    });
});

export {};