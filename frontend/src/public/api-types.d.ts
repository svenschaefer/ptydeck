/* Auto-generated from backend/openapi/openapi.yaml. Do not edit manually. */

export type Session = {
  id: string;
  cwd: string;
  shell: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateSessionRequest = {
  cwd?: string;
  shell?: string;
};

export type ErrorResponse = {
  error: string;
  message: string;
};
