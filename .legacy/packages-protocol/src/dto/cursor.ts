export type CursorItem = {
  s: string;
  q: number;
  t: number;
};

export type Cursor = {
  v: 1;
  items: CursorItem[];
};
