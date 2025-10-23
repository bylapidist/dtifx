(() => {
  const data = globalThis.__DTIFX_DOCS__;
  if (!data) {
    console.error('Design token documentation data was not initialised.');
    return;
  }
  let snippetIdCounter = 0;
  const root = document.querySelector('#docs-app');
  if (!root) {
    console.error('Unable to locate documentation root container.');
    return;
  }
  root.innerHTML = '';
  root.append(renderSummary(data));
  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    root.append(renderWarnings(data.warnings));
  }
  if (Array.isArray(data.transforms) && data.transforms.length > 0) {
    root.append(renderTransforms(data.transforms));
  }
  root.append(renderGroups(data.groups, data.assets ?? []));

  function renderSummary(model) {
    const section = createSection('docs-section docs-summary');
    const heading = document.createElement('h2');
    heading.textContent = 'Summary';
    section.append(heading);

    const stats = document.createElement('div');
    stats.className = 'docs-summary__stats';
    section.append(stats);

    appendStat(stats, 'Tokens', model.tokenCount);
    appendStat(stats, 'Groups', model.groupCount);
    appendStat(stats, 'Transforms', model.transformCount);
    appendStat(stats, 'Assets', Array.isArray(model.assets) ? model.assets.length : 0);

    return section;
  }

  function appendStat(container, label, value) {
    const wrapper = document.createElement('dl');
    wrapper.className = 'docs-summary__stat';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    wrapper.append(dt);
    wrapper.append(dd);
    container.append(wrapper);
  }

  function renderWarnings(warnings) {
    const section = createSection('docs-section docs-warning');
    const heading = document.createElement('h2');
    heading.textContent = 'Warnings';
    section.append(heading);
    const list = document.createElement('ul');
    for (const warning of warnings) {
      const li = document.createElement('li');
      li.textContent = warning;
      list.append(li);
    }
    section.append(list);
    return section;
  }

  function renderTransforms(transforms) {
    const section = createSection('docs-section');
    const heading = document.createElement('h2');
    heading.textContent = 'Transforms';
    section.append(heading);
    const list = document.createElement('ul');
    list.className = 'docs-transform-list';
    for (const transform of transforms) {
      const item = document.createElement('li');
      item.textContent = transform;
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function renderGroups(groups, assets) {
    const fragment = document.createDocumentFragment();
    const assetIndex = createAssetIndex(assets);
    for (const group of groups) {
      const section = createSection('docs-section docs-group');
      section.id = `group-${slugify(group.type)}`;

      const header = document.createElement('div');
      header.className = 'docs-group__header';
      const title = document.createElement('h2');
      title.className = 'docs-group__title';
      title.textContent = group.type;
      const count = document.createElement('p');
      count.className = 'docs-group__count';
      count.textContent = formatCount(group.tokenCount, 'token');
      header.append(title);
      header.append(count);
      section.append(header);

      for (const token of group.tokens) {
        section.append(renderToken(token, assetIndex));
      }

      fragment.append(section);
    }

    return fragment;
  }

  function createAssetIndex(assets) {
    const map = new Map();
    if (!Array.isArray(assets)) {
      return map;
    }
    for (const asset of assets) {
      if (asset && typeof asset.outputPath === 'string') {
        map.set(asset.outputPath, asset);
      }
    }
    return map;
  }

  function renderToken(token, assetIndex) {
    const article = document.createElement('article');
    article.className = 'docs-token';
    article.id = `token-${slugify(token.pointer)}`;

    const heading = document.createElement('h3');
    heading.className = 'docs-token__heading';
    heading.textContent = token.name;
    article.append(heading);

    const pointer = document.createElement('p');
    pointer.className = 'docs-token__pointer';
    pointer.textContent = token.pointer;
    article.append(pointer);

    const meta = document.createElement('p');
    meta.className = 'docs-token__meta';
    meta.textContent = formatTokenMeta(token);
    article.append(meta);

    article.append(createDetails('Provenance', token.source));
    if (token.metadata) {
      article.append(createDetails('Metadata', token.metadata));
    }
    if (token.context) {
      article.append(createDetails('Context', token.context));
    }

    const examplesHeading = document.createElement('h3');
    examplesHeading.className = 'docs-token__heading';
    examplesHeading.textContent = 'Examples';
    article.append(examplesHeading);

    for (const example of token.examples) {
      article.append(renderExample(example, assetIndex));
    }

    return article;
  }

  function formatTokenMeta(token) {
    const parts = [];
    if (token.type) {
      parts.push(`Type: ${token.type}`);
    }
    if (Array.isArray(token.path) && token.path.length > 0) {
      parts.push(`Path: ${token.path.join(' › ')}`);
    }
    parts.push(
      `Source: ${token.source.sourceId} › ${token.source.layer} (#${token.source.layerIndex})`,
    );
    return parts.join(' • ');
  }

  function createDetails(label, value) {
    const details = document.createElement('details');
    details.className = 'docs-details';
    const summary = document.createElement('summary');
    summary.textContent = label;
    details.append(summary);
    const pre = document.createElement('pre');
    pre.textContent = stringify(value);
    details.append(pre);
    return details;
  }

  function renderExample(example, assetIndex) {
    const details = document.createElement('details');
    details.className = 'docs-details';
    if (example.kind === 'value') {
      details.open = true;
    }
    const summary = document.createElement('summary');
    summary.textContent = formatExampleLabel(example);
    details.append(summary);

    const pre = document.createElement('pre');
    pre.textContent = stringify(example.payload);
    details.append(pre);

    const snippets = renderSnippetTabs(example.snippets);
    if (snippets) {
      details.append(snippets);
    }

    if (Array.isArray(example.assets) && example.assets.length > 0) {
      details.append(renderAssetList(example.assets, assetIndex));
    }

    return details;
  }

  function formatExampleLabel(example) {
    switch (example.kind) {
      case 'raw': {
        return 'Raw value';
      }
      case 'resolution': {
        return 'Resolved value';
      }
      case 'transform': {
        return `Transform (${example.name})`;
      }
      default: {
        return 'Token value';
      }
    }
  }

  function renderAssetList(assetPaths, assetIndex) {
    const list = document.createElement('ul');
    list.className = 'docs-asset-list';

    for (const assetPath of assetPaths) {
      const item = document.createElement('li');
      item.className = 'docs-asset';
      const asset = assetIndex.get(assetPath);
      if (asset && asset.status === 'copied') {
        const preview = createAssetPreview(asset);
        if (preview) {
          item.append(preview);
        }
        const label = document.createElement('p');
        label.className = 'docs-asset__label';
        label.textContent = asset.fileName;
        label.title = asset.outputPath;
        item.append(label);
      } else {
        const label = document.createElement('p');
        label.className = 'docs-asset__label docs-asset__missing';
        label.textContent = `${assetPath} (missing)`;
        item.append(label);
      }
      list.append(item);
    }

    return list;
  }

  function renderSnippetTabs(snippetList) {
    if (!Array.isArray(snippetList) || snippetList.length === 0) {
      return;
    }

    const snippets = snippetList.filter((snippet) => {
      return snippet && typeof snippet.language === 'string' && typeof snippet.code === 'string';
    });

    if (snippets.length === 0) {
      return;
    }

    const container = document.createElement('div');
    container.className = 'docs-snippet';

    const tabList = document.createElement('div');
    tabList.className = 'docs-snippet__tabs';
    tabList.setAttribute('role', 'tablist');
    container.append(tabList);

    const panels = document.createElement('div');
    panels.className = 'docs-snippet__panels';
    container.append(panels);

    const snippetId = `snippet-${snippetIdCounter++}`;
    const tabs = [];
    const panelsList = [];

    for (const [index, snippet] of snippets.entries()) {
      const tab = document.createElement('button');
      tab.className = 'docs-snippet__tab';
      tab.type = 'button';
      tab.id = `${snippetId}-tab-${index}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      tab.setAttribute('aria-controls', `${snippetId}-panel-${index}`);
      tab.tabIndex = index === 0 ? 0 : -1;
      tab.textContent = formatSnippetLabel(snippet);
      if (index === 0) {
        tab.classList.add('is-active');
      }
      tab.addEventListener('click', () => selectSnippet(index));
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const nextIndex = (index + direction + snippets.length) % snippets.length;
          selectSnippet(nextIndex);
          tabs[nextIndex].focus();
        }
      });
      tabList.append(tab);
      tabs.push(tab);

      const panel = document.createElement('div');
      panel.className = 'docs-snippet__panel';
      panel.id = `${snippetId}-panel-${index}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.hidden = index !== 0;

      const pre = document.createElement('pre');
      pre.className = 'docs-snippet__pre';
      const code = document.createElement('code');
      code.className = `docs-snippet__code language-${snippet.language}`;
      code.textContent = snippet.code;
      pre.append(code);
      panel.append(pre);
      panels.append(panel);
      panelsList.push(panel);
    }

    function selectSnippet(index) {
      for (const [tabIndex, tab] of tabs.entries()) {
        const selected = tabIndex === index;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.classList.toggle('is-active', selected);
        tab.tabIndex = selected ? 0 : -1;
        panelsList[tabIndex].hidden = !selected;
      }
    }

    return container;
  }

  function createAssetPreview(asset) {
    if (asset.kind === 'image') {
      const img = document.createElement('img');
      img.className = 'docs-asset__preview';
      img.src = asset.outputPath;
      img.alt = asset.fileName;
      return img;
    }
    if (asset.kind === 'font') {
      const preview = document.createElement('div');
      preview.className = 'docs-asset__preview';
      preview.textContent = 'Font asset';
      preview.style.fontFamily = asset.fileName;
      return preview;
    }
    if (asset.kind === 'data') {
      const preview = document.createElement('div');
      preview.className = 'docs-asset__preview';
      preview.textContent = 'Data asset';
      return preview;
    }
    return;
  }

  function createSection(className) {
    const section = document.createElement('section');
    section.className = className;
    return section;
  }

  function formatCount(value, unit) {
    const suffix = value === 1 ? unit : `${unit}s`;
    return `${value} ${suffix}`;
  }

  function stringify(value) {
    try {
      return JSON.stringify(value, undefined, 2);
    } catch (error) {
      return String(error);
    }
  }

  function formatSnippetLabel(snippet) {
    if (snippet && typeof snippet.label === 'string' && snippet.label.trim().length > 0) {
      return snippet.label;
    }
    const language = typeof snippet.language === 'string' ? snippet.language : '';
    if (language.length === 0) {
      return 'Snippet';
    }
    return language.charAt(0).toUpperCase() + language.slice(1);
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .replaceAll(/-{2,}/g, '-');
  }
})();
