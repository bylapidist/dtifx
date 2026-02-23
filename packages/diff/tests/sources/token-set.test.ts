import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DiagnosticCategories,
  type DiagnosticEvent,
  type DiagnosticsPort,
} from '../../src/application/ports/diagnostics.js';

import {
  createInlineTokenSet,
  createTokenId,
  createTokenSetFromTree,
  loadTokenFile,
} from '../../src/token-set.js';
import * as tokenSetFactoryModule from '../../src/sources/token-set-factory.js';

const { join, resolve } = path;

test('createTokenSetFromTree collects tokens and metadata', () => {
  const set = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $description: 'Brand palette',
          $value: {
            colorSpace: 'srgb',
            components: [0.1, 0.2, 0.3],
            hex: '#1A334D',
          },
          $extensions: { 'example.audit': { status: 'reviewed' } },
          $deprecated: { $replacement: '#/color/brand/secondary' },
          $lastModified: '2024-01-02T12:00:00Z',
          $lastUsed: '2024-01-03T08:30:00Z',
          $usageCount: 12,
          $author: 'Design Systems Team',
          $tags: ['brand', 'primary'],
          $hash: 'abc123ef',
        },
        secondary: {
          $type: 'color',
          $ref: '#/color/brand/primary',
          $description: 'Secondary alias',
        },
      },
    },
    spacing: {
      scale: {
        small: {
          $type: 'dimension',
          $value: {
            dimensionType: 'length',
            value: 4,
            unit: 'px',
          },
          $deprecated: true,
        },
      },
    },
  });

  assert.equal(set.tokens.size, 3);

  const primary = set.tokens.get('#/color/brand/primary');
  assert.ok(primary);
  assert.deepEqual(primary.path, ['color', 'brand', 'primary']);
  assert.equal(primary.type, 'color');
  assert.equal(primary.description, 'Brand palette');
  assert.equal(primary.$lastModified, '2024-01-02T12:00:00Z');
  assert.equal(primary.$lastUsed, '2024-01-03T08:30:00Z');
  assert.equal(primary.$usageCount, 12);
  assert.equal(primary.$author, 'Design Systems Team');
  assert.deepEqual(primary.$tags, ['brand', 'primary']);
  assert.equal(primary.$hash, 'abc123ef');
  assert.deepEqual(primary.value, {
    colorSpace: 'srgb',
    components: [0.1, 0.2, 0.3],
    hex: '#1A334D',
  });
  assert.deepEqual(primary.raw, {
    colorSpace: 'srgb',
    components: [0.1, 0.2, 0.3],
    hex: '#1A334D',
  });
  assert.deepEqual(primary.extensions, {
    'example.audit': { status: 'reviewed' },
  });
  assert.ok(primary.deprecated);
  assert.equal(primary.deprecated.supersededBy?.pointer, '#/color/brand/secondary');

  const secondary = set.tokens.get('#/color/brand/secondary');
  assert.ok(secondary);
  assert.equal(secondary.type, 'color');
  assert.equal(secondary.description, 'Secondary alias');
  assert.deepEqual(secondary.value, {
    colorSpace: 'srgb',
    components: [0.1, 0.2, 0.3],
    hex: '#1A334D',
  });
  assert.equal(secondary.raw, undefined);
  assert.equal(secondary.ref, '#/color/brand/primary');
  assert.deepEqual(secondary.extensions, {});
  assert.ok(
    secondary.references.some((reference) => reference.pointer === '#/color/brand/primary'),
  );

  const small = set.tokens.get('#/spacing/scale/small');
  assert.ok(small);
  assert.equal(small.type, 'dimension');
  assert.deepEqual(small.value, {
    dimensionType: 'length',
    value: 4,
    unit: 'px',
  });
  assert.deepEqual(small.raw, {
    dimensionType: 'length',
    value: 4,
    unit: 'px',
  });
  assert.deepEqual(small.deprecated, {});

  assert.ok(set.resolver);
  const resolution = set.resolver.resolve('#/color/brand/secondary');
  assert.deepEqual(resolution.diagnostics, []);
  assert.deepEqual(resolution.token?.value, {
    colorSpace: 'srgb',
    components: [0.1, 0.2, 0.3],
    hex: '#1A334D',
  });
});

