import { createAppRuntimeCompositionController } from "./app-runtime-composition-controller.js";

const app = createAppRuntimeCompositionController({
  windowRef: window,
  documentRef: document
});

app.initialize().catch(() => {
  app.setInitializationError("Failed to initialize application runtime.");
});
