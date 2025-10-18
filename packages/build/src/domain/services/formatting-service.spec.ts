import path from 'node:path';
import { tmpdir } from 'node:os';

import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it, vi } from 'vitest';

import type {
  FormatterExecution,
  FormatterExecutorPort,
  FormatterPlan,
  FormatterPlannerPort,
  FormattingRequest,
} from '../ports/index.js';
import { FormattingService } from './formatting-service.js';
import { InMemoryDomainEventBus } from '../events/in-memory-domain-event-bus.js';
import type { BuildTokenSnapshot } from '../models/tokens.js';
import type { FileArtifact } from '../../formatter/formatter-registry.js';

describe('FormattingService', () => {
  const pointer = appendJsonPointer(JSON_POINTER_ROOT, 'virtual', 'service');
  const snapshot: BuildTokenSnapshot = {
    id: 'dimension-service',
    path: ['virtual', 'service'],
    type: 'dimension',
    value: { unit: 'pixel', value: 4, dimensionType: 'length' },
    raw: { unit: 'pixel', value: 4, dimensionType: 'length' },
    extensions: {},
    source: {
      uri: 'virtual://service.json',
      line: 1,
      column: 1,
    },
    references: [],
    resolutionPath: [],
    appliedAliases: [],
    pointer,
    sourcePointer: appendJsonPointer(pointer, '$value'),
    token: {
      id: 'dimension-service',
      pointer: appendJsonPointer(pointer, '$value'),
      name: 'dimension.service',
      path: ['virtual', 'service'],
      type: 'dimension',
      value: { unit: 'pixel', value: 4, dimensionType: 'length' },
      raw: { unit: 'pixel', value: 4, dimensionType: 'length' },
    },
    resolution: {
      id: 'dimension-service',
      type: 'dimension',
      value: { unit: 'pixel', value: 4, dimensionType: 'length' },
      raw: { unit: 'pixel', value: 4, dimensionType: 'length' },
      references: [],
      resolutionPath: [],
      appliedAliases: [],
    },
    provenance: {
      sourceId: 'virtual',
      layer: 'test',
      layerIndex: 0,
      uri: 'virtual://service.json',
      pointerPrefix: JSON_POINTER_ROOT,
    },
    context: {},
  };

  it('runs configured formatters and writes artifacts', async () => {
    const artifacts: FileArtifact[] = [
      {
        path: 'tokens.json',
        contents: JSON.stringify({ value: 4 }),
        encoding: 'utf8',
      },
    ];

    const outputBase = tmpdir();

    const plans: FormatterPlan[] = [
      {
        id: 'formatter#0',
        name: 'test.formatter',
        output: {},
        definition: {
          name: 'test.formatter',
          selector: { types: ['dimension'] },
          run: () => artifacts,
        },
      },
    ];

    const planner: FormatterPlannerPort = {
      plan: vi.fn((formatters) => {
        expect(formatters).toBeDefined();
        expect(formatters?.length).toBe(1);
        expect(formatters?.[0]?.name).toBe('test.formatter');
        return plans;
      }),
    };

    const executor: FormatterExecutorPort = {
      execute: vi.fn(async (request) => {
        const [firstPlan] = request.plans;
        expect(firstPlan).toBeDefined();
        const enriched = artifacts.map((artifact) => ({
          ...artifact,
          metadata: {
            formatter: firstPlan?.name ?? 'unknown',
            formatterInstance: firstPlan?.id ?? 'unknown',
          },
        }));
        return {
          executions: [
            {
              id: firstPlan?.id ?? 'unknown',
              name: firstPlan?.name ?? 'unknown',
              artifacts: enriched,
              output: firstPlan?.output ?? {},
            },
          ],
          artifacts: enriched,
        };
      }),
    };

    const writerExecutions: FormatterExecution[][] = [];
    const service = new FormattingService({
      planner,
      executor,
      writer: {
        write: async (executions) => {
          writerExecutions.push([...executions]);
          const [firstExecution] = executions;
          const outputPaths = firstExecution
            ? firstExecution.artifacts.map((artifact) => path.resolve(outputBase, artifact.path))
            : [];
          return new Map([[firstExecution?.id ?? 'unknown', outputPaths]]);
        },
      },
    });

    const request: FormattingRequest = {
      snapshots: [snapshot],
      transforms: [],
      formatters: [{ name: 'test.formatter', output: {} }],
    };

    const result = await service.run(request);

    expect(result.executions).toHaveLength(1);
    const [execution] = result.executions;
    expect(execution?.id).toBe('formatter#0');
    expect(execution?.name).toBe('test.formatter');
    expect(execution?.artifacts).toHaveLength(1);
    expect(result.artifacts).toHaveLength(1);
    expect(writerExecutions).toHaveLength(1);
    expect(writerExecutions[0]).toHaveLength(1);
    const resolvedArtifactPath = path.resolve(outputBase, 'tokens.json');
    expect(execution?.writtenPaths).toEqual([resolvedArtifactPath]);
    expect(result.writes.get('formatter#0')?.[0]).toBe(resolvedArtifactPath);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('uses provided formatter plans when available', async () => {
    const plans: FormatterPlan[] = [
      {
        id: 'formatter#0',
        name: 'test.formatter',
        output: {},
        definition: {
          name: 'test.formatter',
          selector: { types: ['dimension'] },
          run: () => [],
        },
      },
    ];
    const planner: FormatterPlannerPort = {
      plan: vi.fn(() => {
        throw new Error('planner should not be invoked when plans are provided');
      }),
    };
    const executor: FormatterExecutorPort = {
      execute: vi.fn(async (request) => {
        expect(request.plans).toBe(plans);
        return { executions: [], artifacts: [] };
      }),
    };
    const service = new FormattingService({ planner, executor });

    const result = await service.run({
      snapshots: [snapshot],
      transforms: [],
      plans,
    });

    expect(result.executions).toHaveLength(0);
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(planner.plan).not.toHaveBeenCalled();
  });

  it('publishes lifecycle events when running formatters', async () => {
    const events: string[] = [];
    const planner: FormatterPlannerPort = {
      plan: () => [
        {
          id: 'formatter#0',
          name: 'noop',
          output: {},
          definition: {
            name: 'noop',
            selector: { types: ['dimension'] },
            run: () => [],
          },
        },
      ],
    };
    const executor: FormatterExecutorPort = {
      execute: async (request) => {
        expect(request.plans).toHaveLength(1);
        return { executions: [], artifacts: [] };
      },
    };
    const eventBus = new InMemoryDomainEventBus();
    eventBus.subscribe((event) => {
      events.push(event.type);
    });
    const service = new FormattingService({ planner, executor, eventBus });

    await service.run({ snapshots: [snapshot], transforms: [] });

    expect(events).toEqual(['stage:start', 'stage:complete']);
  });
});
