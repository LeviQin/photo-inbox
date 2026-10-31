export function photoGridIndexAtPoint(input: {
  pageX: number;
  pageY: number;
  originX: number;
  originY: number;
  scrollOffset: number;
  headerHeight: number;
  horizontalPadding: number;
  tileSide: number;
  gap: number;
  columns: number;
  itemCount: number;
}) {
  const stride = input.tileSide + input.gap;
  if (stride <= 0 || input.columns < 1) return null;

  const x = input.pageX - input.originX - input.horizontalPadding;
  const y = input.pageY - input.originY + input.scrollOffset - input.headerHeight;
  if (x < 0 || y < 0) return null;

  const column = Math.floor(x / stride);
  const row = Math.floor(y / stride);
  if (column >= input.columns || x % stride >= input.tileSide || y % stride >= input.tileSide) return null;

  const index = row * input.columns + column;
  return index < input.itemCount ? index : null;
}
