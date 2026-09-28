import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';

/** 构建期把带 hash 的 JS/CSS 与核心资源写进 SW 预缓存清单（不靠运行时顺手缓存）。
 * closeBundle 在产物全部写入后执行，直接扫描 dist（含 public 拷贝的图片）。 */
function swPrecachePlugin(): Plugin {
  return {
    name: 'sw-precache-inject',
    closeBundle() {
      const root = process.cwd();
      const dist = resolve(root, 'dist');
      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) out.push(...walk(p));
          else out.push(p);
        }
        return out;
      };
      const urls: string[] = ['./', './index.html'];
      for (const abs of walk(dist)) {
        const relPath = relative(dist, abs).split('\\').join('/');
        if (relPath === 'sw.js' || relPath === 'index.html') continue;
        // 音乐等大文件不预缓存（本项目 BGM 为合成器，无音频文件；规则保留）
        if (/\.(mp3|ogg|wav|m4a|webm|mp4)$/i.test(relPath)) continue;
        if (/\.(js|css|jpg|jpeg|png|webp|webmanifest|woff2?)$/i.test(relPath)) {
          urls.push('./' + relPath);
        }
      }
      const buildId = createHash('md5').update(urls.join('|')).digest('hex').slice(0, 8);
      let sw = readFileSync(resolve(root, 'scripts/sw-template.js'), 'utf8');
      sw = sw
        .replace('__CACHE_NAME__', 'pxad-v-' + buildId)
        .replace('__CORE_ASSETS__', JSON.stringify(urls, null, 2));
      writeFileSync(resolve(dist, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [swPrecachePlugin()],
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
