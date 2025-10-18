import type { FormatterInstanceConfig } from '../../config/index.js';
import type { FormatterDefinition } from '../../formatter/formatter-registry.js';
import type {
  FormatterDefinitionFactoryContext,
  FormatterDefinitionFactoryRegistry,
} from '../../formatter/formatter-factory.js';
import type { FormatterPlan, FormatterPlannerPort } from '../../domain/ports/formatters.js';

export interface DefaultFormatterRegistryOptions {
  readonly definitions?: readonly FormatterDefinition[];
  readonly definitionRegistry?: FormatterDefinitionFactoryRegistry;
  readonly definitionContext?: FormatterDefinitionFactoryContext;
}

export class DefaultFormatterRegistry implements FormatterPlannerPort {
  private readonly definitions: ReadonlyMap<string, FormatterDefinition> | undefined;

  private readonly registry: FormatterDefinitionFactoryRegistry | undefined;

  private readonly context: FormatterDefinitionFactoryContext | undefined;

  constructor(options: DefaultFormatterRegistryOptions = {}) {
    const { definitions, definitionRegistry, definitionContext } = options;

    if (definitions === undefined) {
      this.registry = definitionRegistry;
      this.context = definitionContext;
      return;
    }

    const entries = definitions.map((definition) => [definition.name, definition] as const);
    this.definitions = new Map(entries);
  }

  plan(formatters: readonly FormatterInstanceConfig[] | undefined): readonly FormatterPlan[] {
    if (formatters === undefined || formatters.length === 0) {
      return [];
    }
    if (this.definitions !== undefined) {
      return this.planWithDefinitions(formatters);
    }
    if (this.registry === undefined) {
      throw new Error('Formatter registry has not been configured.');
    }
    if (this.context === undefined) {
      throw new Error('Formatter registry context has not been configured.');
    }
    return this.planWithFactories(formatters, this.registry, this.context);
  }

  private planWithDefinitions(
    formatters: readonly FormatterInstanceConfig[],
  ): readonly FormatterPlan[] {
    const plans: FormatterPlan[] = [];
    for (const [index, config] of formatters.entries()) {
      const definition = this.definitions!.get(config.name);
      if (!definition) {
        throw new Error(`Formatter "${config.name}" is not registered.`);
      }
      plans.push({
        id: config.id ?? `${config.name}#${index.toString(10)}`,
        name: config.name,
        definition,
        output: config.output,
      });
    }
    return plans;
  }

  private planWithFactories(
    formatters: readonly FormatterInstanceConfig[],
    registry: FormatterDefinitionFactoryRegistry,
    context: FormatterDefinitionFactoryContext,
  ): readonly FormatterPlan[] {
    const plans: FormatterPlan[] = [];
    for (const [index, config] of formatters.entries()) {
      const factory = registry.resolve(config.name);
      if (factory === undefined) {
        throw new Error(`Formatter "${config.name}" is not registered.`);
      }
      const definition = factory.create(config, context);
      plans.push({
        id: config.id ?? `${config.name}#${index.toString(10)}`,
        name: config.name,
        definition,
        output: config.output,
      });
    }
    return plans;
  }
}
