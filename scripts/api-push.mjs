// 通过 GitHub Git Data API 推送（绕过被重置的 git https 直连）
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const OWNER = 'zheng199508';
const REPO = 'rebate-tycoon';
const BRANCH = 'main';
const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
const api = async (path, opts = {}) => {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'api-push' },
    ...opts,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const files = execSync('git -c core.quotepath=false ls-files', { encoding: 'utf8' }).trim().split('\n');

// 空仓库先用 Contents API 初始化一个提交（Git Data API 不允许在空仓库建 blob）
try {
  await api('/contents/README.md');
} catch {
  await api('/contents/README.md', {
    method: 'PUT',
    body: JSON.stringify({
      message: 'init',
      content: Buffer.from('# rebate-tycoon\n').toString('base64'),
    }),
  });
}

const tree = [];
for (const f of files) {
  const content = readFileSync(f).toString('base64');
  const blob = await api('/git/blobs', { method: 'POST', body: JSON.stringify({ content, encoding: 'base64' }) });
  tree.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
}
const newTree = await api('/git/trees', { method: 'POST', body: JSON.stringify({ tree }) });

let parent = null;
try {
  const ref = await api(`/git/ref/heads/${BRANCH}`);
  parent = ref.object.sha;
} catch { /* 空仓库，无父提交 */ }

const commit = await api('/git/commits', {
  method: 'POST',
  body: JSON.stringify({
    message: '返利神豪像素游戏：完整可玩切片',
    tree: newTree.sha,
    parents: parent ? [parent] : [],
  }),
});

try {
  await api(`/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
} catch {
  await api('/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }),
  });
}
console.log('pushed via API:', commit.sha);
