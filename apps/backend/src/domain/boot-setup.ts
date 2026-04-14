import type { BootSetupEvent, BootSetupPhase, BootSetupStatus } from "@intentos/shared";

const GLOBAL_BOOT_SETUP_TEMPLATE = {
  enabled: true,
  phase: "idle",
  summary: "Boot will simulate installing one package and then run two setup commands.",
  packageName: "@intentos/boot-runtime",
  steps: [
    {
      id: "install-package",
      label: "Installing @intentos/boot-runtime",
      durationMs: 2_000,
    },
    {
      id: "run-command-1",
      label: "Running setup command 1: bootstrap-runtime",
      command: "bootstrap-runtime",
      durationMs: 2_000,
    },
    {
      id: "run-command-2",
      label: "Running setup command 2: start-intent-bridge",
      command: "start-intent-bridge",
      durationMs: 2_000,
    },
  ],
} as const;

function createBootSetupStatus(): BootSetupStatus {
  return {
    ...GLOBAL_BOOT_SETUP_TEMPLATE,
    steps: GLOBAL_BOOT_SETUP_TEMPLATE.steps.map((step) => ({
      ...step,
      state: "pending",
    })),
  };
}

function cloneStatus(status: BootSetupStatus): BootSetupStatus {
  return {
    ...status,
    steps: status.steps.map((step) => ({ ...step })),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type BootSetupListener = (event: BootSetupEvent) => void;

export class BootSetupManager {
  private status: BootSetupStatus;
  private readonly listeners = new Set<BootSetupListener>();
  private started = false;

  constructor(initialStatus: BootSetupStatus = createBootSetupStatus()) {
    this.status = cloneStatus(initialStatus);
  }

  getStatus(): BootSetupStatus {
    return cloneStatus(this.status);
  }

  subscribe(listener: BootSetupListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.started || !this.status.enabled) {
      return;
    }

    this.started = true;
    void this.run();
  }

  private emit(): void {
    const event: BootSetupEvent = {
      type: "boot-status",
      bootSetup: this.getStatus(),
    };

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private updatePhase(phase: BootSetupPhase, summary: string, currentStepId?: string, lastError?: string): void {
    this.status.phase = phase;
    this.status.summary = summary;
    this.status.currentStepId = currentStepId;
    this.status.lastError = lastError;
    this.emit();
  }

  private setStepState(stepId: string, state: BootSetupStatus["steps"][number]["state"]): void {
    this.status.steps = this.status.steps.map((step) =>
      step.id === stepId
        ? {
            ...step,
            state,
          }
        : step,
    );
  }

  private async run(): Promise<void> {
    try {
      for (const step of this.status.steps) {
        const nextPhase: BootSetupPhase =
          step.id === "install-package" ? "installing-package" : "running-commands";
        this.setStepState(step.id, "running");
        this.updatePhase(nextPhase, step.label, step.id);
        await sleep(step.durationMs);
        this.setStepState(step.id, "completed");
        this.emit();
      }

      this.updatePhase("ready", "Boot setup complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Boot setup failed.";
      const currentStepId = this.status.currentStepId;
      if (currentStepId) {
        this.setStepState(currentStepId, "failed");
      }
      this.updatePhase("failed", message, currentStepId, message);
    }
  }
}
