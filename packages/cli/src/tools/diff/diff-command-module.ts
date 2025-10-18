import type { CliCommandModule } from '../../kernel/types.js';
import type { Command } from 'commander';
import { executeDiffCompareCommand } from './compare-command-runner.js';
import { loadDiffPackageVersion } from './diff-package-version.js';

interface DiffCommandOptions {
  readonly version?: boolean;
}

const collectRepeatableOption = (value: string, previous: string[]): string[] => {
  previous.push(value);
  return previous;
};

/**
 * Registers the diff commands under the shared dtifx program, wiring the
 * Commander surface to the shared compare workflow implementation.
 */
export const diffCommandModule: CliCommandModule = {
  id: 'diff.compare',
  register(program, context) {
    const diffPackageVersion = loadDiffPackageVersion();

    const diffCommand = program
      .command('diff')
      .summary('Compare design token sets for changes.')
      .description('Run DTIF diff workflows.');

    diffCommand.helpOption('-h, --help', 'Display diff command help.');
    diffCommand.option('--version', 'Print the installed version of @dtifx/diff.');

    diffCommand.action((options: DiffCommandOptions, command: Command) => {
      if (options.version) {
        const version = diffPackageVersion ?? command.parent?.version();
        if (version) {
          context.io.writeOut(`${version}\n`);
          return;
        }
      }

      command.help();
    });

    const compareCommand = diffCommand
      .command('compare')
      .summary('Compare two DTIF documents and report token changes.')
      .description('Compare design token sets and render a report.');

    compareCommand
      .argument('[previous]', 'Path for the previous token set.')
      .argument('[next]', 'Path for the next token set.');

    compareCommand
      .option('--color', 'Force colored output even when the terminal does not advertise support.')
      .option('--no-color', 'Disable colored output.')
      .option('--unicode', 'Force Unicode glyphs even when terminal fallbacks to ASCII.')
      .option('--no-unicode', 'Force ASCII-safe glyphs even when Unicode is supported.')
      .option(
        '--format <format>',
        'Output format (cli, json, markdown, html, yaml, sarif, template).',
        'cli',
      )
      .option('--output <file>', 'Write the rendered diff to the provided file.')
      .option('--template <file>', 'Handlebars template used when --format template is selected.')
      .option(
        '--template-unsafe-no-escape',
        'Disable Handlebars escaping for template output (dangerous; trusted templates only).',
      )
      .option(
        '--template-partial <name=path>',
        'Register a Handlebars partial when using --format template (repeatable).',
        collectRepeatableOption,
        [],
      )
      .option(
        '--rename-strategy <module>',
        'Custom rename detection strategy module path or package.',
      )
      .option(
        '--impact-strategy <module>',
        'Custom impact classification strategy module path or package.',
      )
      .option('--summary-strategy <module>', 'Custom diff summary strategy module path or package.')
      .option(
        '--filter-type <types>',
        'Filter by token $type (comma-separated or repeatable).',
        collectRepeatableOption,
        [],
      )
      .option(
        '--filter-path <paths>',
        'Filter by JSON pointer prefix (comma-separated or repeatable).',
        collectRepeatableOption,
        [],
      )
      .option(
        '--filter-group <groups>',
        'Filter by token group prefix (comma-separated or repeatable).',
        collectRepeatableOption,
        [],
      )
      .option(
        '--filter-impact <impacts>',
        'Filter by change impact (breaking, non-breaking).',
        collectRepeatableOption,
        [],
      )
      .option(
        '--filter-kind <kinds>',
        'Filter by change type (added, removed, renamed, changed).',
        collectRepeatableOption,
        [],
      )
      .option('--mode <mode>', 'Control report verbosity (full, summary, condensed).')
      .option('--summary', 'Shortcut for --mode summary.')
      .option('--verbose', 'Show extended metadata, diff snippets, and references for each change.')
      .option('--why', 'Explain why each change appears in the report.')
      .option(
        '--diff-context <n>',
        'Number of pointer entries to show for references and related lists.',
      )
      .option('--top-risks <n>', 'Limit how many high-risk changes appear in rollups.')
      .option('--only-breaking', 'Show only removals, renames, and breaking changes.')
      .option('--fail-on-breaking', 'Exit with code 1 when breaking changes are present.', false)
      .option(
        '--no-fail-on-breaking',
        'Allow breaking changes without forcing a non-zero exit code.',
      )
      .option('--fail-on-changes', 'Exit with code 1 when any token changes are present.', false)
      .option('--no-fail-on-changes', 'Allow token changes without forcing a non-zero exit code.')
      .option('--no-links', 'Disable terminal hyperlinks even when supported.')
      .option('--quiet', 'Suppress parser diagnostics.');

    compareCommand.action(async (previous, next, _options, command) => {
      await executeDiffCompareCommand({
        previous,
        next,
        command: command as Command,
        io: context.io,
      });
    });
  },
};
