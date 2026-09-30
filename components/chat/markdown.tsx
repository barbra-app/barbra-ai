"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renderer de markdown para los mensajes del chat. Mapea cada elemento
 * a clases de Tailwind que respetan los tokens del design system de
 * Barbra (dark, paleta brand, fuentes display vs sans).
 *
 * Soporta GFM (tablas, strikethrough, autolinks, task lists) via
 * remark-gfm — Claude tiende a usar tablas markdown cuando no encuentra
 * cómo expresar comparativas; ya que no podemos forzarlo a no hacerlo
 * 100% del tiempo, al menos que se vean bien.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[14px] leading-relaxed text-[var(--color-fg)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings — más compactos que defaults para densidad de chat
          h1: ({ children }) => (
            <h1
              className="mt-4 mb-2 text-[20px] font-semibold tracking-tight text-[var(--color-fg)] first:mt-0"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className="mt-4 mb-2 text-[17px] font-semibold tracking-tight text-[var(--color-fg)] first:mt-0"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className="mt-3 mb-1.5 text-[15px] font-semibold tracking-tight text-[var(--color-fg)] first:mt-0"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-3 mb-1 text-[13.5px] font-semibold text-[var(--color-fg)] first:mt-0">
              {children}
            </h4>
          ),

          // Párrafos
          p: ({ children }) => (
            <p className="my-2 first:mt-0 last:mb-0">{children}</p>
          ),

          // Énfasis
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--color-fg)]">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,

          // Listas
          ul: ({ children }) => (
            <ul className="my-2 ml-4 list-disc space-y-1 marker:text-[var(--color-fg-subtle)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1 marker:text-[var(--color-fg-subtle)]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,

          // Links
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-brand-cta)] underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),

          // Code
          code: ({ className, children, ...rest }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-1.5 py-px font-mono text-[12px] text-[var(--color-brand-spark)]"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className} font-mono text-[12px]`} {...rest}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 font-mono text-[12px] text-[var(--color-fg)]">
              {children}
            </pre>
          ),

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[var(--color-brand-spark)] pl-3 italic text-[var(--color-fg-muted)]">
              {children}
            </blockquote>
          ),

          // Horizontal rule
          hr: () => <hr className="my-4 border-0 border-t border-[var(--color-border)]" />,

          // GFM tables — mismo styling que las tablas de DataResult
          table: ({ children }) => (
            <div className="my-3 overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">{children}</table>
              </div>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-elev-2)]">
              {children}
            </tr>
          ),
          th: ({ children, style }) => (
            <th
              className="whitespace-nowrap px-3 py-2 text-left font-medium"
              style={style}
            >
              {children}
            </th>
          ),
          td: ({ children, style }) => {
            // Auto-align números a la derecha + tabular-nums
            const text = typeof children === "string" ? children : "";
            const looksNumeric = /^\s*-?[\$€£]?\s*-?[\d.,]+\s*%?\s*$/.test(text);
            return (
              <td
                className={`whitespace-nowrap px-3 py-2 ${
                  looksNumeric
                    ? "text-right tabular-nums text-[var(--color-fg)]"
                    : "text-[var(--color-fg-muted)]"
                }`}
                style={style}
              >
                {children}
              </td>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
