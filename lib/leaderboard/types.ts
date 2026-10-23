export type ValueBoardRow = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accent: string;
  percent: number;
  percentLabel: string;
  flagged: boolean;
  rank: number;
};

export type ValueBracketBoard = {
  id: string;
  label: string;
  rows: ValueBoardRow[];
};

export type ValueBoardModel = {
  start: string;
  end: string;
  weekLabel: string;
  note: string;
  /** Set when every bracket has fewer than 10 people. */
  closedMessage: string | null;
  /** Set when the board is open and this viewer has nobody left to see. */
  emptyMessage: string | null;
  brackets: ValueBracketBoard[];
  viewerUserId: string | null;
};
