import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BootService } from '../boot/service.js';

const stepsBodySchema = z.object({
  steps: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    weight: z.number().positive().optional(),
  })).min(1),
});

const stepBodySchema = z.object({
  stepId: z.string().min(1),
  state: z.enum(['pending', 'running', 'ok', 'failed']),
  message: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  updatedAt: z.string().min(1),
});

const completedBodySchema = z.object({
  completedAt: z.string().min(1),
});

const failedBodySchema = z.object({
  stepId: z.string().min(1).optional(),
  reason: z.string().min(1),
  failedAt: z.string().min(1),
});

function getBearerToken(authorization?: string): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

export function registerBootRoutes(app: FastifyInstance, bootService: BootService) {
  app.post('/internal/boot/steps', async (req, reply) => {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return reply.code(401).send({ accepted: false, reason: 'MISSING_BOOT_TOKEN' });
    }

    const payload = stepsBodySchema.parse(req.body);
    const accepted = bootService.handleStepsCallback(token, payload);
    return reply.code(accepted ? 202 : 404).send({ accepted });
  });

  app.post('/internal/boot/step', async (req, reply) => {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return reply.code(401).send({ accepted: false, reason: 'MISSING_BOOT_TOKEN' });
    }

    const payload = stepBodySchema.parse(req.body);
    const accepted = bootService.handleStepCallback(token, payload);
    return reply.code(accepted ? 202 : 404).send({ accepted });
  });

  app.post('/internal/boot/completed', async (req, reply) => {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return reply.code(401).send({ accepted: false, reason: 'MISSING_BOOT_TOKEN' });
    }

    const payload = completedBodySchema.parse(req.body);
    const accepted = bootService.handleCompletedCallback(token, payload);
    return reply.code(accepted ? 202 : 404).send({ accepted });
  });

  app.post('/internal/boot/failed', async (req, reply) => {
    const token = getBearerToken(req.headers.authorization);
    if (!token) {
      return reply.code(401).send({ accepted: false, reason: 'MISSING_BOOT_TOKEN' });
    }

    const payload = failedBodySchema.parse(req.body);
    const accepted = bootService.handleFailedCallback(token, payload);
    return reply.code(accepted ? 202 : 404).send({ accepted });
  });
}
