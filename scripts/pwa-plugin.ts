import { createHash } from 'node:crypto';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

// 빌드가 끝나면 dist 를 훑어 precache 목록과 빌드 해시를 만든다.
// 목록을 손으로 관리하면 반드시 빠뜨린다.
export function pwaPlugin(): Plugin {
  return {
    name: 'zunran-pwa',
    apply: 'build',
    closeBundle() {
      const dist = 'dist';
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const e of readdirSync(dir)) {
          const full = join(dir, e);
          if (statSync(full).isDirectory()) walk(full);
          else files.push('./' + relative(dist, full).split(sep).join('/'));
        }
      };
      walk(dist);

      // sw 자신과 목록 파일은 제외. 1024 아이콘은 스토어 제출용이라 런타임에 쓰이지 않는다.
      const precache = files.filter(
        (f) => !f.endsWith('/sw.js') && !f.endsWith('/precache.json') && !f.endsWith('/icon-1024.png'),
      );
      writeFileSync(join(dist, 'precache.json'), JSON.stringify(['./', ...precache]));

      // 파일명이 아니라 내용으로 해시한다. index.html·manifest 처럼 이름이 고정된 파일이
      // 바뀌어도 캐시가 갱신되어야 한다.
      const h = createHash('sha1');
      for (const f of [...precache].sort()) {
        h.update(f);
        h.update(readFileSync(join(dist, f.replace(/^\.\//, ''))));
      }
      const build = h.digest('hex').slice(0, 12);
      const swPath = join(dist, 'sw.js');
      const sw = readFileSync(swPath, 'utf8');
      if (!sw.includes('__BUILD__')) throw new Error('sw.js 에 __BUILD__ 자리표시자가 없다 — 캐시가 갱신되지 않는다');
      // 전부 바꿔야 한다. String.replace 는 첫 하나만 바꿔서 캐시 이름이 그대로 남는다.
      writeFileSync(swPath, sw.split('__BUILD__').join(build));
      this.info?.(`pwa: precache ${precache.length}개, build ${build}`);
    },
  };
}
