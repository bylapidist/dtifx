import { describe, expect, it, vi } from 'vitest';

import type { DomainEventBusPort } from '../runtime/index.js';
import { TokenResolutionService } from './token-resolution-service.js';
import type { ParserPort } from './parser.js';
import type { TokenSourcePlan } from './config.js';

describe('TokenResolutionService', () => {
  it('publishes a stage:error event when parsing fails', async () => {
    const error = new Error('parse failure');
    const parser: ParserPort = {
      parse: vi.fn().mockRejectedValue(error),
    };
    const publish = vi.fn().mockResolvedValue();
    const eventBus: DomainEventBusPort = {
      publish,
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    };
    const service = new TokenResolutionService({ parser, eventBus });

    const plan: TokenSourcePlan = { entries: [], createdAt: new Date() };

    await expect(service.resolve(plan)).rejects.toThrow(error);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'stage:start',
        payload: expect.objectContaining({ stage: 'resolution' }),
      }),
    );
    expect(publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'stage:error',
        payload: expect.objectContaining({
          stage: 'resolution',
          error,
          timestamp: expect.any(Date),
        }),
      }),
    );
  });
});
