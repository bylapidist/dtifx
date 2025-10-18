import type {
  FormatterExecution,
  FormatterExecutorPort,
  FormatterExecutorRequest,
  FormatterExecutorResponse,
} from '../../domain/ports/formatters.js';
import {
  createFormatterExecutionContext,
  runFormatterDefinition,
  type FileArtifact,
} from '../../formatter/formatter-registry.js';

export class DefaultFormatterExecutor implements FormatterExecutorPort {
  async execute(request: FormatterExecutorRequest): Promise<FormatterExecutorResponse> {
    if (request.plans.length === 0) {
      return { executions: [], artifacts: [] };
    }
    const context = createFormatterExecutionContext(request.snapshots, request.transforms);
    const executions: FormatterExecution[] = [];
    const artifacts: FileArtifact[] = [];
    for (const plan of request.plans) {
      const results = await runFormatterDefinition(plan.definition, context);
      if (results.length === 0) {
        continue;
      }
      const enriched = results.map((artifact) => {
        const metadata: Record<string, unknown> = artifact.metadata ? { ...artifact.metadata } : {};
        metadata['formatter'] = plan.name;
        metadata['formatterInstance'] = plan.id;
        return { ...artifact, metadata };
      });
      executions.push({ id: plan.id, name: plan.name, artifacts: enriched, output: plan.output });
      artifacts.push(...enriched);
    }
    return { executions, artifacts };
  }
}
