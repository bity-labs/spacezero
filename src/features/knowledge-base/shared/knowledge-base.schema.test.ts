import { importKnowledgeBaseImageRequestSchema } from './knowledge-base.schema'

describe('Knowledge Base image IPC schemas', () => {
  it('accepts a typed image payload for a Markdown document', () => {
    const request = {
      documentRelativePath: 'docs/note.md',
      fileName: 'diagram.png',
      bytes: new Uint8Array([0x89, 0x50])
    }

    expect(importKnowledgeBaseImageRequestSchema.parse(request)).toEqual(request)
  })

  it('rejects image file names containing control characters', () => {
    expect(() =>
      importKnowledgeBaseImageRequestSchema.parse({
        documentRelativePath: 'docs/note.md',
        fileName: 'diagram\u0000.png',
        bytes: new Uint8Array([0x89, 0x50])
      })
    ).toThrow()
  })
})
