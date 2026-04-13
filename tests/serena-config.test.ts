import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Serena Agent Configuration', () => {
  const agentPath = path.resolve(__dirname, '../.copilot/agents/serena.agent.md');

  test('should have the correct agent configuration file', async () => {
    // 1. Verify file exists
    const fileExists = fs.existsSync(agentPath);
    expect(fileExists).toBe(true);

    // 2. Read file content
    const content = fs.readFileSync(agentPath, 'utf-8');

    // 3. Verify core metadata
    expect(content).toContain('name: serena');
    expect(content).toContain('description: A global background agent dedicated to continuous system improvement');
    
    // 4. Verify tool access (especially the 'agent' tool for swarm capabilities)
    expect(content).toContain("tools: ['vscode', 'execute', 'read', 'agent', 'edit', 'search', 'web', 'todo', 'browser']");
  });

  test('should contain collaborative intelligence section', async () => {
    const content = fs.readFileSync(agentPath, 'utf-8');
    expect(content).toContain('## Collaborative Intelligence');
    expect(content).toContain('Serena has the unique capability to query other specialized agents');
  });
});
