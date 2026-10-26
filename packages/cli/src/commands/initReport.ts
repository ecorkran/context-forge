import { INIT_REPORT_VERSION } from '@context-forge/core/node';
import { anyStepFailed, type StepResult } from './initSteps.js';

export type Registration = 'created' | 'existing';

/** The `cf init --json` success shape (slice 271 D8). A failed step is `ok: false`, not an error envelope. */
export interface InitReport {
  reportVersion: typeof INIT_REPORT_VERSION;
  projectId: string;
  projectName: string;
  projectPath: string;
  registration: Registration;
  steps: StepResult[];
  notices: string[];
  ok: boolean;
}

export function buildInitReport(input: {
  project: { id: string; name: string };
  projectPath: string;
  registration: Registration;
  steps: StepResult[];
  notices: string[];
}): InitReport {
  return {
    reportVersion: INIT_REPORT_VERSION,
    projectId: input.project.id,
    projectName: input.project.name,
    projectPath: input.projectPath,
    registration: input.registration,
    steps: input.steps,
    notices: input.notices,
    ok: !anyStepFailed(input.steps),
  };
}
