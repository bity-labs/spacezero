import {
  addMarkdownProperty,
  getRichMarkdownLimitation,
  RICH_MARKDOWN_FOOTNOTE_LIMITATION,
  RICH_MARKDOWN_LIMITATION,
  parseMarkdownProperties,
  RICH_MARKDOWN_FRONTMATTER_LIMITATION,
  RICH_MARKDOWN_SYNTAX_LIMITATION,
  splitMarkdownDocument,
  updateMarkdownProperty
} from './knowledge-base-markdown'

describe('Knowledge Base Markdown safety', () => {
  it('separates frontmatter from the editable body without normalizing it', () => {
    const frontmatter = '---\r\ntitle: Durable note\r\n---\r\n\r\n'

    expect(splitMarkdownDocument(`${frontmatter}Body`)).toEqual({
      frontmatter,
      body: 'Body'
    })
  })

  it('reads top-level string properties without changing their YAML representation', () => {
    const markdown = '---\r\nname: "Builder"\r\ndescription: Agent workspace\r\n---\r\n\r\nBody'

    expect(parseMarkdownProperties(markdown)).toEqual({
      status: 'supported',
      properties: [
        { key: 'name', value: 'Builder' },
        { key: 'description', value: 'Agent workspace' }
      ]
    })
    expect(markdown).toBe(
      '---\r\nname: "Builder"\r\ndescription: Agent workspace\r\n---\r\n\r\nBody'
    )
  })

  it('adds an empty string property to a document without frontmatter while preserving its body format', () => {
    const markdown = '\uFEFF# Body\r\n\r\nKeep this line.\r\n'

    expect(addMarkdownProperty(markdown)).toEqual({
      key: 'property',
      markdown: '\uFEFF---\r\nproperty: ""\r\n---\r\n\r\n# Body\r\n\r\nKeep this line.\r\n'
    })
  })

  it('adds a deterministic unique property without overwriting existing keys', () => {
    const markdown = [
      '---',
      'property: one',
      'property-2: two # keep this comment',
      '---',
      '',
      'Body'
    ].join('\r\n')

    expect(addMarkdownProperty(markdown)).toEqual({
      key: 'property-3',
      markdown: [
        '---',
        'property: one',
        'property-2: two # keep this comment',
        'property-3: ""',
        '---',
        '',
        'Body'
      ].join('\r\n')
    })
  })

  it('edits a property key and value without losing comments, line endings, BOM, or body content', () => {
    const markdown = [
      '\uFEFF---',
      'name: "Builder" # keep this comment',
      'description: Workspace',
      '---',
      '',
      '# Body',
      '',
      'Keep this line.'
    ].join('\r\n')

    expect(
      updateMarkdownProperty(markdown, 'name', {
        key: 'displayName',
        value: 'Space Zero'
      })
    ).toEqual({
      ok: true,
      markdown: [
        '\uFEFF---',
        'displayName: "Space Zero" # keep this comment',
        'description: Workspace',
        '---',
        '',
        '# Body',
        '',
        'Keep this line.'
      ].join('\r\n')
    })
  })

  it('quotes edited values when needed to keep them as strings', () => {
    const result = updateMarkdownProperty('---\nenabled: yes\n---\n\nBody', 'enabled', {
      key: 'enabled',
      value: 'true'
    })

    expect(result).toEqual({
      ok: true,
      markdown: '---\nenabled: "true"\n---\n\nBody'
    })
    if (result.ok) {
      expect(parseMarkdownProperties(result.markdown)).toEqual({
        status: 'supported',
        properties: [{ key: 'enabled', value: 'true' }]
      })
    }
  })

  it('rejects empty and duplicate property keys without changing Markdown', () => {
    const markdown = '---\nname: Builder\ndescription: Workspace\n---\n\nBody'

    expect(updateMarkdownProperty(markdown, 'name', { key: ' ', value: 'Changed' })).toEqual({
      ok: false,
      error: 'Property keys cannot be empty.'
    })
    expect(
      updateMarkdownProperty(markdown, 'name', { key: 'description', value: 'Changed' })
    ).toEqual({
      ok: false,
      error: 'A property named "description" already exists.'
    })
    expect(markdown).toBe('---\nname: Builder\ndescription: Workspace\n---\n\nBody')
  })

  it.each([
    ['typed value', '---\ncount: 1\n---\n\nBody'],
    ['nested value', '---\ntags:\n  - knowledge\n---\n\nBody'],
    ['non-mapping YAML', '---\n- knowledge\n---\n\nBody'],
    ['non-string key', '---\n1: one\n---\n\nBody'],
    ['anchor', '---\nname: &label Builder\n---\n\nBody'],
    ['tag', '---\nname: !label Builder\n---\n\nBody'],
    ['malformed YAML', '---\nname: [\n---\n\nBody'],
    ['unclosed frontmatter', '---\nname: Builder\nBody']
  ])('requires source mode for unsupported frontmatter with a %s', (_description, markdown) => {
    expect(parseMarkdownProperties(markdown)).toEqual({ status: 'unsupported', properties: [] })
    expect(getRichMarkdownLimitation(markdown)).toBe(RICH_MARKDOWN_FRONTMATTER_LIMITATION)
  })

  it.each([
    ['string-only YAML frontmatter', '---\nname: Builder\n---\n\nBody', true],
    ['fenced MDX example', '```mdx\n<Callout>Example</Callout>\n```', true],
    ['top-level indented MDX example', '    <Callout>Example</Callout>', true],
    ['inline MDX example', 'Use `<Callout>Example</Callout>` here.', true],
    ['inline MDX expression example', 'Use `{frontmatter.title}` here.', true],
    ['autolink', '<https://example.com>', true],
    ['email autolink', '<builder@example.com>', true],
    ['ordinary Markdown braces', 'Use {workspace} as a placeholder.', false]
  ])('allows rich mode for %s', (_description, markdown, isMdx) => {
    expect(getRichMarkdownLimitation(markdown, { isMdx })).toBeNull()
  })

  it('requires source mode for footnotes that the rich editor cannot preserve', () => {
    const markdown = 'A durable note[^decision].\n\n[^decision]: The supporting context.'

    expect(getRichMarkdownLimitation(markdown)).toBe(RICH_MARKDOWN_FOOTNOTE_LIMITATION)
  })

  it('ignores footnote examples inside code blocks', () => {
    expect(getRichMarkdownLimitation('```md\nA note[^1].\n\n[^1]: Example only.\n```')).toBeNull()
  })

  it.each([
    ['inline math', 'Euler says $e^{i\\pi}+1=0$.'],
    ['block math', '$$\\int_0^1 x^2 dx$$'],
    ['named HTML entities', 'Copyright &copy; 2026.'],
    ['numeric HTML entities', 'Copyright &#169; 2026.'],
    ['hexadecimal HTML entities', 'Copyright &#xA9; 2026.'],
    ['literal backslash commands', 'Use C:\\temp or \\command outside code.'],
    ['escaped heading punctuation', '\\# not a heading'],
    ['escaped emphasis punctuation', '\\*literal stars\\*'],
    ['escaped currency', 'The budget is \\$5.'],
    ['GitHub alerts', '> [!NOTE]\n> Durable context.'],
    ['reference links', '[Notes][durable]\n\n[durable]: https://example.com/notes'],
    ['wiki links', 'See [[Project Notes]].']
  ])('requires source mode for lossy %s syntax', (_description, markdown) => {
    expect(getRichMarkdownLimitation(markdown)).toBe(RICH_MARKDOWN_SYNTAX_LIMITATION)
  })

  it.each([
    ['fenced code', '```tex\nEuler says $e^{i\\pi}+1=0$ &copy;\n```'],
    ['inline code', 'Use `$e^{i\\pi}$` and `&copy;` literally.']
  ])('does not block rich mode for safe %s examples', (_description, markdown) => {
    expect(getRichMarkdownLimitation(markdown)).toBeNull()
  })

  it.each([
    ['list-indented MDX that rich mode would escape', '- item\n    <Callout />'],
    ['tab-padded list-indented MDX that rich mode would escape', '-\titem\n    <Callout />'],
    ['an MDX component', '<Callout>Important</Callout>'],
    ['a multiline MDX component', '<Callout\n  kind="info"\n/>'],
    ['an MDX member component', '<UI.Callout>Important</UI.Callout>'],
    ['an MDX fragment', '<>Important</>'],
    ['an MDX import', "import Callout from './callout'"],
    ['an async MDX export', 'export async function loadData() {}'],
    ['an MDX re-export', "export * from './content'"],
    ['an MDX expression', '{frontmatter.title}'],
    ['escaped braces that rich mode would turn into MDX', '\\{literal\\}'],
    ['an HTML comment', '<!-- keep this comment -->'],
    ['an HTML declaration', '<!doctype html>'],
    ['MDX between mismatched backtick runs', '`<Callout>``']
  ])('requires source mode for %s', (_description, markdown) => {
    expect(getRichMarkdownLimitation(markdown, { isMdx: true })).toBe(RICH_MARKDOWN_LIMITATION)
  })
})
