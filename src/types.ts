import { ElementData } from './elements';

export type GameState = 'START' | 'ROUND' | 'OUTCOME' | 'INFO' | 'TUTORIAL';

export interface Tool {
  id: string;
  name: string;
  icon: string;
  x: number;
  y: number;
  originalX: number;
  originalY: number;
  width: number;
  height: number;
  grabbed: boolean;
  used: boolean;
}

export interface AnimationState {
  toolId: string | null;
  startTime: number;
  duration: number;
  active: boolean;
  progress: number;
}

export interface CardState {
  symbol: string;
  ruledOut: boolean;
  contradictingTest: string | null;
  hint: string | null;
}
