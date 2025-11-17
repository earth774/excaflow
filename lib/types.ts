// Using any for storage compatibility - types will be enforced at component level
export interface DrawingData {
  elements: readonly any[];
  appState: Partial<any>;
  timestamp: number;
}

export interface Room {
  id: string;
  name: string;
  createdAt: number;
}

export type SaveStatus = "saved" | "unsaved" | "saving";

