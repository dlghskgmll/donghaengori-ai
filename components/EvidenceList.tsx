import { FileCheck2 } from "lucide-react";

interface EvidenceListProps {
  items: string[];
}

export function EvidenceList({ items }: EvidenceListProps) {
  if (items.length === 0) return null;

  return (
    <ul className="evidence-list" aria-label="판단 근거">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>
          <FileCheck2 size={14} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
