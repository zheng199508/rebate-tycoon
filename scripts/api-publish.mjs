// 把某个目录的内容作为一个无父提交发布到指定分支（用于 gh-pages）
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const [dir, branch] = process.argv.slice(2);
const OWNER = 'zheng199508';
const REPO = 'rebate-tycoon';
const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
const api = async (path, opts = {}) => {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'api-publish' },
    ...opts,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const walk = (d) => {
  const out = [];
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

const tree = [];
for (const abs of walk(dir)) {
  const relPath = relative(dir, abs).split('\\').join('/');
  const blob = await api('/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content: readFileSync(abs).toString('base64'), encoding: 'base64' }),
  });
  tree.push({ path: relPath, mode: '100644', type: 'blob', sha: blob.sha });
}
const newTree = await api('/git/trees', { method: 'POST', body: JSON.stringify({ tree }) });
const commit = await api('/git/commits', {
  method: 'POST',
  body: JSON.stringify({ message: `publish ${branch}`, tree: newTree.sha, parents: [] }),
});
try {
  await api(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: true }) });
} catch {
  await api('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) });
}
console.log('published', branch, commit.sha);
