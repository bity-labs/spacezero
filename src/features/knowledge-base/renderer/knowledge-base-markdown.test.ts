import {
  getRichMarkdownLimitation,
  RICH_MARKDOWN_FOOTNOTE_LIMITATION,
  RICH_MARKDOWN_LIMITATION,
  splitMarkdownDocument
} from './knowledge-base-markdown'

describe('Knowledge Base Markdown safety', () => {
  it('separates frontmatter from the editable body without normalizing it', () => {
    const frontmatter = '---\r\ntitle: Durable note\r\n---\r\n\r\n'

    expect(splitMarkdownDocument(`${frontmatter}Body`)).toEqual({
      frontmatter,
      body: 'Body'
    })
  })

  it.each([
    ['YAML frontmatter', '---\nmetadata: { kind: note }\n---\n\nBody', true],
    ['fenced MDX example', '```mdx\n<Callout>Example</Callout>\n```', true],
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

    expect(getRichMarkdownLimitation(markdown)).toBe(
      RICH_MARKDOWN_FOOTNOTE_LIMITATION
    )
  })

  it('ignores footnote examples inside code blocks', () => {
    expect(
      getRichMarkdownLimitation('```md\nA note[^1].\n\n[^1]: Example only.\n```')
    ).toBeNull()
  })

  it.each([
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