test('createTokenSetFromTree rejects schema violations', () => {
  assert.throws(
    () => {
      createTokenSetFromTree({
        color: {
          invalid: {
            $type: 'color',
            // Invalid because schema requires colour objects, not raw strings.
            $value: '#123456',
          },
        },
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Failed to parse DTIF document/);
      assert.match(error.message, /#\/color\/invalid\/\$value/);
      return true;
    },
  );
});

test('createTokenSetFromTree rejects missing alias targets', () => {
  const diagnostics: Diagnostic[] = [];

  assert.throws(
    () => {
      createTokenSetFromTree(
        {
          color: {
            palette: {
              primary: {
                $type: 'color',
                $ref: '#/color/palette/missing',
              },
            },
          },
        },
        {
          onDiagnostic: (diagnostic) => {
            diagnostics.push(diagnostic);
          },
        },
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Failed to parse DTIF document/);
      assert.match(error.message, /DTIF4010/);
      assert.match(error.message, /#\/color\/palette\/primary\/\$ref/);
      return true;
    },
  );

  assert.ok(diagnostics.length > 0);
  assert.ok(diagnostics.every((diagnostic) => diagnostic.severity === 'error'));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'DTIF4010'));
  assert.ok(
    diagnostics.some((diagnostic) => diagnostic.pointer === '#/color/palette/primary/$ref'),
  );
});

test('createTokenSetFromTree rejects cyclic alias pointers', () => {
  const diagnostics: Diagnostic[] = [];

  assert.throws(
    () => {
      createTokenSetFromTree(
        {
          color: {
            palette: {
              primary: { $type: 'color', $ref: '#/color/palette/secondary' },
              secondary: { $type: 'color', $ref: '#/color/palette/primary' },
            },
          },
        },
        {
          onDiagnostic: (diagnostic) => {
            diagnostics.push(diagnostic);
          },
        },
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Failed to parse DTIF document/);
      assert.match(error.message, /DTIF4010/);
      assert.match(error.message, /#\/color\/palette\/primary/);
      return true;
    },
  );

  assert.ok(diagnostics.length > 0);
  assert.ok(diagnostics.every((diagnostic) => diagnostic.severity === 'error'));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 'DTIF4010'));
  assert.ok(
    diagnostics.some((diagnostic) => diagnostic.pointer === '#/color/palette/primary/$ref'),
  );
});

test('createTokenSetFromTree resolves nested alias chains', () => {
  const set = createTokenSetFromTree({
    color: {
      palette: {
        base: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.15, 0.25, 0.35],
          },
        },
        primary: { $type: 'color', $ref: '#/color/palette/base' },
        secondary: { $type: 'color', $ref: '#/color/palette/primary' },
      },
    },
  });

  const base = set.tokens.get('#/color/palette/base');
  assert.ok(base);
  assert.deepEqual(base.value, { colorSpace: 'srgb', components: [0.15, 0.25, 0.35] });

  const primary = set.tokens.get('#/color/palette/primary');
  assert.ok(primary);
  assert.equal(primary.ref, '#/color/palette/base');
  assert.deepEqual(primary.value, { colorSpace: 'srgb', components: [0.15, 0.25, 0.35] });
  assert.deepEqual(
    primary.appliedAliases.map((alias) => alias.pointer),
    ['#/color/palette/primary'],
  );

  const secondary = set.tokens.get('#/color/palette/secondary');
  assert.ok(secondary);
  assert.equal(secondary.ref, '#/color/palette/primary');
  assert.deepEqual(secondary.value, { colorSpace: 'srgb', components: [0.15, 0.25, 0.35] });
  assert.deepEqual(
    secondary.appliedAliases.map((alias) => alias.pointer),
    ['#/color/palette/secondary', '#/color/palette/primary'],
  );
});

test('createTokenId builds DTIF style identifiers', () => {
  assert.equal(createTokenId(['color', 'brand', 'primary']), '#/color/brand/primary');
  assert.equal(createTokenId([]), '#/');
});

test('loadTokenFile parses DTIF documents with the parser', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dtifx-diff-'));
  const filePath = join(directory, 'tokens.json');
  const document = {
    $schema: 'https://dtif.lapidist.net/schema/v0.2',
    spacing: {
      scale: {
        base: {
          $type: 'dimension',
          $value: {
            dimensionType: 'length',
            value: 4,
            unit: 'px',
          },
        },
      },
    },
  };

  await writeFile(filePath, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8');

  const set = await loadTokenFile(filePath);

  assert.equal(set.tokens.size, 1);
  const token = set.tokens.get('#/spacing/scale/base');
  assert.ok(token);
  assert.equal(token.type, 'dimension');
  assert.deepEqual(token.value, {
    dimensionType: 'length',
    value: 4,
    unit: 'px',
  });
  assert.deepEqual(token.raw, {
    dimensionType: 'length',
    value: 4,
    unit: 'px',
  });

  const tokenDocument = set.document as { uri: URL } | undefined;
  assert.ok(tokenDocument);
  assert.equal(tokenDocument.uri.pathname.endsWith('tokens.json'), true);
  const graph = set.graph as { nodes: Map<string, unknown> } | undefined;
  assert.ok(graph);
  assert.ok(graph.nodes.has('#/spacing/scale/base'));
  assert.ok(set.resolver);
  const resolved = set.resolver.resolve('#/spacing/scale/base');
  assert.deepEqual(resolved.diagnostics, []);
  assert.ok(resolved.token);
  assert.equal(resolved.token.type, 'dimension');
  assert.deepEqual(resolved.token.value, {
    dimensionType: 'length',
    value: 4,
    unit: 'px',
  });
});

