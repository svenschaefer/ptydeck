export function isTerminalAtBottom(terminal) {
  if (!terminal || !terminal.buffer || !terminal.buffer.active) {
    return true;
  }
  const active = terminal.buffer.active;
  return Number(active.baseY) === Number(active.ydisp);
}

function resolveViewport(terminal) {
  return terminal?._core?.viewport || terminal?._core?._viewport || null;
}

export function syncTerminalScrollArea(terminal) {
  const viewport = resolveViewport(terminal);
  if (!viewport || typeof viewport.syncScrollArea !== "function") {
    return false;
  }
  viewport.syncScrollArea();
  return true;
}

export function refreshTerminalViewport(terminal) {
  if (!terminal || typeof terminal.refresh !== "function") {
    return false;
  }
  const rowCount = Number(terminal.rows);
  const lastRow = Number.isFinite(rowCount) && rowCount > 0 ? Math.max(0, rowCount - 1) : 0;
  terminal.refresh(0, lastRow);
  return true;
}

export function getTerminalCellHeightPx(terminal) {
  const height = Number(terminal?._core?._renderService?.dimensions?.css?.cell?.height) || 0;
  return height > 0 ? height : 0;
}
