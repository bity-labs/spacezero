import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FilesTabIcon } from './files-tab-icon'

describe('FilesTabIcon', () => {
  it.each([
    ['component.tsx', 'tsx'],
    ['styles.css', 'css'],
    ['README.md', 'md'],
    ['unknown.custom', 'file']
  ])('renders the matching icon for %s', (fileName, expectedType) => {
    const { container } = render(<FilesTabIcon fileName={fileName} />)

    expect(container.querySelector('svg')).toHaveAttribute('data-file-type', expectedType)
  })
})
