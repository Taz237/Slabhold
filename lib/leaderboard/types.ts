export type LeaderboardEntry = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accent: string;
  percent: number;
  delta: number;
  cardCount: number;
  percentLabel: string;
  deltaLabel: string;
};

export type LeaderboardWindow = {
  open: boolean;
  rows: LeaderboardEntry[];
  message: string | null;
};

export type LeaderboardModel = {
  today: string;
  dateLabel: string;
  monday: boolean;
  note: string;
  day: LeaderboardWindow;
  week: LeaderboardWindow;
  viewerUserId: string | null;
};
