#!/usr/bin/env node

/**
 * Atualiza a seção "Recent Changes" do CLAUDE.md com os últimos 5 commits.
 * Chamado automaticamente pelo git hook post-commit.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const claudeMdPath = path.join(__dirname, '..', 'CLAUDE.md');

if (!fs.existsSync(claudeMdPath)) {
  console.warn('CLAUDE.md not found, skipping update');
  process.exit(0);
}

try {
  // Fetch últimos 5 commits com formato: hash | mensagem | autor | data
  const log = execSync(
    'git log -5 --pretty=format:"%h|%s|%an|%ad" --date=short',
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
  ).trim();

  if (!log) {
    console.log('No commits to report');
    process.exit(0);
  }

  const lines = log.split('\n').map(line => {
    const [hash, msg, author, date] = line.split('|');
    return `- **${date}** — ${msg} (${hash})`;
  });

  const recentChangesSection = `## Recent Commits

${lines.join('\n')}

(Updated automatically by git post-commit hook)
`;

  let content = fs.readFileSync(claudeMdPath, 'utf-8');

  // Substitui a seção "## Recent Commits" se existir, senão adiciona ao final
  const markerStart = '## Recent Commits';
  if (content.includes(markerStart)) {
    const idx = content.indexOf(markerStart);
    // Acha o próximo ## ou final do arquivo
    const nextSection = content.indexOf('\n## ', idx + 1);
    const endIdx = nextSection === -1 ? content.length : nextSection;
    content = content.slice(0, idx) + recentChangesSection + '\n' + content.slice(endIdx);
  } else {
    // Adiciona antes de "## Contribution Approach" ou ao final
    const contribIdx = content.indexOf('## Contribution Approach');
    if (contribIdx !== -1) {
      content = content.slice(0, contribIdx) + recentChangesSection + '\n\n' + content.slice(contribIdx);
    } else {
      content += '\n\n' + recentChangesSection;
    }
  }

  fs.writeFileSync(claudeMdPath, content, 'utf-8');
  console.log('✅ CLAUDE.md updated with recent commits');
} catch (err) {
  // Silenciosamente ignora se git log falhar (e.g., em um repo novo)
  // Não quer bloquear o commit por causa disso
  console.log('Could not update recent commits in CLAUDE.md:', err.message.split('\n')[0]);
}
