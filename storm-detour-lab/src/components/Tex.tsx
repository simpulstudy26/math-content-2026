import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';

/** LaTeX 수식 (KaTeX). block = 가운데 정렬 별행 수식 */
export function Tex({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: block, throwOnError: false, strict: 'ignore', output: 'html' }),
    [children, block],
  );
  return <span className={block ? 'tex-block' : 'tex-inline'} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 숫자를 수식용 문자열로 (음수는 괄호 없이 −) */
export const tn = (x: number, d = 2) => {
  const s = Math.abs(x).toFixed(d);
  return x < 0 ? `-${s}` : s;
};
/** 제곱할 때 음수면 괄호 */
export const tsq = (x: number, d = 1) => (x < 0 ? `(${tn(x, d)})^2` : `${tn(x, d)}^2`);
