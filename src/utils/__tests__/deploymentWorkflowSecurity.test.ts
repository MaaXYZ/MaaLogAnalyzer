import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const deploymentWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
)

describe('deployment workflow security', () => {
  it('pins the SSH deployment action to an immutable commit', () => {
    expect(deploymentWorkflow).not.toContain('easingthemes/ssh-deploy@main')
    expect(deploymentWorkflow).toMatch(/uses: easingthemes\/ssh-deploy@[0-9a-f]{40}(?:\s+#.*)?$/m)
  })
})