test('loadTokenFile reports DTIF diagnostics for invalid documents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dtifx-diff-'));
  const filePath = join(directory, 'invalid.json');
  const document = {
    $schema: 'https://dtif.lapidist.net/schema/v0.2',
    spacing: {
      scale: {
        base: {
          $type: 'dimension',
          $value: {
            dimensionType: 'length',
            value: 4,
            unit: 'px',
          },
        },
        invalid: {
          $type: 'color',
          $value: '#123456',
        },
      },
    },
  };

  await writeFile(filePath, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8');

  await assert.rejects(loadTokenFile(filePath), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Failed to parse DTIF document/);
    assert.match(error.message, /#/);
    return true;
  });
});

test('loadTokenFile forwards parser diagnostics to hooks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dtifx-diff-'));
  const filePath = join(directory, 'invalid.json');
  const document = {
    $schema: 'https://dtif.lapidist.net/schema/v0.2',
    color: {
      swatch: {
        primary: {
          $type: 'color',
          $value: '#ff0000',
        },
        invalid: {
          $type: 'color',
          $ref: '#/color/swatch/missing',
        },
      },
    },
  };

  await writeFile(filePath, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8');

  const diagnostics: Diagnostic[] = [];

  await assert.rejects(
    loadTokenFile(filePath, {
      onDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }),
  );

  assert.ok(diagnostics.length > 0);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.severity === 'error'));
});

test('createInlineTokenSet forwards schema diagnostics to hooks', () => {
  const diagnostics: Diagnostic[] = [];

  assert.throws(
    () => {
      createInlineTokenSet(
        {
          color: {
            invalid: {
              $type: 'color',
              $value: '#654321',
            },
          },
        },
        {
          onDiagnostic: (diagnostic) => {
            diagnostics.push(diagnostic);
          },
        },
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Failed to parse DTIF document/);
      assert.match(error.message, /#\/color\/invalid\/\$value/);
      return true;
    },
  );

  assert.ok(diagnostics.length > 0);
  assert.ok(diagnostics.every((diagnostic) => diagnostic.severity === 'error'));
  assert.ok(diagnostics.every((diagnostic) => diagnostic.code?.startsWith('DTIF')));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.pointer === '#/color/invalid/$value'));
  assert.ok(
    diagnostics.every(
      (diagnostic) => typeof diagnostic.pointer === 'string' && diagnostic.pointer.length > 0,
    ),
  );
});

test('loadTokenFile emits parser diagnostics to diagnostics port', async () => {
  const diagnostic: Diagnostic = {
    code: 'DTIF_WARNING',
    severity: 'warning',
    message: 'Example parser warning',
  } as const;

  const createSpy = vi
    .spyOn(tokenSetFactoryModule.defaultTokenSetFactory, 'createFromInput')
    .mockImplementation(async (_input, options) => {
      options.onDiagnostic?.(diagnostic);
      return { tokens: new Map(), source: 'mock-source' };
    });

  const events: DiagnosticEvent[] = [];
  const diagnosticsPort: DiagnosticsPort = {
    emit(event) {
      events.push(event);
    },
  };

  try {
    await loadTokenFile('tokens.json', { diagnostics: diagnosticsPort });
  } finally {
    createSpy.mockRestore();
  }

  assert.equal(events.length, 1);
  const [event] = events;
  assert.ok(event);
  assert.equal(event?.category, DiagnosticCategories.tokenSourceParser);
  assert.equal(event?.scope, 'token-source.file');
  assert.match(event?.message ?? '', /source:/);
  assert.ok(event?.message?.includes(resolve('tokens.json')));
});

test('TokenSetFactory rejects URL inputs', async () => {
  const factory = new tokenSetFactoryModule.TokenSetFactory();

  await assert.rejects(
    // Cast to bypass compile-time checks and verify the runtime guard.
    factory.createFromInput(new URL('file:///tmp/tokens.json') as unknown as string, {
      label: 'tokens',
    }),
    (error: unknown) => {
      assert.ok(error instanceof TypeError);
      assert.match(error.message, /file path inputs/);
      return true;
    },
  );
});
