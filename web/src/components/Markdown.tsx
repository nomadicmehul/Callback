import { miniMarkdown } from '../lib/ui';

export function Md({ source }: { source: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: miniMarkdown(source) }} />;
}
