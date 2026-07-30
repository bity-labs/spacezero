import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatInput } from './chat-input'

describe('ChatInput', () => {
  it('applies custom composer surface styles to the bordered input group', () => {
    render(<ChatInput className="rounded-2xl bg-muted/80" onSubmit={vi.fn()} />)

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    const inputGroup = input.closest('[data-slot="input-group"]')
    const form = input.closest('form')

    expect(inputGroup).toHaveClass('rounded-2xl', 'bg-muted/80')
    expect(form).not.toHaveClass('rounded-2xl', 'bg-muted/80')
  })

  it('submits entered text with Enter and clears the input', async () => {
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '  hello agent  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'hello agent',
      files: [],
      modelId: undefined
    })
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('keeps a newline on Shift+Enter without submitting', () => {
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(handleSubmit).not.toHaveBeenCalled()
    expect(input).toHaveValue('hello')
  })

  it('discovers and submits /clear as a command distinct from skills', async () => {
    const handleCommand = vi.fn(async () => undefined)
    const handleSubmit = vi.fn()
    render(
      <ChatInput
        commands={[{ name: 'clear', description: 'Start a fresh chat.' }]}
        skills={[{ name: 'cleanup', description: 'Clean generated files.', scope: 'project' }]}
        onCommand={handleCommand}
        onSubmit={handleSubmit}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/cl' } })

    const command = screen.getByRole('option', { name: /Clear.*Start a fresh chat/i })
    expect(command).toHaveAttribute('data-suggestion-kind', 'command')
    expect(command).not.toHaveTextContent('/clear')
    expect(command.querySelector('[data-command-icon="true"]')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /cleanup/ })).toHaveAttribute(
      'data-suggestion-kind',
      'skill'
    )

    fireEvent.change(input, { target: { value: '/clear' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(handleCommand).toHaveBeenCalledWith('clear'))
    expect(handleSubmit).not.toHaveBeenCalled()
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('discovers /resume with a command-style icon', () => {
    render(
      <ChatInput
        commands={[{ name: 'resume', description: 'Continue an older Chat Context.' }]}
        onCommand={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: '/res' }
    })

    const option = screen.getByRole('option', { name: /Resume.*Continue an older Chat Context/i })
    expect(option).toHaveAttribute('data-suggestion-kind', 'command')
    expect(option).not.toHaveTextContent('/resume')
    expect(option.querySelector('[data-command-icon="true"]')).toBeInTheDocument()
  })

  it('shows Chat Context history with file icons, one-line prompts, and creation metadata', () => {
    render(
      <ChatInput
        historyItems={[
          {
            id: 'chat-context-older',
            initialPrompt: 'Explain the architecture with implementation details.',
            createdAt: '2026-07-19T08:30:00.000Z'
          }
        ]}
        onHistorySelect={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    const option = screen.getByRole('option', {
      name: /Explain the architecture with implementation details/i
    })
    expect(option.querySelector('[data-chat-history-icon="true"]')).toBeInTheDocument()
    expect(option).toHaveTextContent(/Jul 19, 2026/i)
    expect(screen.getByText('Explain the architecture with implementation details.')).toHaveClass(
      'truncate'
    )
  })

  it('discovers skills from slash commands and submits the native Pi command', () => {
    const handleSubmit = vi.fn()
    render(
      <ChatInput
        skills={[
          {
            name: 'code-review',
            description: 'Review code changes.',
            scope: 'spacezero'
          },
          {
            name: 'debug',
            description: 'Investigate a failing behavior.',
            scope: 'project'
          }
        ]}
        onSubmit={handleSubmit}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/' } })

    const codeReviewOption = screen.getByRole('option', { name: /code-review/ })
    expect(codeReviewOption).toBeInTheDocument()
    expect(codeReviewOption).not.toHaveTextContent('/skill:code-review')
    expect(codeReviewOption.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /debug/ })).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '/skill:' } })

    expect(screen.getByRole('option', { name: /code-review/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /debug/ })).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input).toHaveValue('/skill:debug')
    expect(handleSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleSubmit).toHaveBeenCalledWith({
      text: '/skill:debug',
      files: [],
      modelId: undefined
    })
  })

  it('shows every available skill for an empty command', () => {
    const skills = Array.from({ length: 9 }, (_, index) => ({
      name: `skill-${index + 1}`,
      description: `Skill ${index + 1}.`,
      scope: 'user' as const
    }))
    render(<ChatInput skills={skills} onSubmit={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: '/' }
    })

    expect(screen.getAllByRole('option')).toHaveLength(skills.length)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: '/skill:' }
    })

    expect(screen.getAllByRole('option')).toHaveLength(skills.length)
  })

  it('keeps the skill list open and filters shorthand slash queries', async () => {
    render(
      <ChatInput
        skills={[
          { name: 'format', description: 'Format source files.', scope: 'spacezero' },
          { name: 'debug', description: 'Investigate behavior.', scope: 'project' }
        ]}
        onSubmit={vi.fn()}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    await userEvent.type(input, '/f')

    expect(input).toHaveValue('/f')
    expect(screen.getByRole('option', { name: /format/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /debug/ })).not.toBeInTheDocument()
  })

  it('filters skill suggestions on every keystroke, including case-insensitive names', async () => {
    render(
      <ChatInput
        skills={[
          { name: 'CodeReview', description: 'Review code changes.', scope: 'spacezero' },
          { name: 'Debug', description: 'Investigate a failing behavior.', scope: 'project' }
        ]}
        onSubmit={vi.fn()}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    await userEvent.type(input, '/skill:')
    expect(screen.getAllByRole('option')).toHaveLength(2)

    await userEvent.type(input, 'cod')

    expect(input).toHaveValue('/skill:cod')
    expect(screen.getByRole('option', { name: /CodeReview/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Debug/ })).not.toBeInTheDocument()
  })

  it('matches skill descriptions and hides unrelated or unmatched queries', () => {
    render(
      <ChatInput
        skills={[
          { name: 'code-review', description: 'Review code changes.', scope: 'spacezero' },
          { name: 'debug', description: 'Investigate a failing behavior.', scope: 'project' }
        ]}
        onSubmit={vi.fn()}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/skill:investigate' } })
    expect(screen.getByRole('option', { name: /debug/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /code-review/ })).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: '/skill:not-a-skill' } })
    expect(screen.queryByRole('listbox', { name: 'Available skills' })).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'unrelated prompt' } })
    expect(screen.queryByRole('listbox', { name: 'Available skills' })).not.toBeInTheDocument()
  })

  it('selects the filtered skill and submits the native Pi command', () => {
    const handleSubmit = vi.fn()
    render(
      <ChatInput
        skills={[
          { name: 'code-review', description: 'Review code changes.', scope: 'spacezero' },
          { name: 'debug', description: 'Investigate a failing behavior.', scope: 'project' }
        ]}
        onSubmit={handleSubmit}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/skill:deb' } })
    fireEvent.keyDown(input, { key: 'Tab' })

    expect(input).toHaveValue('/skill:debug')
    expect(handleSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleSubmit).toHaveBeenCalledWith({
      text: '/skill:debug',
      files: [],
      modelId: undefined
    })
  })

  it('updates filtering when the input event changes the command', () => {
    render(
      <ChatInput
        skills={[
          { name: 'alpha', description: 'First skill.', scope: 'user' },
          { name: 'beta', description: 'Second skill.', scope: 'user' }
        ]}
        onSubmit={vi.fn()}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.input(input, { target: { value: '/' } })
    expect(screen.getAllByRole('option')).toHaveLength(2)

    fireEvent.input(input, { target: { value: '/skill:bet' } })
    expect(screen.getByRole('option', { name: /beta/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /alpha/ })).not.toBeInTheDocument()
  })

  it('submits entered text with the submit button', () => {
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'run checks' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(handleSubmit).toHaveBeenCalledWith({ text: 'run checks', files: [], modelId: undefined })
  })

  it('includes attachments and selected model in submitted input', () => {
    const handleSubmit = vi.fn()
    const file = new File(['hello'], 'context.txt', { type: 'text/plain' })
    render(
      <ChatInput
        models={[{ id: 'sonnet', label: 'Claude Sonnet', provider: 'anthropic' }]}
        onSubmit={handleSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText('Upload files'), { target: { files: [file] } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'use this context' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'use this context',
      files: [file],
      modelId: 'sonnet'
    })
  })

  it('lists Agent Definitions in the fresh-session picker and submits the selected definition', async () => {
    const handleSubmit = vi.fn()
    render(
      <ChatInput
        agentDefinitions={[
          {
            id: 'reviewer',
            name: 'Reviewer',
            description: 'Review code changes.',
            scope: 'bundled'
          },
          {
            id: 'scout',
            name: 'Scout',
            description: 'Research the codebase.',
            scope: 'user'
          }
        ]}
        onAgentDefinitionChange={vi.fn()}
        onSubmit={handleSubmit}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Agent Definition: None' }))
    await userEvent.click(screen.getByRole('option', { name: /Reviewer/ }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'review this' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'review this',
      files: [],
      modelId: undefined,
      agentDefinitionId: 'reviewer'
    })
  })

  it('renders a read-only active Agent Definition chip after the picker locks', () => {
    render(
      <ChatInput
        agentDefinitions={[
          {
            id: 'reviewer',
            name: 'Reviewer',
            description: 'Review code changes.',
            scope: 'bundled'
          }
        ]}
        agentDefinitionLocked={true}
        activeAgentDefinition={{ id: 'reviewer', name: 'Reviewer' }}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByText('Reviewer')).toBeInTheDocument()
    expect(screen.getByText('Agent Definition')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agent Definition:/ })).not.toBeInTheDocument()
  })

  it('disables input and renders a stop button while a turn is running', () => {
    const handleSubmit = vi.fn()
    const handleAbort = vi.fn()
    render(<ChatInput status="streaming" onSubmit={handleSubmit} onAbort={handleAbort} />)

    expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }))

    expect(handleAbort).toHaveBeenCalledOnce()
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('renders thinking selection next to composer tools', () => {
    const handleThinkingChange = vi.fn()
    render(
      <ChatInput
        thinkingLevel="medium"
        onThinkingChange={handleThinkingChange}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Thinking: Medium' }))

    expect(handleThinkingChange).toHaveBeenCalledWith('high')
  })

  it('limits thinking selection to the selected model supported levels', () => {
    const handleThinkingChange = vi.fn()
    render(
      <ChatInput
        models={[
          {
            id: 'limited-reasoning',
            label: 'Limited Reasoning',
            supportedThinkingLevels: ['off', 'low']
          }
        ]}
        selectedModelId="limited-reasoning"
        thinkingLevel="medium"
        onThinkingChange={handleThinkingChange}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Thinking: Low' }))

    expect(handleThinkingChange).toHaveBeenCalledWith('off')
  })

  it('shows only Off for non-reasoning models', () => {
    const handleThinkingChange = vi.fn()
    render(
      <ChatInput
        models={[{ id: 'fast', label: 'Fast', supportedThinkingLevels: ['off'] }]}
        selectedModelId="fast"
        thinkingLevel="high"
        onThinkingChange={handleThinkingChange}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Thinking: Off' }))

    expect(handleThinkingChange).toHaveBeenCalledWith('off')
  })

  it('shows Max for max-capable models after X-High', () => {
    const handleThinkingChange = vi.fn()
    render(
      <ChatInput
        models={[
          {
            id: 'max-reasoning',
            label: 'Max Reasoning',
            supportedThinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
          }
        ]}
        selectedModelId="max-reasoning"
        thinkingLevel="xhigh"
        onThinkingChange={handleThinkingChange}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Thinking: X-High' }))

    expect(handleThinkingChange).toHaveBeenCalledWith('max')
  })

  it('selects a model via keyboard when the selector is open', async () => {
    const handleModelChange = vi.fn()
    render(
      <ChatInput
        models={[{ id: 'sonnet', label: 'Claude Sonnet', provider: 'anthropic' }]}
        onModelChange={handleModelChange}
        onSubmit={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Claude Sonnet/i }))
    await userEvent.keyboard('Claude')
    await userEvent.keyboard('{Enter}')

    expect(handleModelChange).toHaveBeenCalledWith('sonnet')
  })

  it('opens Knowledge Base mention suggestions as soon as @kb is typed', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.files.listDirectory = async ({ relativePath }) =>
      relativePath === ''
        ? [{ name: 'README.md', relativePath: 'README.md', kind: 'file' }]
        : []

    render(<ChatInput onSubmit={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'Review @kb' }
    })

    expect(await screen.findByRole('listbox', { name: 'Knowledge Base paths' })).toHaveClass(
      'absolute',
      'bottom-full',
      'rounded-xl'
    )
    expect(await screen.findByRole('option', { name: /README\.md/ })).toBeInTheDocument()
  })

  it('autocompletes Knowledge Base file and folder mentions with relative paths', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    const listDirectory = vi.fn(async ({ relativePath }: { relativePath: string }) =>
      relativePath === ''
        ? [{ name: 'decisions', relativePath: 'decisions', kind: 'directory' as const }]
        : [
            {
              name: 'architecture.md',
              relativePath: 'decisions/architecture.md',
              kind: 'file' as const
            }
          ]
    )
    window.spacezero.files.listDirectory = listDirectory
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Agent prompt' })

    fireEvent.change(input, { target: { value: 'Review @kb/decisions/' } })

    const architectureOption = await screen.findByRole('option', {
      name: /architecture\.md.*decisions\/architecture\.md/i
    })
    expect(architectureOption).toBeInTheDocument()
    expect(architectureOption.querySelector('[data-knowledge-base-icon="true"]')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /decisions.*decisions\//i })).toBeInTheDocument()
    expect(listDirectory).toHaveBeenCalledWith({
      context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
      relativePath: ''
    })
    expect(listDirectory).toHaveBeenCalledWith({
      context: { kind: 'knowledge-base', contextKey: 'knowledge-base' },
      relativePath: 'decisions'
    })
    fireEvent.click(screen.getByRole('option', { name: /decisions.*decisions\//i }))
    expect(input).toHaveValue('Review @kb/decisions/ ')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'Review @kb/decisions/',
      files: [],
      modelId: undefined
    })
    expect(JSON.stringify(handleSubmit.mock.calls)).not.toContain('architecture.md')
  })

  it('encodes spaces when autocompleting Knowledge Base mentions', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.files.listDirectory = async ({ relativePath }) =>
      relativePath === ''
        ? [{ name: 'Design Notes', relativePath: 'Design Notes', kind: 'directory' }]
        : [{ name: 'README.md', relativePath: 'Design Notes/README.md', kind: 'file' }]
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Agent prompt' })

    fireEvent.change(input, { target: { value: 'Review @kb/Design' } })
    fireEvent.click(await screen.findByRole('option', { name: /README\.md.*Design Notes\/README\.md/i }))

    expect(input).toHaveValue('Review @kb/Design%20Notes/README.md ')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'Review @kb/Design%20Notes/README.md',
      files: [],
      modelId: undefined
    })
  })

  it('prompts setup when @kb autocomplete is used before configuration', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({ setupState: 'unconfigured' })
    render(<ChatInput onSubmit={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'Read @kb/notes' }
    })

    expect(
      await screen.findByText('Knowledge Base is not configured. Open Knowledge Base to set it up.')
    ).toBeInTheDocument()
  })

  it('falls back to the first available model when models arrive after mount', () => {
    const handleSubmit = vi.fn()
    const { rerender } = render(<ChatInput models={[]} onSubmit={handleSubmit} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'hello' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(handleSubmit).toHaveBeenCalledWith({ text: 'hello', files: [], modelId: undefined })

    rerender(
      <ChatInput
        models={[{ id: 'sonnet', label: 'Claude Sonnet', provider: 'anthropic' }]}
        onSubmit={handleSubmit}
      />
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'hello again' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'hello again',
      files: [],
      modelId: 'sonnet'
    })
  })
})
