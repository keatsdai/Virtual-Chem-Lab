/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ELEMENTS, ElementData } from './elements';
import { GameState, Tool, AnimationState, CardState } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Droplets, 
  Magnet, 
  Hammer, 
  Flame, 
  Zap, 
  FlaskConical, 
  Camera as CameraIcon, 
  CameraOff,
  MousePointer2, 
  RefreshCw, 
  Target,
  X,
  Download,
  CheckCircle2,
  AlertTriangle,
  Info,
  HelpCircle,
  Play,
  Hand,
  Award
} from 'lucide-react';

// --- CONSTANTS ---
const TOOL_WIDTH = 100;
const TOOL_HEIGHT = 100;
const CENTER_ZONE_SIZE = 220;
const ELEMENT_BOX_SIZE = 120;
const PINCH_THRESHOLD = 0.08; // Normalized distance (8% of screen)
const DEBOUNCE_TIME = 100;
const SNAP_BACK_TIME = 300;

// --- UTILS ---
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

export default function App() {
  // --- REFS ---
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(null);
  
  // Game Logic Refs (to avoid re-renders in loop)
  const gameStateRef = useRef<{
    state: GameState;
    score: number;
    round: number;
    targetElement: ElementData | null;
    tools: Tool[];
    cards: CardState[];
    activeAnimation: AnimationState;
    cursor: { x: number; y: number; pinching: boolean; pinchStartTime: number };
    grabbedToolId: string | null;
    appliedTests: Set<string>;
    lastHint: string;
    mouseMode: boolean;
    isGuessing: boolean;
    particles: any[];
    labDecorations: { x: number; y: number; size: number; alpha: number; speed: number; symbol: string }[];
    showOutcome: boolean;
    outcomeCorrect: boolean;
    outcomeMessage: string;
    scrollOffset: number;
    streak: number;
    maxStreak: number;
    showCertificate: boolean;
    certificateName: string;
    certificatePhoto: string | null;
    tutorialStep: number;
    tutorialActionCompleted: boolean;
    isPractice: boolean;
    isFlipped: boolean;
  }>({
    state: 'START',
    score: 0,
    round: 1,
    targetElement: null,
    tools: [],
    cards: [],
    activeAnimation: { toolId: null, startTime: 0, duration: 0, active: false, progress: 0 },
    cursor: { x: 0, y: 0, pinching: false, pinchStartTime: 0 },
    grabbedToolId: null,
    appliedTests: new Set(),
    lastHint: "Grab tools with your hand and test the mystery element!",
    mouseMode: false,
    isGuessing: false,
    particles: [],
    labDecorations: Array.from({ length: 30 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 20 + 10,
      alpha: Math.random(),
      speed: Math.random() * 0.01 + 0.005,
      symbol: ['H', 'O', 'C', 'N', 'Fe', 'Au', 'Ag', 'Cu', '🧪', '🔬', '⚛️'][Math.floor(Math.random() * 11)]
    })),
    showOutcome: false,
    outcomeCorrect: false,
    outcomeMessage: "",
    scrollOffset: 0,
    streak: 0,
    maxStreak: 0,
    showCertificate: false,
    certificateName: "",
    certificatePhoto: null,
    tutorialStep: 0,
    tutorialActionCompleted: false,
    isTutorialMinimized: false,
    isPractice: false,
    isFlipped: false
  });

  // UI State (for overlays)
  const [uiState, setUiState] = useState({
    state: 'START' as GameState,
    score: 0,
    round: 1,
    streak: 0,
    maxStreak: 0,
    hint: "Grab tools with your hand and test the mystery element!",
    loading: true,
    mouseMode: false,
    isGuessing: false,
    showOutcome: false,
    outcomeCorrect: false,
    outcomeMessage: "",
    targetElement: null as ElementData | null,
    showCertificate: false,
    certificateName: "",
    certificatePhoto: null as string | null,
    tutorialStep: 0,
    tutorialActionCompleted: false,
    isTutorialMinimized: false,
    isPractice: false,
    isFlipped: false
  });

  // --- INITIALIZATION ---
  const initRound = useCallback((isPractice = false) => {
    const target = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
    const W = window.innerWidth;
    const H = window.innerHeight;
    
    const tools: Tool[] = [
      { id: 'water', name: 'Water Tank', icon: '🌊', x: W / 2 - 280, y: 180, originalX: W / 2 - 280, originalY: 180, width: TOOL_WIDTH, height: TOOL_HEIGHT, grabbed: false, used: false },
      { id: 'magnet', name: 'Magnet', icon: '🧲', x: W / 2 - 280, y: 300, originalX: W / 2 - 280, originalY: 300, width: TOOL_WIDTH, height: TOOL_HEIGHT, grabbed: false, used: false },
      { id: 'hammer', name: 'Hammer', icon: '🔨', x: W / 2 - 280, y: 420, originalX: W / 2 - 280, originalY: 420, width: TOOL_WIDTH, height: TOOL_HEIGHT, grabbed: false, used: false },
      { id: 'flame', name: 'Flame', icon: '🔥', x: W / 2 + 180, y: 180, originalX: W / 2 + 180, originalY: 180, width: TOOL_WIDTH, height: TOOL_HEIGHT, grabbed: false, used: false },
      { id: 'circuit', name: 'Circuit', icon: '⚡', x: W / 2 + 180, y: 300, originalX: W / 2 + 180, originalY: 300, width: TOOL_WIDTH, height: TOOL_HEIGHT, grabbed: false, used: false },
      { id: 'acid', name: 'Acid', icon: '🧪', x: W / 2 + 180, y: 420, originalX: W / 2 + 180, originalY: 420, width: TOOL_WIDTH, height: TOOL_HEIGHT, grabbed: false, used: false },
    ];

    const cards: CardState[] = ELEMENTS.map(el => ({
      symbol: el.symbol,
      ruledOut: false,
      contradictingTest: null,
      hint: null
    }));

    gameStateRef.current = {
      ...gameStateRef.current,
      state: 'ROUND',
      targetElement: target,
      tools,
      cards,
      appliedTests: new Set(),
      particles: [],
      lastHint: isPractice ? "PRACTICE ROUND: Try grabbing a tool!" : "Mystery element ready! Start your tests. (Tip: Hover edges of cards to scroll)",
      grabbedToolId: null,
      isGuessing: false,
      showOutcome: false,
      scrollOffset: 0,
      activeAnimation: { toolId: null, startTime: 0, duration: 0, active: false, progress: 0 },
      isPractice,
      tutorialActionCompleted: false
    };

    setUiState(prev => ({
      ...prev,
      state: 'ROUND',
      targetElement: target,
      hint: isPractice ? "PRACTICE ROUND: Try grabbing a tool!" : "Mystery element ready! Start your tests. (Tip: Hover edges of cards to scroll)",
      isGuessing: false,
      showOutcome: false,
      round: gameStateRef.current.round,
      isPractice,
      tutorialActionCompleted: false
    }));
  }, []);

  const initTutorial = useCallback(() => {
    initRound(true);
    gameStateRef.current.state = 'TUTORIAL';
    gameStateRef.current.tutorialStep = 1;
    gameStateRef.current.tutorialActionCompleted = false;
    gameStateRef.current.isTutorialMinimized = false;
    setUiState(prev => ({ 
      ...prev, 
      state: 'TUTORIAL', 
      tutorialStep: 1,
      tutorialActionCompleted: false,
      isTutorialMinimized: false,
      hint: "Welcome to Virtual Chem Lab! Let's learn the basics of element identification." 
    }));
  }, [initRound]);

  const resetGame = useCallback(() => {
    gameStateRef.current.score = 0;
    gameStateRef.current.round = 1;
    gameStateRef.current.streak = 0;
    gameStateRef.current.maxStreak = 0;
    setUiState(prev => ({ ...prev, score: 0, round: 1, streak: 0, maxStreak: 0 }));
    initRound();
  }, [initRound]);

  // --- HAND GESTURE SYSTEM ---
  const processHandResults = useCallback((results: any) => {
    const canvas = gameCanvasRef.current;
    if (!canvas) return;
    
    const W = canvas.width;
    const H = canvas.height;

    // Draw preview
    const previewCanvas = previewCanvasRef.current;
    const gs = gameStateRef.current;
    if (previewCanvas && videoRef.current) {
      const ctx = previewCanvas.getContext('2d');
      if (ctx) {
        ctx.save();
        if (gs.isFlipped) {
          ctx.scale(-1, 1);
          ctx.translate(-previewCanvas.width, 0);
        }
        ctx.drawImage(videoRef.current, 0, 0, previewCanvas.width, previewCanvas.height);
        
        if (results.multiHandLandmarks) {
          for (const landmarks of results.multiHandLandmarks) {
            // @ts-ignore
            if (window.drawConnectors && window.HAND_CONNECTIONS) {
              // @ts-ignore
              window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: '#00FF88', lineWidth: 2 });
            }
            // @ts-ignore
            if (window.drawLandmarks) {
              // @ts-ignore
              window.drawLandmarks(ctx, landmarks, { color: '#FFD700', lineWidth: 1, radius: 2 });
            }
          }
        }
        ctx.restore();
      }
    }

    if (!results.multiHandLandmarks?.length) return;
    const lm = results.multiHandLandmarks[0];

    const thumbX = (gs.isFlipped ? (1 - lm[4].x) : lm[4].x) * W;
    const thumbY = lm[4].y * H;
    const indexX = (gs.isFlipped ? (1 - lm[8].x) : lm[8].x) * W;
    const indexY = lm[8].y * H;
    
    // Use normalized distance for more consistent pinching across screen sizes
    const dx = lm[4].x - lm[8].x;
    const dy = lm[4].y - lm[8].y;
    const normalizedDist = Math.sqrt(dx * dx + dy * dy);
    const nowPinching = normalizedDist < PINCH_THRESHOLD;
    
    const cursorX = (thumbX + indexX) / 2;
    const cursorY = (thumbY + indexY) / 2;

    updateGrabSystem(cursorX, cursorY, nowPinching);
  }, []);

  const updateGrabSystem = (x: number, y: number, pinching: boolean) => {
    const gs = gameStateRef.current;
    gs.cursor.x = x;
    gs.cursor.y = y;

    const now = performance.now();
    
    if (pinching) {
      if (!gs.cursor.pinching) {
        startGrab(x, y, true);
        gs.cursor.pinching = true;
      }
      gs.cursor.pinchStartTime = now; // Reset timer while pinching
    } else {
      if (gs.cursor.pinching && now - gs.cursor.pinchStartTime > DEBOUNCE_TIME) {
        releaseGrab(x, y);
        gs.cursor.pinching = false;
      }
    }
  };

  const startGrab = (x: number, y: number, isHand: boolean = false) => {
    const gs = gameStateRef.current;
    if (gs.state !== 'ROUND' && gs.state !== 'TUTORIAL') return;

    // Check tools
    const toolPadding = gs.mouseMode ? 0 : 30;
    for (const tool of gs.tools) {
      const dx = x - (tool.x + tool.width / 2);
      const dy = y - (tool.y + tool.height / 2);
      if (Math.abs(dx) < (tool.width / 2 + toolPadding) && Math.abs(dy) < (tool.height / 2 + toolPadding)) {
        if (gs.appliedTests.has(tool.id)) {
          showBadge("You already tested that! Try a different tool.");
          return;
        }
        gs.grabbedToolId = tool.id;
        tool.grabbed = true;
        
        if (gs.state === 'TUTORIAL' && gs.tutorialStep === 2) {
          gs.tutorialActionCompleted = true;
          gs.isTutorialMinimized = false;
          setUiState(prev => ({ ...prev, tutorialActionCompleted: true, isTutorialMinimized: false, hint: "Great! Now drag it to the center box." }));
        }
        return;
      }
    }

    // Check cards - ONLY for mouse interaction (isHand = false)
    if (!isHand) {
      const cardW = 70;
      const cardH = 90;
      const gap = 10;
      const cols = 11;
      const totalGridW = cols * (cardW + gap) - gap;
      const startX = (window.innerWidth - totalGridW) / 2;
      const startY = window.innerHeight - 320;
      
      gs.cards.forEach((_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cx = startX + col * (cardW + gap);
        const cy = startY + row * (cardH + gap);
        
        if (x > cx && x < cx + cardW && y > cy && y < cy + cardH) {
          handleCardInteraction(i);
        }
      });
    }
  };

  const releaseGrab = (x: number, y: number) => {
    const gs = gameStateRef.current;
    if (gs.grabbedToolId) {
      const tool = gs.tools.find(t => t.id === gs.grabbedToolId);
      if (tool) {
        tool.grabbed = false;
        
        // Check center zone
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const dist = Math.hypot(x - centerX, y - centerY);

        if (dist < CENTER_ZONE_SIZE / 2) {
          applyTool(tool);
        } else {
          // Snap back
          animateSnapBack(tool);
        }
      }
      gs.grabbedToolId = null;
    }
  };

  const animateSnapBack = (tool: Tool) => {
    const startTime = performance.now();
    const startX = tool.x;
    const startY = tool.y;
    
    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / SNAP_BACK_TIME, 1);
      const easedT = easeInOut(t);
      
      tool.x = lerp(startX, tool.originalX, easedT);
      tool.y = lerp(startY, tool.originalY, easedT);
      
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  };

  const applyTool = (tool: Tool) => {
    const gs = gameStateRef.current;
    if (gs.appliedTests.has(tool.id)) return;

    gs.appliedTests.add(tool.id);
    
    if (gs.state === 'TUTORIAL' && gs.tutorialStep === 3) {
      gs.tutorialActionCompleted = true;
      gs.isTutorialMinimized = false;
      setUiState(prev => ({ ...prev, tutorialActionCompleted: true, isTutorialMinimized: false, hint: "Test complete! Look at the hint above." }));
    }

    gs.activeAnimation = {
      toolId: tool.id,
      startTime: performance.now(),
      duration: 3000,
      active: true,
      progress: 0
    };

    // Set hint based on element behavior
    const target = gs.targetElement!;
    let hint = "";
    switch (tool.id) {
      case 'water':
        if (target.state === 'gas') hint = "This element is a gas at room temperature.";
        else if (target.waterBehavior === 'sinks') hint = "Denser than water — it sinks! (density > 1 g/cm³)";
        else if (target.waterBehavior === 'floats') hint = "Less dense than water — it floats!";
        else if (target.waterBehavior === 'reacts_violently') hint = "Reacts EXPLOSIVELY with water!";
        else if (target.waterBehavior === 'floats_reacts') hint = "Floats first — then reacts with water!";
        else if (target.waterBehavior === 'dissolves') hint = "Dissolves in water!";
        else if (target.waterBehavior === 'reacts') hint = "Slowly reacts with water, producing gas bubbles.";
        break;
      case 'magnet':
        hint = target.magnetic ? "Attracted to magnets — ferromagnetic! (Like iron)" : "Not attracted to magnets — non-magnetic.";
        break;
      case 'hammer':
        if (target.state === 'gas' || target.state === 'liquid') hint = "Nothing to smash — it's a liquid/gas!";
        else if (target.brittleness === 'shatters') hint = "BRITTLE — shatters when struck!";
        else if (target.brittleness === 'bends') hint = "MALLEABLE — bends rather than breaks.";
        else if (target.brittleness === 'crumbles') hint = "CRUMBLY — breaks into pieces.";
        break;
      case 'flame':
        hint = target.flammable ? "FLAMMABLE — catches fire!" : "Not flammable — does not catch fire.";
        break;
      case 'circuit':
        hint = target.conductive ? "CONDUCTS electricity — the bulb lights up!" : "Does NOT conduct electricity — bulb stays dark.";
        break;
      case 'acid':
        if (target.acidReaction === 'bubbles') hint = "Reacts with acid — releases gas bubbles!";
        else if (target.acidReaction === 'strong_reaction') hint = "Strong acid reaction — partially dissolves!";
        else if (target.acidReaction === 'dissolves') hint = "Completely dissolves in acid!";
        else hint = "No reaction with acid.";
        break;
    }

    gs.lastHint = hint;
    setUiState(prev => ({ ...prev, hint }));
  };

  const handleCardInteraction = (index: number) => {
    const gs = gameStateRef.current;
    const card = gs.cards[index];
    const element = ELEMENTS[index];

    if (gs.isGuessing) {
      // Final Guess
      if (element.symbol === gs.targetElement?.symbol) {
        handleWin();
      } else {
        handleWrongGuess(index);
      }
      return;
    }

    if (card.ruledOut) {
      card.ruledOut = false;
      card.contradictingTest = null;
      return;
    }

    // Rule out logic
    if (element.symbol === gs.targetElement?.symbol) {
      showBadge("Click 'MAKE MY GUESS' to select an element!");
      // Shake animation
      for(let i=0; i<10; i++) {
        gs.particles.push({
          x: 50 + index * 80 + gs.scrollOffset + 35,
          y: window.innerHeight - 105,
          vx: (Math.random()-0.5)*10,
          vy: (Math.random()-0.5)*10,
          color: '#FF4444',
          size: Math.random()*5+2,
          life: 1.0
        });
      }
      return;
    }

    if (gs.state === 'TUTORIAL' && gs.tutorialStep === 4) {
      gs.tutorialActionCompleted = true;
      gs.isTutorialMinimized = false;
      setUiState(prev => ({ ...prev, tutorialActionCompleted: true, isTutorialMinimized: false, hint: "Card ruled out! You're getting closer." }));
    }

    // Check contradictions
    for (const test of gs.appliedTests) {
      const target = gs.targetElement!;
      let contradiction = false;
      
      if (test === 'water' && element.waterBehavior !== target.waterBehavior) contradiction = true;
      if (test === 'magnet' && element.magnetic !== target.magnetic) contradiction = true;
      if (test === 'hammer' && element.brittleness !== target.brittleness) contradiction = true;
      if (test === 'flame' && element.flammable !== target.flammable) contradiction = true;
      if (test === 'circuit' && element.conductive !== target.conductive) contradiction = true;
      if (test === 'acid' && element.acidReaction !== target.acidReaction) contradiction = true;
      
      if (contradiction) {
        card.ruledOut = true;
        card.contradictingTest = test;
        showBadge(`✅ Good call! ${element.name} would not behave that way in the ${test} test.`);
        return;
      }
    }

    // No contradiction found yet
    card.ruledOut = true;
    showBadge(`⚠️ No test has ruled out ${element.name} yet — are you sure?`);
  };

  const handleWin = () => {
    const gs = gameStateRef.current;
    if (!gs.isPractice) {
      const toolsUsed = gs.appliedTests.size;
      const bonus = (6 - toolsUsed) * 2;
      gs.score += 10 + bonus;
      gs.streak++;
      if (gs.streak > gs.maxStreak) gs.maxStreak = gs.streak;
    }
    
    gs.showOutcome = true;
    gs.outcomeCorrect = true;
    const isGameOver = !gs.isPractice && gs.round >= 10;
    gs.outcomeMessage = gs.isPractice ? `🎉 Practice Correct! It's ${gs.targetElement?.name}!` : (isGameOver ? `🏆 Final Round Complete! It's ${gs.targetElement?.name}!` : `🎉 Correct! It's ${gs.targetElement?.name}!`);
    
    setUiState(prev => ({ 
      ...prev, 
      score: gs.score, 
      streak: gs.streak,
      maxStreak: gs.maxStreak,
      showOutcome: true, 
      outcomeCorrect: true, 
      outcomeMessage: gs.outcomeMessage 
    }));
    
    // Confetti
    createConfetti();
  };

  const handleWrongGuess = (index: number) => {
    const gs = gameStateRef.current;
    if (!gs.isPractice) {
      gs.streak = 0;
      setUiState(prev => ({ ...prev, streak: 0 }));
    }
    showBadge(`❌ Not quite! ${ELEMENTS[index].name} doesn't match all your test results.`);
    // Red particles
    for (let i = 0; i < 30; i++) {
      gs.particles.push({
        x: gs.cursor.x,
        y: gs.cursor.y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        color: '#FF4444',
        size: Math.random() * 6 + 2,
        life: 1.0
      });
    }
  };

  const createConfetti = () => {
    const gs = gameStateRef.current;
    for (let i = 0; i < 100; i++) {
      gs.particles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20 - 10,
        color: `hsl(${Math.random() * 360}, 100%, 50%)`,
        size: Math.random() * 8 + 4,
        life: 1.0
      });
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      // Visual Flash Effect
      const gs = gameStateRef.current;
      for (let i = 0; i < 50; i++) {
        gs.particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: 0,
          vy: 0,
          color: '#FFFFFF',
          size: Math.random() * 20 + 10,
          life: 0.5
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        if (gs.isFlipped) {
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);
        }
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        const dataUrl = canvas.toDataURL('image/png');
        setUiState(prev => ({ ...prev, certificatePhoto: dataUrl }));
        gameStateRef.current.certificatePhoto = dataUrl;
      }
    }
  };

  const downloadCertificate = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gs = gameStateRef.current;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 1200, 800);
    gradient.addColorStop(0, '#0a192f');
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 800);

    // Border
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 20;
    ctx.strokeRect(40, 40, 1120, 720);
    ctx.strokeStyle = '#4facfe';
    ctx.lineWidth = 5;
    ctx.strokeRect(60, 60, 1080, 680);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 80px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CERTIFICATE OF ACHIEVEMENT', 600, 180);

    ctx.fillStyle = '#4facfe';
    ctx.font = '700 30px Inter, sans-serif';
    ctx.fillText('THIS IS TO CERTIFY THAT', 600, 250);

    // Name
    ctx.fillStyle = '#00f2fe';
    ctx.font = 'italic 900 90px Inter, sans-serif';
    ctx.fillText(gs.certificateName.toUpperCase() || 'CHEMIST', 600, 360);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 24px Inter, sans-serif';
    ctx.fillText('HAS SUCCESSFULLY COMPLETED THE VIRTUAL CHEM LAB CHALLENGE', 600, 430);
    ctx.fillText(`WITH A MAXIMUM STREAK OF ${gs.maxStreak} ELEMENTS IN A ROW!`, 600, 470);

    // Stats
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(200, 520, 800, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px Inter, sans-serif';
    ctx.fillText(`TOTAL SCORE: ${gs.score}`, 400, 595);
    ctx.fillText(`ROUNDS PLAYED: ${gs.round}`, 800, 595);

    // Badge
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(150, 150, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = '900 40px Inter, sans-serif';
    ctx.fillText('CL', 150, 165);

    // Photo
    if (gs.certificatePhoto) {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(1000, 350, 120, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, 880, 230, 240, 240);
        ctx.restore();
        
        // Final download
        const link = document.createElement('a');
        link.download = `virtual-chem-lab-certificate-${gs.certificateName || 'chemist'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      };
      img.src = gs.certificatePhoto;
    } else {
      // Final download if no photo
      const link = document.createElement('a');
      link.download = `virtual-chem-lab-certificate-${gs.certificateName || 'chemist'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  const showBadge = (msg: string) => {
    gameStateRef.current.lastHint = msg;
    setUiState(prev => ({ ...prev, hint: msg }));
  };

  // --- RENDERING ---
  const draw = useCallback((time: number) => {
    const canvas = gameCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gs = gameStateRef.current;
    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.fillStyle = '#0a192f'; // Deep lab blue
    ctx.fillRect(0, 0, W, H);

    // Lab Grid
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x < W; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Lab Decorations (Symbols/Icons)
    gs.labDecorations.forEach(dec => {
      dec.alpha += dec.speed;
      const a = (Math.sin(dec.alpha) + 1) / 2 * 0.15 + 0.05;
      ctx.fillStyle = `rgba(0, 242, 254, ${a})`;
      ctx.font = `${dec.size}px Inter`;
      ctx.textAlign = 'center';
      ctx.fillText(dec.symbol, dec.x, dec.y);
      
      // Slow drift
      dec.y -= 0.2;
      if (dec.y < -50) dec.y = H + 50;
    });

    if (gs.state === 'ROUND' || gs.state === 'TUTORIAL') {
      // Center Zone
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, CENTER_ZONE_SIZE / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Element Box
      const boxX = W / 2 - ELEMENT_BOX_SIZE / 2;
      const boxY = H / 2 - ELEMENT_BOX_SIZE / 2;
      
      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.fillStyle = '#555555';
      
      // Accumulate visual states
      if (gs.appliedTests.has('flame') && gs.targetElement?.flammable) {
        ctx.shadowColor = '#FF4444';
        ctx.shadowBlur = 20;
      }
      
      roundRect(ctx, boxX, boxY, ELEMENT_BOX_SIZE, ELEMENT_BOX_SIZE, 15);
      ctx.fill();
      ctx.restore();

      // Question Mark
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 60px Nunito';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', W / 2, H / 2);

      // Test Icons on Corners
      const icons = Array.from(gs.appliedTests).map(id => {
        const tool = gs.tools.find(t => t.id === id);
        return tool?.icon || '';
      });
      
      icons.forEach((icon, i) => {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const r = ELEMENT_BOX_SIZE / 2 + 20;
        ctx.font = '20px Arial';
        ctx.fillText(icon, W / 2 + Math.cos(angle) * r, H / 2 + Math.sin(angle) * r);
      });

      // Active Animation
      if (gs.activeAnimation.active) {
        drawAnimation(ctx, gs.activeAnimation, time);
      }

      // Tools
      gs.tools.forEach(tool => {
        if (tool.grabbed) {
          tool.x = gs.cursor.x - tool.width / 2;
          tool.y = gs.cursor.y - tool.height / 2;
        }
        drawTool(ctx, tool);
      });

      // Element Cards
      drawCards(ctx);
    }

    // Particles
    for (let i = gs.particles.length - 1; i >= 0; i--) {
      const p = gs.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.5;
      p.life -= 0.01;
      if (p.life <= 0) {
        gs.particles.splice(i, 1);
        continue;
      }
      
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1.0;

    // Cursor
    drawCursor(ctx, gs.cursor.x, gs.cursor.y, gs.cursor.pinching);

    requestRef.current = requestAnimationFrame(draw);
  }, [processHandResults]);

  const drawTool = (ctx: CanvasRenderingContext2D, tool: Tool) => {
    ctx.save();
    ctx.translate(tool.x, tool.y);
    
    // Glow if grabbed
    if (tool.grabbed) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#FFD700';
    }

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText(tool.name, tool.width / 2, tool.height + 20);

    // Tool Base
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    roundRect(ctx, 0, 0, tool.width, tool.height, 15);
    ctx.fill();

    // Graphic
    ctx.save();
    ctx.translate(tool.width / 2, tool.height / 2);
    ctx.scale(0.8, 0.8);
    ctx.translate(-50, -50);

    switch (tool.id) {
      case 'water':
        // Tank
        ctx.strokeStyle = '#6EC6FF';
        ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, 80, 80);
        // Water
        ctx.fillStyle = 'rgba(0, 150, 255, 0.4)';
        ctx.fillRect(12, 40, 76, 48);
        // Bubbles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for(let i=0; i<3; i++) {
          const bx = 30 + i*20;
          const by = 60 + Math.sin(Date.now()/500 + i)*10;
          ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI*2); ctx.fill();
        }
        break;
      case 'magnet':
        // Horseshoe
        ctx.lineWidth = 15;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#FF4444'; // Red side
        ctx.beginPath(); ctx.moveTo(30, 30); ctx.lineTo(30, 60); ctx.stroke();
        ctx.strokeStyle = '#4444FF'; // Blue side
        ctx.beginPath(); ctx.moveTo(70, 30); ctx.lineTo(70, 60); ctx.stroke();
        ctx.strokeStyle = '#AAAAAA'; // Bridge
        ctx.beginPath(); ctx.arc(50, 60, 20, 0, Math.PI); ctx.stroke();
        // Magnetism lines
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 2;
        for(let i=0; i<3; i++) {
          const r = 30 + i*10 + Math.sin(Date.now()/200)*5;
          ctx.beginPath(); ctx.arc(50, 60, r, Math.PI*1.2, Math.PI*1.8); ctx.stroke();
        }
        break;
      case 'hammer':
        // Handle
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(45, 40, 10, 50);
        // Head
        ctx.fillStyle = '#666666';
        ctx.fillRect(20, 20, 60, 25);
        ctx.fillStyle = '#444444';
        ctx.fillRect(70, 20, 10, 25); // Striking face
        break;
      case 'flame':
        // Match
        ctx.fillStyle = '#D2B48C';
        ctx.fillRect(48, 50, 4, 40);
        ctx.fillStyle = '#FF4444';
        ctx.beginPath(); ctx.arc(50, 50, 6, 0, Math.PI*2); ctx.fill();
        // Flame
        const fSize = 15 + Math.sin(Date.now()/100)*3;
        const grad = ctx.createRadialGradient(50, 40, 0, 50, 40, fSize);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.4, '#FFD700');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(50, 50);
        ctx.quadraticCurveTo(50-fSize, 50-fSize, 50, 50-fSize*2.5);
        ctx.quadraticCurveTo(50+fSize, 50-fSize, 50, 50);
        ctx.fill();
        break;
      case 'circuit':
        // Battery
        ctx.fillStyle = '#333333';
        ctx.fillRect(20, 40, 30, 25);
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(50, 48, 5, 10);
        // Bulb
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(75, 50, 12, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#555555';
        ctx.fillRect(70, 62, 10, 6);
        // Filament
        ctx.strokeStyle = '#888888';
        ctx.beginPath(); ctx.moveTo(70, 55); ctx.lineTo(75, 45); ctx.lineTo(80, 55); ctx.stroke();
        break;
      case 'acid':
        // Flask
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(40, 20); ctx.lineTo(60, 20);
        ctx.lineTo(60, 45); ctx.lineTo(85, 85);
        ctx.lineTo(15, 85); ctx.lineTo(40, 45);
        ctx.closePath();
        ctx.stroke();
        // Liquid
        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.beginPath();
        ctx.moveTo(35, 55); ctx.lineTo(65, 55);
        ctx.lineTo(80, 82); ctx.lineTo(20, 82);
        ctx.closePath();
        ctx.fill();
        // Bubbles
        ctx.fillStyle = '#ffffff';
        for(let i=0; i<4; i++) {
          const bx = 30 + Math.random()*40;
          const by = 60 + Math.random()*20;
          ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI*2); ctx.fill();
        }
        break;
    }
    ctx.restore();
    ctx.restore();
  };

  const drawAnimation = (ctx: CanvasRenderingContext2D, anim: AnimationState, time: number) => {
    const gs = gameStateRef.current;
    const target = gs.targetElement!;
    const progress = Math.min((time - anim.startTime) / anim.duration, 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const centerX = W / 2;
    const centerY = H / 2;

    ctx.save();
    switch (anim.toolId) {
      case 'water':
        // Tank appears
        ctx.strokeStyle = '#6EC6FF';
        ctx.lineWidth = 8;
        ctx.strokeRect(centerX - 120, centerY - 120, 240, 240);
        ctx.fillStyle = 'rgba(0, 150, 255, 0.15)';
        ctx.fillRect(centerX - 116, centerY - 40, 232, 156);
        
        // Water ripples
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        for(let i=0; i<3; i++) {
          const r = 100 + i*20 + Math.sin(time/300 + i)*10;
          ctx.beginPath(); ctx.ellipse(centerX, centerY + 40, r, r/4, 0, 0, Math.PI*2); ctx.stroke();
        }

        // Element box behavior
        ctx.save();
        if (target.waterBehavior === 'sinks') {
          const y = centerY - 60 + progress * 130;
          ctx.translate(centerX, y);
          // Bubbles rising
          if (progress < 0.8) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            for(let i=0; i<5; i++) {
              ctx.beginPath(); ctx.arc((Math.random()-0.5)*80, -progress*100 - i*20, 4, 0, Math.PI*2); ctx.fill();
            }
          }
        } else if (target.waterBehavior === 'floats' || target.waterBehavior === 'floats_reacts') {
          const y = centerY - 40 + Math.sin(time / 200) * 8;
          ctx.translate(centerX, y);
        } else if (target.waterBehavior === 'reacts_violently') {
          ctx.translate(centerX + (Math.random()-0.5)*20, centerY + (Math.random()-0.5)*20);
          // Explosions
          ctx.fillStyle = '#FF4444';
          for(let i=0; i<10; i++) {
            ctx.beginPath(); ctx.arc((Math.random()-0.5)*150, (Math.random()-0.5)*150, Math.random()*10, 0, Math.PI*2); ctx.fill();
          }
        } else {
          ctx.translate(centerX, centerY);
        }
        
        ctx.fillStyle = '#555555';
        roundRect(ctx, -40, -40, 80, 80, 10);
        ctx.fill();
        ctx.restore();
        break;

      case 'magnet':
        const magnetX = centerX - 200 + progress * 120;
        ctx.save();
        ctx.translate(magnetX, centerY);
        // Draw magnet
        ctx.lineWidth = 25;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#FF4444';
        ctx.beginPath(); ctx.moveTo(-20, -30); ctx.lineTo(-20, 10); ctx.stroke();
        ctx.strokeStyle = '#4444FF';
        ctx.beginPath(); ctx.moveTo(20, -30); ctx.lineTo(20, 10); ctx.stroke();
        ctx.strokeStyle = '#AAAAAA';
        ctx.beginPath(); ctx.arc(0, 10, 20, 0, Math.PI); ctx.stroke();
        
        // Magnetic field lines
        if (target.magnetic) {
          ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
          ctx.lineWidth = 3;
          for(let i=0; i<3; i++) {
            const r = 40 + i*15 + Math.sin(time/100)*5;
            ctx.beginPath(); ctx.arc(0, 10, r, -0.5, 0.5); ctx.stroke();
          }
        }
        ctx.restore();
        
        ctx.save();
        if (target.magnetic && progress > 0.4) {
          const pull = (progress - 0.4) * 50;
          ctx.translate(centerX - pull + Math.sin(time * 50) * 3, centerY);
        } else {
          ctx.translate(centerX, centerY);
        }
        ctx.fillStyle = '#555555';
        roundRect(ctx, -40, -40, 80, 80, 10);
        ctx.fill();
        ctx.restore();
        break;

      case 'hammer':
        const swing = Math.sin(progress * Math.PI) * 1.2;
        ctx.save();
        ctx.translate(centerX + 60, centerY - 100);
        ctx.rotate(swing);
        // Hammer
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-6, 0, 12, 80);
        ctx.fillStyle = '#444444';
        ctx.fillRect(-30, -30, 60, 30);
        ctx.restore();
        
        ctx.save();
        ctx.translate(centerX, centerY);
        if (progress > 0.5) {
          if (target.brittleness === 'shatters') {
            // Shatter effect
            ctx.fillStyle = '#555555';
            for(let i=0; i<12; i++) {
              const r = (progress-0.5)*200;
              const a = i * Math.PI * 2 / 12;
              ctx.fillRect(Math.cos(a)*r - 10, Math.sin(a)*r - 10, 20, 20);
            }
          } else if (target.brittleness === 'bends') {
            ctx.scale(1.2, 0.8);
            ctx.fillStyle = '#555555';
            roundRect(ctx, -40, -40, 80, 80, 10);
            ctx.fill();
          } else {
            ctx.fillStyle = '#555555';
            roundRect(ctx, -40, -40, 80, 80, 10);
            ctx.fill();
          }
          
          if (progress < 0.7) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'black 60px Nunito';
            ctx.textAlign = 'center';
            ctx.fillText('CLANG!', 0, -100);
          }
        } else {
          ctx.fillStyle = '#555555';
          roundRect(ctx, -40, -40, 80, 80, 10);
          ctx.fill();
        }
        ctx.restore();
        break;

      case 'flame':
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.fillStyle = '#555555';
        roundRect(ctx, -40, -40, 80, 80, 10);
        ctx.fill();
        
        // Torch
        ctx.translate(100 - progress*50, 0);
        ctx.fillStyle = '#D2B48C';
        ctx.fillRect(0, 0, 10, 60);
        ctx.fillStyle = '#FFA500';
        const fs = 20 + Math.sin(time/50)*5;
        ctx.beginPath(); ctx.arc(5, 0, fs, 0, Math.PI*2); ctx.fill();

        if (target.flammable && progress > 0.3) {
          ctx.translate(-100 + progress*50, 0);
          for(let i=0; i<15; i++) {
            ctx.fillStyle = `rgba(255, ${Math.random()*150}, 0, 0.6)`;
            ctx.beginPath(); 
            ctx.arc((Math.random()-0.5)*100, (Math.random()-0.5)*100 - (progress-0.3)*200, Math.random()*15, 0, Math.PI*2); 
            ctx.fill();
          }
        }
        ctx.restore();
        break;

      case 'circuit':
        ctx.save();
        ctx.translate(centerX, centerY);
        // Wires
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-150, 0); ctx.lineTo(-40, 0);
        ctx.moveTo(40, 0); ctx.lineTo(150, 0);
        ctx.stroke();
        
        // Battery
        ctx.fillStyle = '#333333';
        ctx.fillRect(-200, -20, 50, 40);
        
        // Bulb
        ctx.translate(180, 0);
        ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2);
        if (target.conductive && progress > 0.2) {
          const glow = 20 + Math.sin(time/100)*10;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, glow*2);
          g.addColorStop(0, '#FFFFFF');
          g.addColorStop(0.5, '#FFD700');
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.fill();
          // Rays
          ctx.strokeStyle = '#FFD700';
          for(let i=0; i<8; i++) {
            const a = i * Math.PI / 4;
            ctx.beginPath(); ctx.moveTo(Math.cos(a)*30, Math.sin(a)*30); ctx.lineTo(Math.cos(a)*50, Math.sin(a)*50); ctx.stroke();
          }
        } else {
          ctx.stroke();
        }
        ctx.restore();
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.fillStyle = '#555555';
        roundRect(ctx, -40, -40, 80, 80, 10);
        ctx.fill();
        ctx.restore();
        break;

      case 'acid':
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.fillStyle = '#555555';
        roundRect(ctx, -40, -40, 80, 80, 10);
        ctx.fill();
        
        if (target.acidReaction !== 'none' && progress > 0.4) {
          // Fizzing
          ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
          for(let i=0; i<20; i++) {
            const px = (Math.random()-0.5)*90;
            const py = (Math.random()-0.5)*90;
            ctx.beginPath(); ctx.arc(px, py, Math.random()*6, 0, Math.PI*2); ctx.fill();
          }
          // Bubbles rising
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          for(let i=0; i<5; i++) {
            ctx.beginPath(); ctx.arc((Math.random()-0.5)*80, -40 - (progress-0.4)*200 - i*20, 5, 0, Math.PI*2); ctx.fill();
          }
        }
        
        // Flask pouring
        ctx.translate(-100 + progress*50, -100);
        ctx.rotate(Math.PI/4);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(0, 0, 30, 60);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(2, 40, 26, 18);
        // Drips
        for(let i=0; i<3; i++) {
          ctx.beginPath(); ctx.arc(15, 65 + i*15 + (time%500)/10, 4, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
        break;
    }
    ctx.restore();

    if (progress >= 1) {
      anim.active = false;
      const tool = gs.tools.find(t => t.id === anim.toolId);
      if (tool) {
        animateSnapBack(tool);
      }
    }
  };

  const drawCards = (ctx: CanvasRenderingContext2D) => {
    const gs = gameStateRef.current;
    const cardW = 70;
    const cardH = 90;
    const gap = 10;
    const cols = 11;
    
    const totalGridW = cols * (cardW + gap) - gap;
    const startX = (window.innerWidth - totalGridW) / 2;
    const startY = window.innerHeight - 320;

    gs.cards.forEach((card, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);
      
      const el = ELEMENTS[i];
      
      // Category Color
      let catColor = '#A0A0A0';
      if (el.category === 'noble_gas') catColor = '#6EC6FF';
      if (el.category === 'nonmetal') catColor = '#FFD966';
      if (el.category === 'metalloid') catColor = '#CC8844';
      if (el.category === 'metal') catColor = '#E0E0E0';

      ctx.save();
      ctx.translate(x, y);
      
      // Card Base - Colored by category
      if (card.ruledOut) {
        ctx.fillStyle = '#222222';
        ctx.globalAlpha = 0.6;
      } else {
        ctx.fillStyle = catColor;
        // Add a slight gradient or darkening for better look
        const grad = ctx.createLinearGradient(0, 0, 0, cardH);
        grad.addColorStop(0, catColor);
        grad.addColorStop(1, adjustColor(catColor, -30));
        ctx.fillStyle = grad;
      }

      if (gs.isGuessing && !card.ruledOut) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#FFD700';
      }
      roundRect(ctx, 0, 0, cardW, cardH, 10);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      
      // Border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Symbol
      ctx.fillStyle = card.ruledOut ? '#666666' : (el.category === 'nonmetal' || el.category === 'metalloid' ? '#1a1a2e' : '#1a1a2e');
      // Actually, let's use a consistent dark color for text on colored backgrounds
      ctx.fillStyle = card.ruledOut ? '#555555' : '#1a1a2e';
      
      ctx.font = 'bold 24px Nunito';
      ctx.textAlign = 'center';
      ctx.fillText(el.symbol, cardW / 2, 45);

      // Name
      ctx.font = '10px Nunito';
      ctx.fillText(el.name, cardW / 2, 65);

      // Atomic Number
      ctx.font = 'bold 10px Nunito';
      ctx.textAlign = 'right';
      ctx.fillText(el.atomicNumber.toString(), cardW - 5, 22);

      if (card.ruledOut) {
        ctx.strokeStyle = '#FF4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(10, 20); ctx.lineTo(cardW - 10, cardH - 20);
        ctx.moveTo(cardW - 10, 20); ctx.lineTo(10, cardH - 20);
        ctx.stroke();
        
        // Contradicting test icon
        if (card.contradictingTest) {
          const tool = gs.tools.find(t => t.id === card.contradictingTest);
          if (tool) {
            ctx.font = '12px Arial';
            ctx.fillText(tool.icon, cardW / 2, cardH - 10);
          }
        }
      }

      ctx.restore();
    });
  };

  // Helper to darken/lighten color
  const adjustColor = (col: string, amt: number) => {
    let usePound = false;
    if (col[0] === "#") {
      col = col.slice(1);
      usePound = true;
    }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255; else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255; else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255; else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
  };

  const drawCursor = (ctx: CanvasRenderingContext2D, x: number, y: number, pinching: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 3;
    
    if (pinching) {
      ctx.strokeStyle = '#FFD700';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#FFD700';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
      ctx.fill();
    } else {
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
      // Hand outline
      ctx.beginPath();
      ctx.moveTo(-10, -10); ctx.lineTo(-10, 10);
      ctx.moveTo(10, -10); ctx.lineTo(10, 10);
      ctx.stroke();
    }
    ctx.restore();
  };

  const roundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number | { tl: number; tr: number; bl: number; br: number }
  ) => {
    if (typeof radius === 'number') {
      radius = { tl: radius, tr: radius, bl: radius, br: radius };
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
  };

  // --- LIFECYCLE ---
  useEffect(() => {
    const canvas = gameCanvasRef.current;
    if (!canvas) return;
    
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // MediaPipe Setup
    // @ts-ignore
    const hands = new window.Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5
    });
    
    hands.onResults(processHandResults);

    if (videoRef.current) {
      const startCamera = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            throw new Error('MediaDevices API not supported');
          }

          // Check if any video devices exist
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasVideo = devices.some(d => d.kind === 'videoinput');
          
          if (!hasVideo) {
            throw new Error('No camera found');
          }

          // Try starting with conservative resolution
          // @ts-ignore
          const camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current) {
                await hands.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });
          
          await camera.start();
          setUiState(prev => ({ ...prev, loading: false, mouseMode: false }));
        } catch (err) {
          console.warn("Camera failed, falling back to mouse mode:", err);
          enableMouseFallback();
          setUiState(prev => ({ ...prev, loading: false }));
        }
      };

      startCamera();
    }

    // Always enable mouse interaction for cards, even if not in mouseMode
    if (canvas) {
      const onMouseDown = (e: MouseEvent) => {
        // If not in mouseMode, only handle card interaction
        if (!gameStateRef.current.mouseMode) {
          const startY = window.innerHeight - 320;
          if (e.offsetY > startY - 20) {
            startGrab(e.offsetX, e.offsetY, false);
          }
        } else {
          gameStateRef.current.cursor.pinching = true;
          startGrab(e.offsetX, e.offsetY, false);
        }
      };
      const onMouseMove = (e: MouseEvent) => {
        if (gameStateRef.current.mouseMode) {
          gameStateRef.current.cursor.x = e.offsetX;
          gameStateRef.current.cursor.y = e.offsetY;
        }
      };
      const onMouseUp = (e: MouseEvent) => {
        if (gameStateRef.current.mouseMode) {
          gameStateRef.current.cursor.pinching = false;
          releaseGrab(e.offsetX, e.offsetY);
        }
      };

      canvas.addEventListener('mousedown', onMouseDown);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseup', onMouseUp);

      // Store for cleanup
      // @ts-ignore
      canvas._cleanup = () => {
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseup', onMouseUp);
      };
    }

    const enableMouseFallback = () => {
      gameStateRef.current.mouseMode = true;
      setUiState(prev => ({ ...prev, mouseMode: true }));
    };

    requestRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      // @ts-ignore
      if (canvas && canvas._cleanup) canvas._cleanup();
      
      // MediaPipe Cleanup
      if (hands) hands.close();
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [processHandResults, draw]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0f0e17] font-nunito no-select">
      <canvas ref={gameCanvasRef} className="absolute inset-0 block" />
      
      {/* UI OVERLAY */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Header */}
        {uiState.state !== 'START' && (
          <div className="flex items-center justify-between p-6 bg-black/40 backdrop-blur-sm pointer-events-auto">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-teal-500 rounded-lg">
                <FlaskConical className="text-white" />
              </div>
              <h1 className="text-2xl font-black tracking-tighter text-white uppercase">Element Detective</h1>
            </div>
            
            <div className="flex gap-8">
              <div className="text-center">
                <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">Round</p>
                <p className="text-xl font-black text-white">{uiState.round}/10</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">Score</p>
                <p className="text-xl font-black text-gold-400 text-[#FFD700]">⭐ {uiState.score}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">Streak</p>
                <p className={`text-xl font-black ${uiState.streak >= 3 ? 'text-purple-400' : 'text-white'}`}>🔥 {uiState.streak}</p>
              </div>
              
              <button 
                onClick={initTutorial}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all"
                title="Help / Tutorial"
              >
                <HelpCircle className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Hint Bar */}
        {uiState.state !== 'START' && (
          <div className="absolute top-[100px] left-1/2 -translate-x-1/2 w-full max-w-2xl px-8 pointer-events-none z-30">
            <div className="px-6 py-3 bg-teal-900/90 backdrop-blur-md border-2 border-teal-400/50 rounded-2xl flex items-center gap-3 shadow-2xl shadow-teal-900/40 pointer-events-auto">
              <Info className="text-teal-300 w-5 h-5 flex-shrink-0" />
              <p className="text-lg font-bold text-teal-50">{uiState.hint}</p>
            </div>
          </div>
        )}

        {/* Bottom Controls (Moved back to Bottom) */}
        {(uiState.state === 'ROUND' || (uiState.state === 'TUTORIAL' && uiState.tutorialStep === 5)) && (
          <div className="absolute bottom-[160px] left-0 right-0 flex justify-center gap-4 pointer-events-auto z-30">
            <button 
              onClick={() => {
                gameStateRef.current.isGuessing = true;
                setUiState(prev => ({ ...prev, isGuessing: true, hint: "Select an element card to make your final guess!" }));
              }}
              aria-label="Make a guess"
              className={`flex items-center gap-2 px-8 py-4 rounded-full font-black text-lg transition-all transform active:scale-95 shadow-xl ${
                uiState.isGuessing 
                ? 'bg-blue-500 text-white pulse-accent' 
                : (uiState.isPractice ? 'bg-green-600 text-white pulse-success' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10')
              }`}
            >
              <Target className="w-6 h-6" />
              {uiState.isGuessing ? 'SELECT A CARD' : 'MAKE MY GUESS'}
            </button>
            
            <button 
              onClick={resetGame}
              aria-label={uiState.isPractice ? "End practice" : "Reset game"}
              className="flex items-center gap-2 px-8 py-4 bg-white/5 text-white/70 rounded-full font-black text-lg hover:bg-white/10 hover:text-white transition-all active:scale-95 border border-white/5"
            >
              <RefreshCw className="w-6 h-6" />
              {uiState.isPractice ? 'END PRACTICE' : 'RESET'}
            </button>
          </div>
        )}

        {/* Tool Labels (Sidebars) */}
        <div className="absolute left-1/2 -translate-x-[340px] top-0 bottom-0 flex flex-col pointer-events-none opacity-40">
          <div className="absolute top-[220px] left-0 right-0 label-micro text-blue-400 font-mono text-center w-24">Water Tank</div>
          <div className="absolute top-[340px] left-0 right-0 label-micro text-blue-400 font-mono text-center w-24">Magnet</div>
          <div className="absolute top-[460px] left-0 right-0 label-micro text-blue-400 font-mono text-center w-24">Hammer</div>
        </div>
        <div className="absolute left-1/2 translate-x-[240px] top-0 bottom-0 flex flex-col pointer-events-none opacity-40">
          <div className="absolute top-[220px] left-0 right-0 label-micro text-blue-400 font-mono text-center w-24">Flame</div>
          <div className="absolute top-[340px] left-0 right-0 label-micro text-blue-400 font-mono text-center w-24">Circuit</div>
          <div className="absolute top-[460px] left-0 right-0 label-micro text-blue-400 font-mono text-center w-24">Acid</div>
        </div>
      </div>

      {/* PREVIEW CANVAS - Positioned to the side */}
      <div className="absolute bottom-6 right-6 w-[180px] h-[135px] rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl bg-black z-40">
        <canvas ref={previewCanvasRef} width={180} height={135} className="w-full h-full" />
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[8px] font-bold text-white flex items-center gap-1">
          <CameraIcon className="w-2 h-2" />
          LIVE FEED
        </div>
      </div>

      {/* MOUSE MODE BADGE */}
      {uiState.mouseMode && (
        <div className="absolute top-24 right-6 px-4 py-2 bg-white/10 border border-white/20 rounded-lg flex items-center gap-2 text-white font-bold animate-bounce">
          <MousePointer2 className="w-4 h-4" />
          🖱️ Mouse Mode
        </div>
      )}

      {/* START SCREEN */}
      <AnimatePresence>
        {uiState.state === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f0e17] p-12 text-center overflow-hidden"
          >
            {/* Background elements */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500 rounded-full blur-[120px]" />
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="relative z-10"
            >
              <div className="w-24 h-24 bg-blue-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-500/40 rotate-12">
                <FlaskConical className="w-12 h-12 text-white -rotate-12" />
              </div>
              <h1 className="text-8xl font-black text-white tracking-tighter mb-6 uppercase heading-display leading-[0.85]">
                Virtual<br/><span className="text-blue-500">Chem Lab</span>
              </h1>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed font-medium">
                Identify mystery elements using advanced lab tools. 
                Pinch to grab, drag to test, and use your logic to solve the case.
              </p>
              
              {uiState.loading ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-blue-400 font-mono text-sm tracking-widest uppercase">Initializing Lab Equipment...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-8">
                  {uiState.mouseMode && (
                    <div className="px-6 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 font-bold flex items-center gap-2 text-sm">
                      <CameraOff className="w-4 h-4" />
                      Camera not found — Using Mouse Mode
                    </div>
                  )}
                  
                  <div className="flex flex-wrap justify-center gap-6">
                    {!uiState.mouseMode && (
                      <button 
                        onClick={() => {
                          gameStateRef.current.isFlipped = !gameStateRef.current.isFlipped;
                          setUiState(prev => ({ ...prev, isFlipped: !prev.isFlipped }));
                        }}
                        aria-label="Flip Camera"
                        className={`px-6 py-5 rounded-[24px] font-black text-xl transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 border backdrop-blur-sm ${
                          uiState.isFlipped 
                          ? 'bg-teal-500/20 text-teal-400 border-teal-500/30' 
                          : 'bg-white/5 text-white border-white/10'
                        }`}
                      >
                        <RefreshCw className={`w-6 h-6 ${uiState.isFlipped ? 'rotate-180' : ''} transition-transform`} />
                        {uiState.isFlipped ? 'MIRROR: ON' : 'MIRROR: OFF'}
                      </button>
                    )}
                    <button 
                      onClick={initTutorial}
                      aria-label="Start Tutorial"
                      className="px-10 py-5 bg-white/5 hover:bg-white/10 text-white rounded-[24px] font-black text-xl transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 border border-white/10 backdrop-blur-sm"
                    >
                      <HelpCircle className="w-6 h-6 text-blue-400" />
                      TUTORIAL
                    </button>
                    <button 
                      onClick={() => initRound(false)}
                      aria-label="Start Game"
                      className="px-14 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-[24px] font-black text-2xl shadow-2xl shadow-blue-600/30 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-4"
                    >
                      <Play className="w-8 h-8 fill-current" />
                      PLAY NOW
                    </button>
                  </div>

                  <div className="flex gap-8 mt-4">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                        <Hand className="w-6 h-6 text-gray-400" />
                      </div>
                      <span className="label-micro">Hand Tracking</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                        <MousePointer2 className="w-6 h-6 text-gray-400" />
                      </div>
                      <span className="label-micro">Mouse Support</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HELP & SETTINGS BUTTONS */}
      {uiState.state === 'ROUND' && (
        <div className="absolute top-6 right-6 z-40 flex gap-3">
          {!uiState.mouseMode && (
            <button 
              onClick={() => {
                gameStateRef.current.isFlipped = !gameStateRef.current.isFlipped;
                setUiState(prev => ({ ...prev, isFlipped: !prev.isFlipped }));
              }}
              aria-label="Flip Camera"
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border backdrop-blur-md shadow-lg ${
                uiState.isFlipped 
                ? 'bg-teal-500 text-white border-teal-400' 
                : 'bg-white/5 hover:bg-white/10 text-white border-white/10'
              }`}
              title="Flip Camera Mirroring"
            >
              <RefreshCw className={`w-6 h-6 ${uiState.isFlipped ? 'rotate-180' : ''} transition-transform`} />
            </button>
          )}
          <button 
            onClick={() => {
              gameStateRef.current.mouseMode = !gameStateRef.current.mouseMode;
              setUiState(prev => ({ ...prev, mouseMode: !prev.mouseMode }));
            }}
            aria-label={uiState.mouseMode ? "Switch to Camera Mode" : "Switch to Mouse Mode"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border backdrop-blur-md shadow-lg ${
              uiState.mouseMode 
              ? 'bg-blue-500 text-white border-blue-400' 
              : 'bg-white/5 hover:bg-white/10 text-white border-white/10'
            }`}
          >
            <MousePointer2 className="w-6 h-6" />
          </button>
          <button 
            onClick={initTutorial}
            aria-label="Open Tutorial"
            className="w-12 h-12 bg-white/5 hover:bg-white/10 text-white rounded-full flex items-center justify-center transition-all border border-white/10 backdrop-blur-md shadow-lg"
          >
            <HelpCircle className="w-6 h-6" />
          </button>
        </div>
      )}
      <AnimatePresence>
        {uiState.state === 'TUTORIAL' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] pointer-events-none"
          >
            {!uiState.isTutorialMinimized ? (
              <>
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
                
                <div className="absolute inset-0 flex items-start justify-center p-8 pt-16">
                  <motion.div 
                    key={uiState.tutorialStep}
                    initial={{ scale: 0.9, y: -20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    className="bg-[#1a1a2e]/90 backdrop-blur-md border-2 border-teal-500/50 rounded-[32px] p-6 max-w-md w-full shadow-2xl pointer-events-auto"
                  >
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center text-white font-bold">
                          {uiState.tutorialStep}
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Tutorial</h2>
                      </div>
                      <button 
                        onClick={() => {
                          gameStateRef.current.state = 'START';
                          setUiState(prev => ({ ...prev, state: 'START' }));
                        }}
                        aria-label="Close Tutorial"
                        className="p-2 text-gray-500 hover:text-white transition-all hover:bg-white/5 rounded-full"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="text-gray-300 text-lg mb-8 leading-relaxed">
                      {uiState.tutorialStep === 1 && (
                        <p>Welcome, Scientist! Your mission is to identify mystery elements using lab tools. Let's start by learning the basics.</p>
                      )}
                      {uiState.tutorialStep === 2 && (
                        <p>To pick up a tool, <strong>pinch your fingers</strong> (or click and hold) over a tool icon on the sides. <br/><span className="text-teal-400 text-sm font-bold">{uiState.tutorialActionCompleted ? 'Action completed!' : 'Action: Grab any tool to continue.'}</span></p>
                      )}
                      {uiState.tutorialStep === 3 && (
                        <p>Drag the tool to the <strong>center box</strong> and release it to perform a test. <br/><span className="text-teal-400 text-sm font-bold">{uiState.tutorialActionCompleted ? 'Action completed!' : 'Action: Apply a test to the element.'}</span></p>
                      )}
                      {uiState.tutorialStep === 4 && (
                        <p>Use hints to <strong>rule out</strong> elements. Click or pinch a card at the bottom to cross it out. <br/><span className="text-teal-400 text-sm font-bold">{uiState.tutorialActionCompleted ? 'Action completed!' : 'Action: Rule out any element card.'}</span></p>
                      )}
                      {uiState.tutorialStep === 5 && (
                        <p>When you're ready, click <strong>MAKE MY GUESS</strong> and select the correct element card. <br/><span className="text-teal-400 text-sm font-bold">Ready to practice?</span></p>
                      )}
                    </div>

                    <div className="flex justify-between items-center">
                      <button 
                        onClick={() => {
                          gameStateRef.current.state = 'START';
                          setUiState(prev => ({ ...prev, state: 'START' }));
                        }}
                        className="text-gray-500 font-bold hover:text-white transition-colors"
                      >
                        SKIP
                      </button>
                      
                      <div className="flex gap-3">
                        {uiState.tutorialStep > 1 && uiState.tutorialStep < 5 && !uiState.tutorialActionCompleted && (
                          <button 
                            onClick={() => {
                              gameStateRef.current.isTutorialMinimized = true;
                              setUiState(prev => ({ ...prev, isTutorialMinimized: true }));
                            }}
                            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all"
                          >
                            TRY IT!
                          </button>
                        )}

                        {uiState.tutorialStep < 5 ? (
                          <div className="flex flex-col items-end gap-2">
                            <button 
                              onClick={() => {
                                gameStateRef.current.tutorialStep++;
                                gameStateRef.current.tutorialActionCompleted = false;
                                gameStateRef.current.isTutorialMinimized = false;
                                setUiState(prev => ({ 
                                  ...prev, 
                                  tutorialStep: prev.tutorialStep + 1,
                                  tutorialActionCompleted: false,
                                  isTutorialMinimized: false
                                }));
                              }}
                              disabled={uiState.tutorialStep > 1 && !uiState.tutorialActionCompleted}
                              className={`px-8 py-3 rounded-xl font-black transition-all transform active:scale-95 ${
                                (uiState.tutorialStep === 1 || uiState.tutorialActionCompleted)
                                ? 'bg-teal-500 hover:bg-teal-400 text-white'
                                : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                              }`}
                            >
                              NEXT
                            </button>
                            {uiState.tutorialStep > 1 && !uiState.tutorialActionCompleted && (
                              <p className="text-teal-400 text-xs font-bold animate-pulse">Perform the action to continue</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <button 
                              onClick={() => {
                                gameStateRef.current.state = 'START';
                                setUiState(prev => ({ ...prev, state: 'START' }));
                              }}
                              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all"
                            >
                              EXIT
                            </button>
                            <button 
                              onClick={() => {
                                gameStateRef.current.state = 'ROUND';
                                setUiState(prev => ({ ...prev, state: 'ROUND', hint: "PRACTICE ROUND: Try it out!" }));
                              }}
                              className="px-8 py-3 bg-teal-500 hover:bg-teal-400 text-white rounded-xl font-black transition-all transform active:scale-95"
                            >
                              PRACTICE NOW
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </div>
              </>
            ) : (
              <div className="absolute top-24 right-8 pointer-events-auto">
                <button 
                  onClick={() => {
                    gameStateRef.current.isTutorialMinimized = false;
                    setUiState(prev => ({ ...prev, isTutorialMinimized: false }));
                  }}
                  className="px-6 py-3 bg-teal-500/90 backdrop-blur-md border-2 border-teal-400/50 text-white rounded-xl font-black shadow-xl hover:bg-teal-400 transition-all flex items-center gap-2"
                >
                  <HelpCircle className="w-5 h-5" />
                  SHOW INSTRUCTIONS
                </button>
              </div>
            )}

            {/* Visual Cues */}
            {uiState.tutorialStep === 2 && (
              <>
                {/* Left Side Tools */}
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="absolute left-12 top-[220px] -translate-y-1/2 flex flex-col items-center gap-4"
                >
                  <div className="w-32 h-80 border-4 border-blue-500 rounded-3xl animate-pulse shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
                  <p className="text-blue-400 font-black text-lg bg-black/80 px-4 py-2 rounded-full border border-blue-500/30 whitespace-nowrap">GRAB TOOLS</p>
                </motion.div>
                {/* Right Side Tools */}
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="absolute right-12 top-[220px] -translate-y-1/2 flex flex-col items-center gap-4"
                >
                  <div className="w-32 h-80 border-4 border-blue-500 rounded-3xl animate-pulse shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
                  <p className="text-blue-400 font-black text-lg bg-black/80 px-4 py-2 rounded-full border border-blue-500/30 whitespace-nowrap">GRAB TOOLS</p>
                </motion.div>
              </>
            )}
            {uiState.tutorialStep === 3 && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4"
              >
                <div className="w-64 h-64 border-4 border-blue-500 rounded-[40px] animate-pulse shadow-[0_0_30px_rgba(59,130,246,0.5)]" />
                <p className="text-blue-400 font-black text-xl bg-black/80 px-6 py-2 rounded-full border border-blue-500/30">DRAG TO BOX</p>
              </motion.div>
            )}
            {uiState.tutorialStep === 4 && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4"
              >
                <div className="w-[95vw] h-44 border-4 border-blue-500 rounded-3xl animate-pulse shadow-[0_0_30px_rgba(59,130,246,0.5)]" />
                <p className="text-blue-400 font-black text-xl bg-black/80 px-6 py-2 rounded-full border border-blue-500/30">RULE OUT CARDS HERE</p>
              </motion.div>
            )}
            {(uiState.tutorialStep === 5 || (uiState.state === 'ROUND' && uiState.isPractice && !uiState.showOutcome)) && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute bottom-[240px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-20"
              >
                <div className="w-72 h-28 border-4 border-green-500 rounded-3xl animate-pulse shadow-[0_0_30px_rgba(16,185,129,0.5)]" />
                <p className="text-green-400 font-black text-xl bg-black/80 px-6 py-2 rounded-full border border-green-500/30">CLICK MAKE MY GUESS</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {uiState.showOutcome && uiState.targetElement && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#0f0e17]/95 backdrop-blur-xl p-8"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#1a1a2e] border border-white/10 rounded-[48px] max-w-5xl w-full overflow-hidden shadow-2xl relative"
            >
              {/* Background Glow */}
              <div 
                className="absolute top-0 left-0 w-full h-2 opacity-50"
                style={{ backgroundColor: uiState.targetElement.color }}
              />

              <div className="flex flex-col md:flex-row h-full">
                {/* Element Visual */}
                <div className="md:w-2/5 p-12 flex flex-col items-center justify-center bg-white/5 border-r border-white/5">
                  <motion.div 
                    initial={{ scale: 0.8, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", damping: 12 }}
                    className="w-56 h-56 rounded-[48px] flex flex-col items-center justify-center shadow-2xl mb-10 relative group"
                    style={{ backgroundColor: uiState.targetElement.color }}
                  >
                    <div className="absolute inset-0 bg-white/20 rounded-[48px] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="text-8xl font-black text-black/80 heading-display">{uiState.targetElement.symbol}</span>
                    <span className="text-2xl font-bold text-black/60 uppercase tracking-tighter">{uiState.targetElement.name}</span>
                  </motion.div>
                  <div className="text-center">
                    <div className="label-micro mb-2">Atomic Number</div>
                    <p className="text-5xl font-black text-white mb-4">{uiState.targetElement.atomicNumber}</p>
                    <div className="px-6 py-2 bg-white/10 rounded-full border border-white/10">
                      <p className="text-sm text-blue-400 font-black uppercase tracking-[0.2em]">{uiState.targetElement.category.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>

                {/* Element Info */}
                <div className="md:w-3/5 p-16 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className={`w-3 h-3 rounded-full ${uiState.outcomeCorrect ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                      <h2 className={`text-5xl font-black heading-display ${uiState.outcomeCorrect ? 'text-green-400' : 'text-red-400'}`}>
                        {uiState.outcomeMessage}
                      </h2>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-10">
                      <div className="space-y-3">
                        <h3 className="label-micro">Scientific Description</h3>
                        <p className="text-xl text-gray-300 leading-relaxed font-medium">{uiState.targetElement.description}</p>
                      </div>
                      
                      <div className="space-y-3">
                        <h3 className="label-micro">Real World Applications</h3>
                        <p className="text-xl text-gray-300 leading-relaxed font-medium">{uiState.targetElement.realLifeUses}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-6 mt-16">
                    <button 
                      onClick={() => {
                        if (uiState.isPractice) {
                          initRound(false);
                        } else if (gameStateRef.current.round >= 10) {
                          resetGame();
                        } else {
                          gameStateRef.current.round++;
                          initRound();
                        }
                      }}
                      aria-label={uiState.isPractice ? "Start Mission" : (gameStateRef.current.round >= 10 ? "Play Again" : "Next Round")}
                      className="flex-1 py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-[24px] font-black text-2xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3"
                    >
                      {uiState.isPractice ? 'START MISSION' : (gameStateRef.current.round >= 10 ? 'PLAY AGAIN' : 'NEXT ROUND')}
                      <Play className="w-6 h-6 fill-current" />
                    </button>
                    {uiState.maxStreak >= 3 && (
                      <button 
                        onClick={() => {
                          setUiState(prev => ({ ...prev, showCertificate: true }));
                          gameStateRef.current.showCertificate = true;
                        }}
                        aria-label="Get Certificate"
                        className="flex-1 py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-[24px] font-black text-2xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl shadow-purple-600/20 flex items-center justify-center gap-3"
                      >
                        <Award className="w-7 h-7" />
                        CERTIFICATE
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CERTIFICATE FORM */}
      <AnimatePresence>
        {uiState.showCertificate && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-[#0f0e17]/95 backdrop-blur-xl p-8"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#1a1a2e] border border-purple-500/30 rounded-[48px] max-w-4xl w-full p-10 shadow-2xl relative overflow-hidden"
            >
              {/* Decorative Elements */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/20 blur-[80px] rounded-full" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/20 blur-[80px] rounded-full" />

              <button 
                onClick={() => setUiState(prev => ({ ...prev, showCertificate: false }))}
                aria-label="Close Certificate"
                className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all z-10"
              >
                <X className="w-8 h-8" />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                <div className="space-y-8">
                  <div className="text-left relative">
                    <div className="w-20 h-20 bg-purple-500/10 rounded-[28px] flex items-center justify-center mb-6 border border-purple-500/20 shadow-lg shadow-purple-500/10">
                      <Award className="w-10 h-10 text-purple-400" />
                    </div>
                    <h2 className="text-4xl font-black text-white mb-2 heading-display uppercase tracking-tighter">Chemist Badge</h2>
                    <p className="text-lg text-gray-400 font-medium">You've identified {uiState.maxStreak} elements in a row!</p>
                  </div>

                  <div className="space-y-4">
                    <label className="label-micro ml-2">Chemist Name</label>
                    <input 
                      type="text" 
                      value={uiState.certificateName}
                      onChange={(e) => {
                        setUiState(prev => ({ ...prev, certificateName: e.target.value }));
                        gameStateRef.current.certificateName = e.target.value;
                      }}
                      placeholder="Enter your name..."
                      aria-label="Enter your name for the certificate"
                      className="w-full bg-white/5 border-2 border-white/10 rounded-[24px] px-6 py-4 text-white text-xl focus:border-purple-500/50 focus:bg-white/10 outline-none transition-all placeholder:text-gray-600"
                    />
                  </div>

                  <div className="flex gap-4">
                    {!uiState.mouseMode && (
                      <button 
                        onClick={capturePhoto}
                        aria-label="Capture Photo"
                        className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white rounded-[20px] font-black text-lg transition-all border border-white/10 flex items-center justify-center gap-3"
                      >
                        <CameraIcon className="w-5 h-5" />
                        {uiState.certificatePhoto ? 'RETAKE' : 'PHOTO'}
                      </button>
                    )}
                    <button 
                      onClick={downloadCertificate}
                      disabled={!uiState.certificateName}
                      aria-label="Download Certificate"
                      className="flex-[2] py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-[20px] font-black text-xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl shadow-purple-600/20 flex items-center justify-center gap-3"
                    >
                      <Download className="w-6 h-6" />
                      CLAIM BADGE
                    </button>
                  </div>
                </div>

                <div className="flex justify-center">
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
                    <div className="relative w-72 h-72 bg-black/40 rounded-full overflow-hidden border-4 border-purple-500/30 flex items-center justify-center shadow-inner">
                      {uiState.certificatePhoto ? (
                        <img 
                          src={uiState.certificatePhoto} 
                          alt="Detective Profile" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                          <CameraIcon className="w-16 h-16 opacity-30" />
                          <span className="text-sm font-bold uppercase tracking-widest">No Photo</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <video ref={videoRef} className="hidden" playsInline muted />
    </div>
  );
}
