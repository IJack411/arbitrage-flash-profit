import fs from 'fs';
import path from 'path';

const agentPath = path.resolve('.copilot/agents/serena.agent.md');
const scoutPath = path.resolve('.copilot/agents/arbitrage-scout.agent.md');

function verify(filePath, name) {
  if (fs.existsSync(filePath)) {
    console.log(`${name} exists`);
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(`name: ${name.toLowerCase()}`) && content.includes('web') && content.includes('browser')) {
      console.log(`${name} content verified`);
    } else {
      console.log(`${name} content mismatch`);
    }
  } else {
    console.log(`${name} not found`);
  }
}

verify(agentPath, 'Serena');
verify(scoutPath, 'arbitrage-scout');
