import {
  STARTUP_BACKUP_ID,
  STARTUP_BACKUP_SOURCE_KEYS,
  STARTUP_BACKUP_STORAGE_KEY,
  createStartupBackupRuntimeController
} from "./startup-backup-runtime-controller.js";

function formatTimestamp(value) {
  if (!Number.isInteger(value) || value <= 0) {
    return "unknown";
  }
  try {
    return new Date(value).toISOString();
  } catch {
    return String(value);
  }
}

function setText(node, text) {
  if (!node) {
    return;
  }
  node.textContent = typeof text === "string" ? text : String(text || "");
}

const controller = createStartupBackupRuntimeController({
  windowRef: window
});

const statusEl = document.getElementById("rollback-restore-status");
const detailEl = document.getElementById("rollback-restore-detail");
const sourceListEl = document.getElementById("rollback-restore-source-keys");
const restoreBtn = document.getElementById("rollback-restore-run");

function renderSourceKeys(keys = []) {
  if (!sourceListEl) {
    return;
  }
  if (typeof sourceListEl.replaceChildren === "function") {
    sourceListEl.replaceChildren();
  } else {
    sourceListEl.innerHTML = "";
  }
  for (const key of keys) {
    const item = document.createElement("li");
    item.textContent = key;
    sourceListEl.appendChild(item);
  }
}

function renderBackupStatus() {
  try {
    const backup = controller.getStartupBackup();
    if (!backup) {
      setText(statusEl, `No browser rollback backup found in ${STARTUP_BACKUP_STORAGE_KEY}.`);
      setText(
        detailEl,
        `This page only restores the pre-H62 browser snapshot (${STARTUP_BACKUP_ID}) after the feature branch has created it on first startup.`
      );
      renderSourceKeys(STARTUP_BACKUP_SOURCE_KEYS);
      if (restoreBtn) {
        restoreBtn.disabled = true;
      }
      return;
    }

    const sourceKeys =
      Array.isArray(backup.sourceKeys) && backup.sourceKeys.length > 0 ? backup.sourceKeys : STARTUP_BACKUP_SOURCE_KEYS;
    setText(statusEl, `Browser rollback backup '${backup.backupId}' is ready.`);
    setText(
      detailEl,
      `Created at ${formatTimestamp(backup.createdAt)}. Restoring will overwrite the listed browser-local ptydeck keys with their pre-H62 values and remove keys that were absent in the original snapshot.`
    );
    renderSourceKeys(sourceKeys);
    if (restoreBtn) {
      restoreBtn.disabled = false;
    }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : String(error);
    setText(statusEl, "Rollback backup is invalid.");
    setText(detailEl, message);
    renderSourceKeys(STARTUP_BACKUP_SOURCE_KEYS);
    if (restoreBtn) {
      restoreBtn.disabled = true;
    }
  }
}

restoreBtn?.addEventListener("click", () => {
  try {
    const result = controller.restoreStartupBackup();
    setText(
      statusEl,
      `Browser rollback restore completed. Restored ${result.restoredKeys.length} key(s) and removed ${result.removedKeys.length} key(s).`
    );
    setText(
      detailEl,
      "Browser-local state is back at the pre-H62 snapshot. You can now switch back to main and reload the app in this same browser profile."
    );
    renderSourceKeys(result.backup.sourceKeys || STARTUP_BACKUP_SOURCE_KEYS);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : String(error);
    setText(statusEl, "Browser rollback restore failed.");
    setText(detailEl, message);
  }
});

renderBackupStatus();
