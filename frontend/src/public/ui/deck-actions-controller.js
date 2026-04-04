export function createDeckActionsController(options = {}) {
  const windowRef = options.windowRef || (typeof window !== "undefined" ? window : null);
  const api = options.api;
  const getActiveDeck = typeof options.getActiveDeck === "function" ? options.getActiveDeck : () => null;
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getTerminalSettings = typeof options.getTerminalSettings === "function" ? options.getTerminalSettings : () => ({ cols: 80, rows: 20 });
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => {};
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const defaultDeckId = String(options.defaultDeckId || "default");
  const requestText =
    typeof options.requestText === "function"
      ? options.requestText
      : async ({ message = "", defaultValue = "" } = {}) => {
          if (!windowRef || typeof windowRef.prompt !== "function") {
            return null;
          }
          const value = windowRef.prompt(message, defaultValue);
          return value === null || value === undefined ? null : String(value);
        };
  const confirmAction =
    typeof options.confirmAction === "function"
      ? options.confirmAction
      : async ({ message = "" } = {}) => {
          if (!windowRef || typeof windowRef.confirm !== "function") {
            return false;
          }
          return windowRef.confirm(message);
        };

  async function createDeckFlow() {
    const input = await requestText({
      title: "Create Deck",
      message: "Enter the new deck name.",
      inputLabel: "Deck Name",
      defaultValue: "New Deck",
      confirmLabel: "Create"
    });
    if (input === null) {
      return;
    }
    const name = String(input).trim();
    if (!name) {
      setError("Deck name cannot be empty.");
      return;
    }
    const settings = getTerminalSettings();
    const created = await api.createDeck({
      name,
      settings: {
        terminal: {
          cols: settings.cols,
          rows: settings.rows
        }
      }
    });
    applyRuntimeEvent(
      {
        type: "deck.created",
        deck: created
      },
      { preferredActiveDeckId: created.id }
    );
    setCommandFeedback(`Created deck '${created.name}'.`);
  }

  async function renameDeckFlow() {
    const activeDeck = getActiveDeck();
    if (!activeDeck) {
      setError("No active deck to rename.");
      return;
    }
    const input = await requestText({
      title: "Rename Deck",
      message: `Enter a new name for deck '${activeDeck.name || activeDeck.id}'.`,
      inputLabel: "Deck Name",
      defaultValue: activeDeck.name || activeDeck.id,
      confirmLabel: "Rename"
    });
    if (input === null) {
      return;
    }
    const name = String(input).trim();
    if (!name) {
      setError("Deck name cannot be empty.");
      return;
    }
    const updated = await api.updateDeck(activeDeck.id, { name });
    applyRuntimeEvent(
      {
        type: "deck.updated",
        deck: updated
      },
      { preferredActiveDeckId: updated.id }
    );
    setCommandFeedback(`Renamed deck to '${updated.name}'.`);
  }

  async function deleteDeckFlow() {
    const activeDeck = getActiveDeck();
    if (!activeDeck) {
      setError("No active deck to delete.");
      return;
    }
    const confirmed = await confirmAction({
      title: "Delete Deck",
      message: `Delete deck '${activeDeck.name}'?`,
      confirmLabel: "Delete"
    });
    if (!confirmed) {
      return;
    }
    try {
      await api.deleteDeck(activeDeck.id, { force: false });
    } catch (err) {
      if (err && err.status === 409) {
        const forceConfirmed = await confirmAction({
          title: "Force Delete Deck",
          message: `Deck '${activeDeck.name}' still contains sessions. Force delete and move sessions to the default deck?`,
          confirmLabel: "Force Delete"
        });
        if (!forceConfirmed) {
          return;
        }
        await api.deleteDeck(activeDeck.id, { force: true });
      } else {
        throw err;
      }
    }
    const decks = Array.isArray(getDecks()) ? getDecks() : [];
    const fallbackId = decks.find((deck) => deck.id !== activeDeck.id)?.id || defaultDeckId;
    applyRuntimeEvent(
      {
        type: "deck.deleted",
        deckId: activeDeck.id,
        fallbackDeckId: fallbackId
      },
      { preferredActiveDeckId: fallbackId }
    );
    setCommandFeedback(`Deleted deck '${activeDeck.name}'.`);
  }

  return {
    createDeckFlow,
    renameDeckFlow,
    deleteDeckFlow
  };
}
